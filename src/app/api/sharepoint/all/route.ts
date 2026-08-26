import { NextResponse } from 'next/server';
import { fetchAllSharePointItems } from '@/lib/sharepoint';
import { createClient } from '@supabase/supabase-js';

const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (serviceKey && serviceKey !== 'REEMPLAZAR_CON_TU_SERVICE_ROLE_KEY') ? serviceKey : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// TTL del caché de pendientes: 3 minutos
// Después de este tiempo, el próximo load disparará un sync de fondo con SharePoint
const PENDING_CACHE_TTL_MS = 3 * 60 * 1000;
let lastPendingSync: number = 0;
let pendingSyncInProgress = false;

// Caché en memoria para contadores (30s) para evitar 3 escaneos completos de tabla en cada request
interface CachedCounts {
    pendingCount: number;
    processedCount: number;
    toProcessCount: number;
    timestamp: number;
}
let cachedCounts: CachedCounts | null = null;
const COUNTS_CACHE_TTL_MS = 30 * 1000;

async function getInvoiceCounts(forceRefresh: boolean = false): Promise<{ pendingCount: number; processedCount: number; toProcessCount: number }> {
    if (!forceRefresh && cachedCounts && (Date.now() - cachedCounts.timestamp) < COUNTS_CACHE_TTL_MS) {
        return {
            pendingCount: cachedCounts.pendingCount,
            processedCount: cachedCounts.processedCount,
            toProcessCount: cachedCounts.toProcessCount
        };
    }

    try {
        const [pendingCountRes, processedCountRes, toProcessCountRes] = await Promise.all([
            supabase
                .from('Registro_Facturas')
                .select('ID', { count: 'exact', head: true })
                .eq('Aprobacion_Doliente', 'Por Aprobar'),
            supabase
                .from('Registro_Facturas')
                .select('ID', { count: 'exact', head: true })
                .or('Aprobacion_Doliente.in.(Aprobado,Rechazado),Gestion_Contabilidad.eq.Procesado,FechaProcesado.not.is.null'),
            supabase
                .from('Registro_Facturas')
                .select('ID', { count: 'exact', head: true })
                .eq('Aprobacion_Doliente', 'Aprobado')
                .ilike('Gestion_Contabilidad', '%POR PROCESAR%')
                .is('FechaProcesado', null)
        ]);

        const counts = {
            pendingCount: pendingCountRes.count || 0,
            processedCount: processedCountRes.count || 0,
            toProcessCount: toProcessCountRes.count || 0,
            timestamp: Date.now()
        };
        cachedCounts = counts;
        return counts;
    } catch (e) {
        console.error('[API] Error getting invoice counts:', e);
        return {
            pendingCount: cachedCounts?.pendingCount || 0,
            processedCount: cachedCounts?.processedCount || 0,
            toProcessCount: cachedCounts?.toProcessCount || 0
        };
    }
}

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
        DigitadoPor: (item.DigitadoPor && item.DigitadoPor !== 'SharePoint App') ? item.DigitadoPor : undefined,
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
 * Solo trae pendientes de SharePoint → Supabase (lectura ligera, sin patch ni cron pesado).
 * Se dispara sin bloquear la respuesta HTTP → el usuario recibe los datos de Supabase
 * inmediatamente, y la próxima carga ya tendrá el estado actualizado.
 */
