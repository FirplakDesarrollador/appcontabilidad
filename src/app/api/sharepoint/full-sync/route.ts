import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { fetchAllSharePointItems } from '@/lib/sharepoint';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutos de tiempo de ejecución (máximo permitido por Vercel / Next.js)

export async function POST(req: Request) {
    try {
        console.log('[FULL-SYNC] Starting full one-time synchronization from SharePoint...');
        
        // 1. Fetch all items from SharePoint
        const spItems = await fetchAllSharePointItems('Registro_de_Facturas');
        console.log(`[FULL-SYNC] Retrieved ${spItems.length} items from SharePoint.`);

        if (!spItems || spItems.length === 0) {
            return NextResponse.json({ success: true, message: 'No items found in SharePoint to sync.', count: 0 });
        }

        // 2. Map and chunk items
        const batchSize = 100;
        let inserted = 0;
        let errors = 0;

        for (let i = 0; i < spItems.length; i += batchSize) {
            const chunk = spItems.slice(i, i + batchSize);
            const mappedChunk = chunk.map((item: any) => {
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
            });

            console.log(`[FULL-SYNC] Processing batch ${Math.floor(i / batchSize) + 1} (${mappedChunk.length} items)...`);
            
            // For items that are already in Supabase, we must not overwrite
            // FechaProcesado/DigitadoPor with null — those fields are owned by
            // the app (not SharePoint) and must be preserved.
            // Use update (merge) semantics: remove null-valued app-owned fields
            // so Supabase keeps the existing value.
            const safeChunk = mappedChunk.map((row: any) => {
                const r = { ...row };
                if (r.FechaProcesado === null) delete r.FechaProcesado;
                if (!r.DigitadoPor) delete r.DigitadoPor;
                return r;
            });

            const { error } = await supabaseAdmin
                .from('Registro_Facturas')
                .upsert(safeChunk, { onConflict: 'ID' });

            if (error) {
                console.error(`[FULL-SYNC] Error inserting chunk starting at index ${i}:`, error.message);
                errors += chunk.length;
            } else {
                inserted += chunk.length;
            }
        }

        console.log(`[FULL-SYNC] Full sync finished: ${inserted} items synced successfully, ${errors} items failed.`);

        // 5. Delete orphaned items
        console.log('[FULL-SYNC] Checking for orphaned items to delete...');
        let deletedCount = 0;
        try {
            const spIds = new Set(spItems.map((item: any) => parseInt(item.id, 10)));
            const { data: supaIdsData, error: supaIdsError } = await supabaseAdmin
                .from('Registro_Facturas')
                .select('ID');
                
            if (!supaIdsError && supaIdsData) {
                const supaIds = supaIdsData.map((r: any) => r.ID);
                const toDelete = supaIds.filter((id: number) => !spIds.has(id));
                
                if (toDelete.length > 0) {
                    console.log(`[FULL-SYNC] Found ${toDelete.length} orphaned items. Deleting...`);
                    const deleteBatchSize = 200;
                    for (let i = 0; i < toDelete.length; i += deleteBatchSize) {
                        const chunk = toDelete.slice(i, i + deleteBatchSize);
                        await supabaseAdmin
                            .from('Registro_Facturas')
                            .delete()
                            .in('ID', chunk);
                        deletedCount += chunk.length;
                    }
                    console.log(`[FULL-SYNC] Deleted ${deletedCount} orphaned items.`);
                } else {
                    console.log('[FULL-SYNC] No orphaned items found.');
                }
            }
        } catch (delErr) {
            console.error('[FULL-SYNC] Error deleting orphaned items:', delErr);
        }

        return NextResponse.json({
            success: true,
            total: spItems.length,
            synced: inserted,
            errors,
            deleted: deletedCount
        });

    } catch (error: any) {
        console.error('[FULL-SYNC] Fatal error during synchronization:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
