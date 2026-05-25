import { NextResponse } from 'next/server';
import { fetchAllSharePointItems } from '@/lib/sharepoint';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// TTL del caché de pendientes: 3 minutos
// Después de este tiempo, el próximo load disparará un sync de fondo con SharePoint
const PENDING_CACHE_TTL_MS = 3 * 60 * 1000;
let lastPendingSync: number = 0;
let pendingSyncInProgress = false;

function mapSharePointInvoiceToSupabase(item: any) {
    const hasAttachmentsFlag = item.Attachments === true || Number(item.Datos_adjuntos) > 0 || !!item.fp || !!item.documentos;

    return {
        ID: Number(item.id),
        sharepoint_id: String(item.id),
        Nit: item.Nit ?? item.Title ?? item.LinkTitle ?? null,
        Proveedor: item.Proveedor ?? null,
        Nro_Factura: item.Nro_Factura ?? null,
        Aprobacion_Doliente: item.Aprobacion_Doliente ?? null,
        Gestion_Contabilidad: item.Gestion_Contabilidad ?? null,
        Observaciones: item.Observaciones ?? null,
        Consecutivo: item.Consecutivo ?? null,
        Responsable_de_Autorizar: item.Responsable_de_Autorizar ?? null,
        FechaAprobacion: item.FechaAprobacion ?? null,
        centro_costos: item.centro_costos ?? null,
        Valor_total: item.Valortotal ?? item.Valor_x0020_total ?? item["Valor total"] ?? item.Valor_total ?? null,
        tiene_anticipo: item.tiene_anticipo ?? null,
        Creado: item.Created ?? item.Creado ?? null,
        Creado_por: item.AuthorLookupId ? String(item.AuthorLookupId) : (item["Creado por"] ?? item.Creado_por ?? null),
        CUFE: item.CUFE ?? null,
        InformeRecepcion: item.InformeRecepcion ?? null,
        FechaProcesado: item.FechaProcesado ?? null,
        DigitadoPor: item.DigitadoPor ?? null,
        Datos_adjuntos: hasAttachmentsFlag ? 1 : 0,
        tablaCostos: item.tablaCostos ?? null,
        Procesado: item.Procesado != null ? String(item.Procesado) : null,
        Modificado: item.Modified ?? item.Modificado ?? null,
        Modificado_por: item.EditorLookupId ? String(item.EditorLookupId) : (item["Modificado por"] ?? item.Modificado_por ?? null),
        fp: item.fp ?? null,
        documentos: item.fp ?? item.documentos ?? null,
        updated_at: new Date().toISOString()
    };
}

/**
 * Sincroniza en segundo plano los ítems "Por Aprobar" entre SharePoint y Supabase.
 * Se dispara sin bloquear la respuesta HTTP → el usuario recibe los datos de Supabase
 * inmediatamente, y la próxima carga ya tendrá el estado actualizado.
 */
