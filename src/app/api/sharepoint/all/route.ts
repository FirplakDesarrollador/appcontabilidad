import { NextResponse } from 'next/server';
import { fetchAllSharePointItems } from '@/lib/sharepoint';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const refresh = searchParams.get('refresh') === 'true';
        const limit = parseInt(searchParams.get('limit') || '0');
        const offset = parseInt(searchParams.get('offset') || '0');

        if (!refresh) {
            console.log(`[API] Fetching invoices from Supabase (Parallel & Selective, offset=${offset}, limit=${limit})...`);
            
            // Definimos las columnas esenciales para reducir el tamaño del payload
            const columns = 'ID, Nit, Proveedor, Nro_Factura, Aprobacion_Doliente, Gestion_Contabilidad, Responsable_de_Autorizar, Valor total, Creado, sharepoint_id, documentos, Attachments, FechaAprobacion';

            let allData: any[] = [];

            if (limit > 0) {
                // Caso de carga rápida específica
                const { data, error } = await supabase
                    .from('Registro_Facturas')
                    .select(columns)
                    .order('ID', { ascending: false })
                    .range(offset, offset + limit - 1);
                
                if (!error && data) allData = data;
            } else {
                // Caso de carga completa (o el resto desde un offset)
                const batchSize = 1000;
                const ranges = [];
                
                // Si hay un offset, empezamos desde ahí. Si no, cargamos todo (hasta 5000)
                const start = offset;
                const end = 5000;
                
                for (let i = start; i < end; i += batchSize) {
                    ranges.push({ from: i, to: i + batchSize - 1 });
                }

                const results = await Promise.all(
                    ranges.map(range => 
                        supabase
                            .from('Registro_Facturas')
                            .select(columns)
                            .order('ID', { ascending: false })
                            .range(range.from, range.to)
                    )
                );

                results.forEach(({ data, error }) => {
                    if (!error && data) {
                        allData = [...allData, ...data];
                    }
                });
            }

            if (allData.length > 0) {
                return NextResponse.json({
                    success: true,
                    total: allData.length,
                    items: allData,
                    source: 'cache'
                });
            }
            console.log('[API] Cache empty, falling back to SharePoint...');
        }

        console.log('[API] Fetching all invoices from SharePoint (Direct)...');
        const items = await fetchAllSharePointItems();

        return NextResponse.json({
            success: true,
            total: items.length,
            items,
            source: 'sharepoint'
        });
    } catch (error: any) {
        console.error('SharePoint all items API error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