async function syncPendingFromSharePointInBackground(reqUrl: string) {
    if (pendingSyncInProgress) return;
    pendingSyncInProgress = true;
    try {
        console.log('[BG Sync] Lightweight pending-only sync starting...');
        const { fetchAllSharePointItems } = await import('@/lib/sharepoint');
        const pendingFilter = "fields/Aprobacion_Doliente eq 'Por Aprobar'";
        const spItems = await fetchAllSharePointItems('Registro_de_Facturas', 500, pendingFilter);
        
        if (spItems.length > 0) {
            // Bulk upsert to Supabase in chunks of 200
            const mapped = spItems.map((item: any) => mapSharePointInvoiceToSupabase(item));
            for (let i = 0; i < mapped.length; i += 200) {
                const chunk = mapped.slice(i, i + 200);
                const cleanChunk = chunk.map((row: any) => {
                    const clean = { ...row };
                    // Don't overwrite fields that only Supabase owns
                    if (clean.Responsable_de_Autorizar === null) delete clean.Responsable_de_Autorizar;
                    if (clean.FechaProcesado === null) delete clean.FechaProcesado;
                    if (!clean.DigitadoPor) delete clean.DigitadoPor;
                    return clean;
                });
                await supabase.from('Registro_Facturas').upsert(cleanChunk, { onConflict: 'ID' });
            }
            console.log(`[BG Sync] Upserted ${spItems.length} pending items to Supabase.`);
        } else {
            console.log('[BG Sync] No pending items found in SharePoint.');
        }

        lastPendingSync = Date.now();
    } catch (err) {
        console.error('[BG Sync] Error during lightweight pending sync:', err);
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
        const history = searchParams.get('history') === 'true';
        const offset = parseInt(searchParams.get('offset') || '0');

        // ─────────────────────────────────────────────────────────────────────
        // PENDIENTES: Supabase inmediato + sync de fondo cada 3 minutos
        // ─────────────────────────────────────────────────────────────────────
        if (pending) {
            const cacheAge = Date.now() - lastPendingSync;
            const cacheStale = cacheAge > PENDING_CACHE_TTL_MS;

            // Si refresh explícito, esperar la sincronización antes de responder
            if (refresh) {
                console.log('[API] Explicit refresh requested — syncing from SharePoint...');
                await syncPendingFromSharePointInBackground(req.url);
            } else if (cacheStale && !pendingSyncInProgress) {
                // Caché expirado → disparar sync en fondo SIN bloquear la respuesta
                console.log(`[API] Cache stale (${Math.round(cacheAge / 1000)}s) — triggering background sync...`);
                syncPendingFromSharePointInBackground(req.url); // fire-and-forget
            }

            // Servir desde Supabase (rápido en 1 sola consulta)
            const columns = 'ID, Nit, Proveedor, Nro_Factura, Consecutivo, Observaciones, Aprobacion_Doliente, Gestion_Contabilidad, Responsable_de_Autorizar, Valor_total, Creado, sharepoint_id, documentos, FechaAprobacion, FechaProcesado, DigitadoPor, adjuntos_url, centro_costos, tablaCostos, tiene_anticipo, Procesado';
            const fetchLimit = limit > 0 ? limit : 1000;

            const [dataRes, counts] = await Promise.all([
                supabase
                    .from('Registro_Facturas')
                    .select(columns)
                    .eq('Aprobacion_Doliente', 'Por Aprobar')
                    .order('ID', { ascending: false })
                    .range(offset, offset + fetchLimit - 1),
                getInvoiceCounts(refresh)
            ]);

            const data = dataRes.data || [];

            return NextResponse.json({
                success: true,
                total: data.length,
                pendingCount: counts.pendingCount,
                processedCount: counts.processedCount,
                toProcessCount: counts.toProcessCount,
                items: data,
                source: 'cache',
                syncStatus: refresh ? 'synced' : (cacheStale ? 'syncing' : 'fresh'),
                lastSync: lastPendingSync,
            });
        }

        // ─────────────────────────────────────────────────────────────────────
        // PROCESADOS / HISTÓRICO → caché de Supabase (rápido, paginado)
        // ─────────────────────────────────────────────────────────────────────
        if (processed || history) {
            const counts = await getInvoiceCounts(refresh);
            const { pendingCount, processedCount, toProcessCount } = counts;

            if (!refresh) {
                console.log(`[API] Fetching PROCESSED from Supabase cache (offset=${offset}, limit=${limit})...`);
                const columns = 'ID, Nit, Proveedor, Nro_Factura, Consecutivo, Observaciones, Aprobacion_Doliente, Gestion_Contabilidad, Responsable_de_Autorizar, Valor_total, Creado, sharepoint_id, documentos, FechaAprobacion, FechaProcesado, DigitadoPor, adjuntos_url, centro_costos, tablaCostos, tiene_anticipo, Procesado';
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
                        toProcessCount,
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
                toProcessCount,
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

        const [{ count: pendingCount }, { count: processedCount }, { count: toProcessCount }] = await Promise.all([
            supabase.from('Registro_Facturas').select('ID', { count: 'exact', head: true }).eq('Aprobacion_Doliente', 'Por Aprobar'),
            supabase.from('Registro_Facturas').select('ID', { count: 'exact', head: true }).or('Aprobacion_Doliente.in.(Aprobado,Rechazado),Gestion_Contabilidad.eq.Procesado'),
            supabase.from('Registro_Facturas').select('ID', { count: 'exact', head: true }).eq('Aprobacion_Doliente', 'Aprobado').ilike('Gestion_Contabilidad', '%POR PROCESAR%')
        ]);

        return NextResponse.json({
            success: true,
            total: items.length,
            pendingCount: pendingCount || 0,
            processedCount: processedCount || 0,
            toProcessCount: toProcessCount || 0,
            items,
            source: 'sharepoint'
        });

    } catch (error: any) {
        console.error('SharePoint all items API error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