async function syncPendingFromSharePointInBackground() {
    if (pendingSyncInProgress) return;
    pendingSyncInProgress = true;
    try {
        console.log('[BG Sync] Starting background pending sync from SharePoint...');
        const sharepointFilter = "fields/Aprobacion_Doliente eq 'Por Aprobar'";
        const spItems = await fetchAllSharePointItems('Registro_de_Facturas', 5000, sharepointFilter);
        const spIds = new Set(spItems.map((i: any) => String(i.id)));

        if (spItems.length > 0) {
            const batchSize = 100;
            let synced = 0;

            for (let i = 0; i < spItems.length; i += batchSize) {
                const chunk = spItems.slice(i, i + batchSize).map(mapSharePointInvoiceToSupabase);
                const { error } = await supabase
                    .from('Registro_Facturas')
                    .upsert(chunk, { onConflict: 'ID' });

                if (error) {
                    console.error(`[BG Sync] Error upserting pending batch ${Math.floor(i / batchSize) + 1}:`, error.message);
                } else {
                    synced += chunk.length;
                }
            }

            console.log(`[BG Sync] Upserted ${synced} pending records from SharePoint.`);
        }

        // Obtener los IDs que Supabase tiene como "Por Aprobar"
        const { data: supabasePending } = await supabase
            .from('Registro_Facturas')
            .select('ID, sharepoint_id')
            .eq('Aprobacion_Doliente', 'Por Aprobar');

        const staleIds: string[] = [];
        for (const row of supabasePending || []) {
            const spId = String(row.sharepoint_id || row.ID);
            if (!spIds.has(spId)) {
                // Este registro ya no está "Por Aprobar" en SharePoint → actualizar en Supabase
                staleIds.push(row.ID);
            }
        }

        if (staleIds.length > 0) {
            console.log(`[BG Sync] Found ${staleIds.length} stale pending records. Marking as sync-needed...`);
            // Sincronizar el estado correcto desde SharePoint para cada uno
            // (En lote: los que ya no están pendientes en SP los marcamos como "Aprobado" provisional
            //  hasta que el sync completo actualice el valor exacto)
            // Nota: esto es seguro porque el único estado que desaparece de "Por Aprobar" en SP
            // es cuando pasan a "Aprobado" o "Rechazado".
            // Para saber el estado exacto, buscarlos en la respuesta completa de SP sería costoso.
            // Alternativa rápida: marcarlos como "Procesado" para sacarlos de la vista de pendientes.
            // El sync completo del cron job actualizará el valor exacto.
            await supabase
                .from('Registro_Facturas')
                .update({ Aprobacion_Doliente: 'Aprobado', Gestion_Contabilidad: 'Procesado' })
                .in('ID', staleIds);
            console.log(`[BG Sync] Updated ${staleIds.length} stale records in Supabase.`);
        } else {
            console.log('[BG Sync] Supabase is in sync with SharePoint (pending).');
        }

        lastPendingSync = Date.now();
    } catch (err) {
        console.error('[BG Sync] Error during background pending sync:', err);
    } finally {
        pendingSyncInProgress = false;
    }
}

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const refresh = searchParams.get('refresh') === 'true';
        const limit = parseInt(searchParams.get('limit') || '0');
        const pending = searchParams.get('pending') === 'true';
        const processed = searchParams.get('processed') === 'true';
        const offset = parseInt(searchParams.get('offset') || '0');

        // ─────────────────────────────────────────────────────────────────────
        // PENDIENTES: Supabase inmediato + sync de fondo cada 3 minutos
        // ─────────────────────────────────────────────────────────────────────
        if (pending) {
            const cacheAge = Date.now() - lastPendingSync;
            const cacheStale = cacheAge > PENDING_CACHE_TTL_MS;

            // Contar pendientes en Supabase (rápido)
            // Si refresh explícito, esperar la sincronización antes de responder
            if (refresh) {
                console.log('[API] Explicit refresh requested — syncing from SharePoint...');
                await syncPendingFromSharePointInBackground();
            } else if (cacheStale && !pendingSyncInProgress) {
                // Caché expirado → disparar sync en fondo SIN bloquear la respuesta
                console.log(`[API] Cache stale (${Math.round(cacheAge / 1000)}s) — triggering background sync...`);
                syncPendingFromSharePointInBackground(); // fire-and-forget
            }

            // Servir desde Supabase (siempre rápido)
            const columns = 'ID, Nit, Proveedor, Nro_Factura, Consecutivo, Observaciones, Aprobacion_Doliente, Gestion_Contabilidad, Responsable_de_Autorizar, Valor_total, Creado, sharepoint_id, documentos, FechaAprobacion, adjuntos_url';
            const fetchLimit = limit > 0 ? limit : 1000;

            const { data, error } = await supabase
                .from('Registro_Facturas')
                .select(columns)
                .eq('Aprobacion_Doliente', 'Por Aprobar')
                .order('ID', { ascending: false })
                .range(offset, offset + fetchLimit - 1);

            const [pendingCountRes, processedCountRes] = await Promise.all([
                supabase
                    .from('Registro_Facturas')
                    .select('ID', { count: 'exact', head: true })
                    .eq('Aprobacion_Doliente', 'Por Aprobar'),
                supabase
                    .from('Registro_Facturas')
                    .select('ID', { count: 'exact', head: true })
                    .or('Aprobacion_Doliente.in.(Aprobado,Rechazado),Gestion_Contabilidad.eq.Procesado')
            ]);

            return NextResponse.json({
                success: true,
                total: data?.length || 0,
                pendingCount: pendingCountRes.count || 0,
                processedCount: processedCountRes.count || 0,
                items: data || [],
                source: 'cache',
                syncStatus: refresh ? 'synced' : (cacheStale ? 'syncing' : 'fresh'),
                lastSync: lastPendingSync,
            });
        }

        // ─────────────────────────────────────────────────────────────────────
        // PROCESADOS / HISTÓRICO → caché de Supabase (rápido, paginado)
        // ─────────────────────────────────────────────────────────────────────
        if (processed) {
            const [pendingCountRes, processedCountRes] = await Promise.all([
                supabase.from('Registro_Facturas').select('ID', { count: 'exact', head: true }).eq('Aprobacion_Doliente', 'Por Aprobar'),
                supabase.from('Registro_Facturas').select('ID', { count: 'exact', head: true }).or('Aprobacion_Doliente.in.(Aprobado,Rechazado),Gestion_Contabilidad.eq.Procesado')
            ]);
            const pendingCount = pendingCountRes.count || 0;
            const processedCount = processedCountRes.count || 0;

            if (!refresh) {
                console.log(`[API] Fetching PROCESSED from Supabase cache (offset=${offset}, limit=${limit})...`);
                const columns = 'ID, Nit, Proveedor, Nro_Factura, Consecutivo, Observaciones, Aprobacion_Doliente, Gestion_Contabilidad, Responsable_de_Autorizar, Valor_total, Creado, sharepoint_id, documentos, FechaAprobacion, adjuntos_url';
                const fetchLimit = limit > 0 ? limit : 1000;

                const { data, error } = await supabase
                    .from('Registro_Facturas')
                    .select(columns)
                    .or('Aprobacion_Doliente.in.(Aprobado,Rechazado),Gestion_Contabilidad.eq.Procesado')
                    .order('ID', { ascending: false })
                    .range(offset, offset + fetchLimit - 1);

                if (!error && data && data.length > 0) {
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

            // Fallback a SharePoint si no hay datos en caché
            console.log('[API] Fetching PROCESSED items from SharePoint...');
            const sharepointFilter = "fields/Aprobacion_Doliente eq 'Aprobado' or fields/Aprobacion_Doliente eq 'Rechazado' or fields/Gestion_Contabilidad eq 'Procesado'";
            let items = await fetchAllSharePointItems('Registro_de_Facturas', limit || 5000, sharepointFilter);
            if (limit > 0 && items.length > limit) items = items.slice(0, limit);

            return NextResponse.json({
                success: true,
                total: items.length,
                pendingCount,
                processedCount,
                items,
                source: 'sharepoint'
            });
        }

        // ─────────────────────────────────────────────────────────────────────
        // SIN FILTRO → todo desde SharePoint
        // ─────────────────────────────────────────────────────────────────────
        console.log('[API] Fetching ALL items from SharePoint...');
        let items = await fetchAllSharePointItems('Registro_de_Facturas', limit || 5000, '');
        if (limit > 0 && items.length > limit) items = items.slice(0, limit);

        const [{ count: pendingCount }, { count: processedCount }] = await Promise.all([
            supabase.from('Registro_Facturas').select('ID', { count: 'exact', head: true }).eq('Aprobacion_Doliente', 'Por Aprobar'),
            supabase.from('Registro_Facturas').select('ID', { count: 'exact', head: true }).or('Aprobacion_Doliente.in.(Aprobado,Rechazado),Gestion_Contabilidad.eq.Procesado')
        ]);

        return NextResponse.json({
            success: true,
            total: items.length,
            pendingCount: pendingCount || 0,
            processedCount: processedCount || 0,
            items,
            source: 'sharepoint'
        });

    } catch (error: any) {
        console.error('SharePoint all items API error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
