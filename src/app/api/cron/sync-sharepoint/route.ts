import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getGraphClient, getCachedUserMap } from '@/lib/sharepoint';

const HOST = 'firplaksa.sharepoint.com';
const SITE_PATH = 'FPKContabilidad';
const LIST_NAME = 'Registro_de_Facturas';

const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (serviceKey && serviceKey !== 'REEMPLAZAR_CON_TU_SERVICE_ROLE_KEY') ? serviceKey : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export const dynamic = 'force-dynamic';
export const maxDuration = 120; // 2 minutos

// SharePoint → Supabase Mapper
function mapSpToSupabase(fields: any, spItemId: any, userMap?: Map<string, string> | null) {
    const hasAttachmentsFlag = fields.Attachments === true || Number(fields.Datos_adjuntos) > 0 || !!fields.fp || !!fields.documentos;
    const lookupId = fields.ResponsabledeAutorizarLookupId
        || fields.ResponsableAprobarLookupId
        || fields.Responsable_de_AutorizarLookupId;
    const responsable = lookupId && userMap ? (userMap.get(String(lookupId)) || null) : (fields.Responsable_de_Autorizar ?? null);
    // NOTE: responsable may be null if the LookupId is not in the userMap yet.
    // We handle this below by stripping null values before upsert.

    return {
        ID: Number(spItemId),
        sharepoint_id: String(spItemId),
        Nit: fields.Nit ?? fields.Title ?? fields.LinkTitle ?? null,
        Proveedor: fields.Proveedor ?? null,
        Nro_Factura: fields.Nro_Factura ?? null,
        Aprobacion_Doliente: fields.Aprobacion_Doliente ?? null,
        Gestion_Contabilidad: fields.Gestion_Contabilidad ?? null,
        Observaciones: fields.Observaciones ?? null,
        Consecutivo: fields.Consecutivo ?? null,
        Responsable_de_Autorizar: responsable,
        FechaAprobacion: fields.FechaAprobacion ?? null,
        centro_costos: fields.centro_costos ?? null,
        Valor_total: fields.Valortotal ?? fields.Valor_x0020_total ?? fields["Valor total"] ?? fields.Valor_total ?? null,
        tiene_anticipo: fields.tiene_anticipo ?? null,
        Creado: fields.Created ?? fields.Creado ?? null,
        Creado_por: fields.AuthorLookupId ? String(fields.AuthorLookupId) : (fields["Creado por"] ?? fields.Creado_por ?? null),
        CUFE: fields.CUFE ?? null,
        InformeRecepcion: fields.InformeRecepcion ?? null,
        FechaProcesado: fields.FechaProcesado ?? null,
        DigitadoPor: (fields.DigitadoPor && fields.DigitadoPor !== 'SharePoint App') ? fields.DigitadoPor : undefined,
        ProcesadoPor: fields.ProcesadoPor ?? undefined,
        Datos_adjuntos: hasAttachmentsFlag ? 1 : 0,
        tablaCostos: fields.tablaCostos ?? null,
        Procesado: fields.Procesado != null ? String(fields.Procesado) : null,
        Modificado: fields.Modified ?? fields.Modificado ?? null,
        Modificado_por: fields.EditorLookupId ? String(fields.EditorLookupId) : (fields["Modificado por"] ?? fields.Modificado_por ?? null),
        fp: fields.fp ?? null,
        documentos: fields.fp ?? fields.documentos ?? null,
        updated_at: new Date().toISOString()
    };
}

// Supabase → SharePoint Mapper
// IMPORTANTE: Los campos de estado (Aprobacion_Doliente, Gestion_Contabilidad, Procesado)
// NO se incluyen aquí. Estos campos son gestionados exclusivamente en SharePoint
// y solo fluyen SP→SB, nunca al revés, para evitar sobrescribir datos correctos
// con datos desactualizados de Supabase.
function mapSupabaseToSp(sbItem: any) {
    const payload: any = {};
    if (sbItem.Proveedor !== undefined)               payload.Proveedor = sbItem.Proveedor;
    if (sbItem.Nit !== undefined)                      payload.Title = sbItem.Nit;
    if (sbItem.Nro_Factura !== undefined)              payload.Nro_Factura = sbItem.Nro_Factura;
    // Aprobacion_Doliente: EXCLUIDO — solo fluye SP→SB
    // Gestion_Contabilidad: EXCLUIDO — solo fluye SP→SB
    if (sbItem.Observaciones !== undefined)            payload.Observaciones = sbItem.Observaciones;
    if (sbItem.Consecutivo !== undefined)              payload.Consecutivo = sbItem.Consecutivo;
    // En SharePoint, el responsable es un Lookup (Persona) y no se actualiza con un string directo.
    // Se gestiona a través de la API dedicada de reasignación.
    if (sbItem.centro_costos !== undefined)            payload.centro_costos = sbItem.centro_costos;
    if (sbItem.tiene_anticipo !== undefined)           payload.tiene_anticipo = sbItem.tiene_anticipo;
    if (sbItem.CUFE !== undefined)                     payload.CUFE = sbItem.CUFE;
    if (sbItem.InformeRecepcion !== undefined)         payload.InformeRecepcion = sbItem.InformeRecepcion;
    if (sbItem.FechaAprobacion !== undefined)          payload.FechaAprobacion = sbItem.FechaAprobacion;
    if (sbItem.fp !== undefined)                       payload.fp = sbItem.fp;
    // Procesado: EXCLUIDO — solo fluye SP→SB
    if (sbItem.Valor_total !== undefined)              payload.Valortotal = sbItem.Valor_total;
    return payload;
}

