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
        const offset = parseInt(searchParams.get('offset') || '0');

        if (!refresh) {
            console.log(`[API] Fetching documents from Supabase (pending=${pending}, offset=${offset})...`);
            
            const columns = 'id, sharepoint_id, nit, proveedor, valor_total, consecutivo, aprobacion_doliente, gestion_contabilidad, observaciones, responsable_id, centro_costos, attachments, fecha_creacion, responsable_nombre, tiene_anticipo';

            let query = supabase.from('Documento_Soporte').select(columns);
            
            if (pending) {
                query = query.or('aprobacion_doliente.eq.Por Aprobar,aprobacion_doliente.eq.Pendiente');
            }

            const { data, error } = await query
                .order('id', { ascending: false })
                .range(offset, offset + (limit > 0 ? limit - 1 : 1000));
            
            if (!error && data && data.length > 0) {
                return NextResponse.json({
                    success: true,
                    total: data.length,
                    items: data,
                    source: 'cache'
                });
            }
        }

        console.log(`[API] Fetching all support documents from SharePoint to refresh cache (Direct)...`);
        let items = await fetchAllSharePointItems('Documento_Soporte', limit || 5000, '');

        // Cache the fetched items in Supabase
        if (items.length > 0) {
            try {
                const upsertData = items.map((item: any) => ({
                    id: Number(item.id),
                    sharepoint_id: String(item.id),
                    nit: item.Title || "N/A",
                    proveedor: item.tsic || "N/A",
                    valor_total: item.Valortotal || 0,
                    consecutivo: item.Consecutivo_Doc_Soporte ? String(item.Consecutivo_Doc_Soporte) : "S/N",
                    aprobacion_doliente: item.AprobacionDoliente || "Pendiente",
                    gestion_contabilidad: item.Gestion_Contabilidad || "Pendiente",
                    observaciones: item.Observaciones || null,
                    responsable_nombre: item.Responsable_de_Autorizar || "Sin asignar",
                    tiene_anticipo: item.tiene_anticipo || null,
                    centro_costos: item.centro_costos || null,
                    updated_at: new Date().toISOString()
                }));

                const { error: upsertErr } = await supabase
                    .from('Documento_Soporte')
                    .upsert(upsertData, { onConflict: 'id' });

                if (upsertErr) {
                    console.error('[API] Failed to update cache for documents:', upsertErr.message);
                } else {
                    console.log(`[API] Cached ${upsertData.length} documents in Supabase`);
                }
            } catch (err) {
                console.error('[API] Error updating cache in Supabase:', err);
            }
        }

        // Apply in-memory filtering for pending documents if requested
        if (pending) {
            items = items.filter((item: any) => {
                const status = (item.AprobacionDoliente || "Pendiente").toLowerCase();
                return status.includes("pendiente") || status.includes("por aprobar");
            });
        }

        // Enforce limit if specified
        if (limit > 0 && items.length > limit) {
            items = items.slice(0, limit);
        }

        return NextResponse.json({
            success: true,
            total: items.length,
            items,
            source: 'sharepoint'
        });
    } catch (error: any) {
        console.error('Support documents all items API error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
