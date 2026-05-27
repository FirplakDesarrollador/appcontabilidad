import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getGraphClient } from '@/lib/sharepoint';

const HOST = 'firplaksa.sharepoint.com';
const SITE_PATH = 'FPKContabilidad';
const LIST_NAME = 'Registro_de_Facturas';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export const dynamic = 'force-dynamic';
export const maxDuration = 120; // 2 minutos

// SharePoint → Supabase Mapper
function mapSpToSupabase(fields: any, spItemId: any) {
    const hasAttachmentsFlag = fields.Attachments === true || Number(fields.Datos_adjuntos) > 0 || !!fields.fp || !!fields.documentos;
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
        Responsable_de_Autorizar: fields.Responsable_de_Autorizar ?? null,
        FechaAprobacion: fields.FechaAprobacion ?? null,
        centro_costos: fields.centro_costos ?? null,
        Valor_total: fields.Valortotal ?? fields.Valor_x0020_total ?? fields["Valor total"] ?? fields.Valor_total ?? null,
        tiene_anticipo: fields.tiene_anticipo ?? null,
        Creado: fields.Created ?? fields.Creado ?? null,
        Creado_por: fields.AuthorLookupId ? String(fields.AuthorLookupId) : (fields["Creado por"] ?? fields.Creado_por ?? null),
        CUFE: fields.CUFE ?? null,
        InformeRecepcion: fields.InformeRecepcion ?? null,
        FechaProcesado: fields.FechaProcesado ?? null,
        DigitadoPor: fields.DigitadoPor ?? null,
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
function mapSupabaseToSp(sbItem: any) {
    const payload: any = {};
    if (sbItem.Proveedor !== undefined)               payload.Proveedor = sbItem.Proveedor;
    if (sbItem.Nit !== undefined)                      payload.Nit = sbItem.Nit;
    if (sbItem.Nro_Factura !== undefined)              payload.Nro_Factura = sbItem.Nro_Factura;
    if (sbItem.Aprobacion_Doliente !== undefined)      payload.Aprobacion_Doliente = sbItem.Aprobacion_Doliente;
    if (sbItem.Gestion_Contabilidad !== undefined)     payload.Gestion_Contabilidad = sbItem.Gestion_Contabilidad;
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
    if (sbItem.Procesado !== undefined)               payload.Procesado = sbItem.Procesado === 'true';
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
        
        // 1. Determine last sync interval (5.5 minutes ago to ensure overlap, 7 days if manual)
        const minutesBack = isManual ? 7 * 24 * 60 : 5.5;
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
        const spFilter = `fields/Modified ge '${lastSyncTime.toISOString()}'`;
        const spChangesRes = await graphClient
            .api(`/sites/${siteId}/lists/${listId}/items?expand=fields`)
            .header('Prefer', 'HonorNonIndexedQueriesWarningMayFailRandomly')
            .filter(spFilter)
            .get();
        
        const spChanges = spChangesRes.value || [];
        console.log(`[CRON-SYNC] Found ${spChanges.length} modified items in SharePoint.`);

        // 3. Fetch modified items in Supabase
        const { data: sbChanges = [], error: sbError } = await supabaseAdmin
            .from('Registro_Facturas')
            .select('*')
            .gt('updated_at', lastSyncTime.toISOString());

        if (sbError) throw sbError;
        console.log(`[CRON-SYNC] Found ${sbChanges.length} modified items in Supabase.`);

        const stats = { sp_to_sb: 0, sb_to_sp: 0, errors: 0, skipped: 0 };
        const processedSPIds = new Set<string>();

        // ── A. Process SharePoint Changes to Supabase ─────────────────────────
        for (const spItem of spChanges) {
            const spItemId = String(spItem.id);
            processedSPIds.add(spItemId);
            
            const invoiceData = mapSpToSupabase(spItem.fields, spItemId);
            
            // Check collision
            const conflictEntry = sbChanges.find(sb => String(sb.sharepoint_id) === spItemId);
            if (conflictEntry) {
                const spDate = new Date(invoiceData.Modificado || 0);
                const sbDate = new Date(conflictEntry.updated_at || 0);
                if (sbDate > spDate) {
                    console.log(`[CRON-SYNC] Skip ID ${spItemId} (Supabase is newer than SP)`);
                    stats.skipped++;
                    continue;
                }
            }

            console.log(`[CRON-SYNC] Upserting SP item ${spItemId} to Supabase...`);
            const { error: upsertErr } = await supabaseAdmin
                .from('Registro_Facturas')
                .upsert(invoiceData, { onConflict: 'ID' });

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
            if (!spItemId || processedSPIds.has(String(spItemId))) continue;

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
        return NextResponse.json({ success: true, stats });

    } catch (error: any) {
        console.error('[CRON-SYNC] Error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