export async function GET(req: Request) {
    try {
        // Simple security check (header authorization or secret token in URL)
        const { searchParams } = new URL(req.url);
        const secret = searchParams.get('secret');
        const isManual = searchParams.get('manual') === 'true';
        const expectedSecret = process.env.CRON_SECRET;
        
        if (!isManual && expectedSecret && secret !== expectedSecret) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        console.log('[CRON-SYNC] Initiating bidirectional delta sync...');
        
        // 1. Determine last sync interval (24 hours ago to ensure safety net, 365 days if manual)
        const minutesBack = isManual ? 365 * 24 * 60 : 24 * 60;
        const lastSyncTime = new Date(Date.now() - minutesBack * 60 * 1000);
        console.log(`[CRON-SYNC] Syncing changes since: ${lastSyncTime.toISOString()} (manual: ${isManual})`);

        const graphClient = await getGraphClient();
        
        // Resolve Site and List IDs
        const siteResponse = await graphClient.api(`/sites/${HOST}:/sites/${SITE_PATH}`).get();
        const siteId = siteResponse.id;
        
        const listsResponse = await graphClient.api(`/sites/${siteId}/lists`).get();
        const list = listsResponse.value.find((l: any) => l.name === LIST_NAME || l.displayName === LIST_NAME);
        if (!list) throw new Error('SharePoint list not found');
        const listId = list.id;

        // 2. Fetch modified items in SharePoint
        let spChanges = [];
        let spNextLink = `/sites/${siteId}/lists/${listId}/items?expand=fields&$top=500`;
        const spFilter = `fields/Modified ge '${lastSyncTime.toISOString()}'`;
        
        while (spNextLink) {
            const req = graphClient.api(spNextLink).header('Prefer', 'HonorNonIndexedQueriesWarningMayFailRandomly');
            if (spNextLink.includes('?expand=fields') && !spNextLink.includes('skiptoken')) {
                req.filter(spFilter);
            }
            const res = await req.get();
            spChanges = spChanges.concat(res.value || []);
            spNextLink = res['@odata.nextLink'] ? res['@odata.nextLink'].split('v1.0')[1] : null;
        }
        console.log(`[CRON-SYNC] Found ${spChanges.length} modified items in SharePoint.`);

        // 3. Fetch modified items in Supabase
        let sbChanges = [];
        let sbHasMore = true;
        let sbOffset = 0;
        const sbLimit = 1000;
        
        while (sbHasMore) {
            const { data: batch, error: sbError } = await supabaseAdmin
                .from('Registro_Facturas')
                .select('*')
                .gt('updated_at', lastSyncTime.toISOString())
                .range(sbOffset, sbOffset + sbLimit - 1);
            
            if (sbError) throw sbError;
            
            sbChanges = sbChanges.concat(batch || []);
            if (!batch || batch.length < sbLimit) {
                sbHasMore = false;
            } else {
                sbOffset += sbLimit;
            }
        }
        console.log(`[CRON-SYNC] Found ${sbChanges.length} modified items in Supabase.`);

        const userMap = await getCachedUserMap(graphClient, siteId);

        const stats = { sp_to_sb: 0, sb_to_sp: 0, errors: 0, skipped: 0 };
        const processedSPIds = new Set<string>();

        // ── A. Process SharePoint Changes to Supabase ─────────────────────────
        for (const spItem of spChanges) {
            const spItemId = String(spItem.id);
            processedSPIds.add(spItemId);
            
            const invoiceData = mapSpToSupabase(spItem.fields, spItemId, userMap);
            
            // Check collision
            const conflictEntry = sbChanges.find(sb => String(sb.sharepoint_id) === spItemId);
            if (conflictEntry && !isManual) {
                const spDate = new Date(invoiceData.Modificado || 0);
                const sbDate = new Date(conflictEntry.updated_at || 0);
                if (sbDate > spDate) {
                    console.log(`[CRON-SYNC] Skip ID ${spItemId} (Supabase is newer than SP)`);
                    stats.skipped++;
                    continue;
                }
            }

            console.log(`[CRON-SYNC] Upserting SP item ${spItemId} to Supabase...`);
            // Strip null fields that live exclusively in Supabase and must never
            // be overwritten by SP data coming in as null.
            const upsertData = { ...invoiceData };
            if (upsertData.Responsable_de_Autorizar === null) {
                delete upsertData.Responsable_de_Autorizar;
            }
            // FechaProcesado and DigitadoPor are set by the app when processing.
            // SharePoint doesn't own these fields, so if SP sends null we must
            // preserve the existing Supabase value instead of overwriting.
            if (upsertData.FechaProcesado === null) {
                delete upsertData.FechaProcesado;
            }
            if (!upsertData.DigitadoPor) {
                delete upsertData.DigitadoPor;
            }
            const { error: upsertErr } = await supabaseAdmin
                .from('Registro_Facturas')
                .upsert(upsertData, { onConflict: 'ID' });

            if (upsertErr) {
                console.error(`[CRON-SYNC] Failed upsert for SP ID ${spItemId}:`, upsertErr.message);
                stats.errors++;
            } else {
                stats.sp_to_sb++;
            }
        }

        // ── B. Process Supabase Changes to SharePoint ─────────────────────────
        for (const sbItem of sbChanges) {
            const spItemId = sbItem.sharepoint_id;
            if (!spItemId || processedSPIds.has(String(spItemId)) || isManual) continue;

            const spUpdateFields = mapSupabaseToSp(sbItem);
            if (Object.keys(spUpdateFields).length === 0) continue;

            console.log(`[CRON-SYNC] PATCHing Supabase item ${sbItem.ID} (SP ID ${spItemId}) to SharePoint...`);
            try {
                await graphClient
                    .api(`/sites/${siteId}/lists/${listId}/items/${spItemId}/fields`)
                    .patch(spUpdateFields);
                
                stats.sb_to_sp++;
            } catch (spErr: any) {
                console.error(`[CRON-SYNC] Failed PATCH for SP ID ${spItemId}:`, spErr.message);
                stats.errors++;
            }
        }

        console.log('[CRON-SYNC] Complete!', stats);

        // ── C. Auto-assign missing responsables from Proveedores_con_Responsable ──
        try {
            const { data: unassigned, error: unassignedErr } = await supabaseAdmin
                .from('Registro_Facturas')
                .select('ID, Nit')
                .or('Responsable_de_Autorizar.is.null,Responsable_de_Autorizar.eq.')
                .eq('Aprobacion_Doliente', 'Por Aprobar');

            if (!unassignedErr && unassigned && unassigned.length > 0) {
                console.log(`[CRON-SYNC] Found ${unassigned.length} invoices without responsable. Attempting auto-assign...`);

                const { data: providers } = await supabaseAdmin
                    .from('Proveedores_con_Responsable')
                    .select('"Nit", "Responsable", "Autorizador", "Correo"');

                if (providers && providers.length > 0) {
                    const providerMap = new Map<string, { responsable: string; correo: string }>();
                    for (const p of providers) {
                        const key = p.Nit ? (p.Nit.includes('-') ? p.Nit.split('-')[0].trim() : p.Nit.trim()) : '';
                        if (key && !providerMap.has(key)) {
                            const name = p.Responsable || p.Autorizador || null;
                            if (name) providerMap.set(key, { responsable: name, correo: p.Correo || '' });
                        }
                    }

                    let autoAssigned = 0;
                    for (const inv of unassigned) {
                        const key = inv.Nit ? (inv.Nit.includes('-') ? inv.Nit.split('-')[0].trim() : inv.Nit.trim()) : '';
                        const match = providerMap.get(key);
                        if (match) {
                            const { error: updateErr } = await supabaseAdmin
                                .from('Registro_Facturas')
                                .update({ Responsable_de_Autorizar: match.responsable })
                                .eq('ID', inv.ID);
                            if (!updateErr) {
                                autoAssigned++;
                                console.log(`[CRON-SYNC] Auto-assigned ID ${inv.ID} → ${match.responsable}`);
                            }
                        }
                    }
                    console.log(`[CRON-SYNC] Auto-assigned ${autoAssigned}/${unassigned.length} invoices.`);
                    (stats as any).auto_assigned = autoAssigned;
                }
            }
        } catch (autoErr: any) {
            console.warn('[CRON-SYNC] Auto-assign step failed (non-fatal):', autoErr.message);
        }

        return NextResponse.json({ success: true, stats });

    } catch (error: any) {
        console.error('[CRON-SYNC] Error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
