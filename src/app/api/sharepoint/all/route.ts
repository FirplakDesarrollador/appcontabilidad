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

        if (!refresh) {
            console.log('[API] Fetching invoices from Supabase (Parallel & Selective)...');
            
            // Definimos las columnas esenciales para reducir el tamaño del payload
            const columns = 'ID, Nit, Proveedor, Nro_Factura, Aprobacion_Doliente, Gestion_Contabilidad, Responsable_de_Autorizar, Valor total, Creado, sharepoint_id, documentos, Attachments, Documento_x0020_PDF';

            // Lanzamos peticiones en paralelo para cubrir hasta 5000 registros
            const batchSize = 1000;
            const ranges = [
                { from: 0, to: 999 },
                { from: 1000, to: 1999 },
                { from: 2000, to: 2999 },
                { from: 3000, to: 3999 },
                { from: 4000, to: 4999 }
            ];

            const results = await Promise.all(
                ranges.map(range => 
                    supabase
                        .from('Registro_Facturas')
                        .select(columns)
                        .order('ID', { ascending: false })
                        .range(range.from, range.to)
                )
            );

            let allData: any[] = [];
            results.forEach(({ data, error }) => {
                if (!error && data) {
                    allData = [...allData, ...data];
                }
            });

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
