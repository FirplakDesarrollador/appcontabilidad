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
        const pending = searchParams.get('pending') === 'true';
        const processed = searchParams.get('processed') === 'true';
        const offset = parseInt(searchParams.get('offset') || '0');

        // Fetch counts in parallel using lightweight head-only requests
        const [pendingCountRes, processedCountRes] = await Promise.all([
            supabase.from('Registro_Facturas').select('ID', { count: 'exact', head: true }).eq('Aprobacion_Doliente', 'Por Aprobar'),
            supabase.from('Registro_Facturas').select('ID', { count: 'exact', head: true }).or('Aprobacion_Doliente.in.(Aprobado,Rechazado),Gestion_Contabilidad.eq.Procesado')
        ]);
        const pendingCount = pendingCountRes.count || 0;
        const processedCount = processedCountRes.count || 0;
        const hasCacheData = (pendingCount + processedCount) > 0;

        if (!refresh) {
            console.log(`[API] Fetching from Supabase (pending=${pending}, processed=${processed}, offset=${offset}, limit=${limit})...`);
            
            const columns = 'ID, Nit, Proveedor, Nro_Factura, Aprobacion_Doliente, Gestion_Contabilidad, Responsable_de_Autorizar, "Valor total", Creado, sharepoint_id, documentos, FechaAprobacion';

            let query = supabase.from('Registro_Facturas').select(columns);
            
            if (pending) {
                query = query.eq('Aprobacion_Doliente', 'Por Aprobar');
            } else if (processed) {
                query = query.or('Aprobacion_Doliente.in.(Aprobado,Rechazado),Gestion_Contabilidad.eq.Procesado');
            }

            const fetchLimit = limit > 0 ? limit : 1000;
            const { data, error } = await query
                .order('ID', { ascending: false })
                .range(offset, offset + fetchLimit - 1);
            
            // Return from cache if query succeeded AND (we have data OR the database table is already populated so no need to sync)
            if (!error && data && (data.length > 0 || hasCacheData)) {
                return NextResponse.json({
                    success: true,
                    total: data.length,
                    pendingCount,
                    processedCount,
                    items: data,
                    source: 'cache'
                });
            }
        }

        let sharepointFilter = '';
        if (pending) {
            sharepointFilter = "fields/Aprobacion_Doliente eq 'Por Aprobar'";
        } else if (processed) {
            sharepointFilter = "fields/Aprobacion_Doliente eq 'Aprobado' or fields/Aprobacion_Doliente eq 'Rechazado' or fields/Gestion_Contabilidad eq 'Procesado'";
        }

        console.log(`[API] Fetching ${pending ? 'PENDING' : processed ? 'PROCESSED' : 'ALL'} items from SharePoint...`);
        let items = await fetchAllSharePointItems('Registro_de_Facturas', limit || 5000, sharepointFilter);
        
        // Enforce limit if specified
        if (limit > 0 && items.length > limit) {
            items = items.slice(0, limit);
        }

        return NextResponse.json({
            success: true,
            total: items.length,
            pendingCount,
            processedCount,
            items,
            source: 'sharepoint'
        });
    } catch (error: any) {
        console.error('SharePoint all items API error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
