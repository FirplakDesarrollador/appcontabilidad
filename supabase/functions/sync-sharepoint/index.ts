import { createClient } from 'jsr:@supabase/supabase-js@2'

const HOST = 'firplaksa.sharepoint.com';
const SITE_PATH = 'FPKContabilidad';
const LIST_NAME = 'Registro_de_Facturas';

// Edge Functions handle requests using standard web standards
Deno.serve(async (req: Request) => {
    try {
        console.log(`[${new Date().toISOString()}] Starting bidirectional sync from Edge Function...`);

        const AZURE_TENANT_ID = Deno.env.get("AZURE_TENANT_ID");
        const AZURE_CLIENT_ID = Deno.env.get("AZURE_CLIENT_ID");
        const AZURE_CLIENT_SECRET = Deno.env.get("AZURE_CLIENT_SECRET");
        const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("NEXT_PUBLIC_SUPABASE_URL");
        const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

        if (!AZURE_TENANT_ID || !AZURE_CLIENT_ID || !AZURE_CLIENT_SECRET || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
            throw new Error("Missing required environment variables.");
        }

        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        // Fetch MS Graph Access Token
        const tokenRes = await fetch(`https://login.microsoftonline.com/${AZURE_TENANT_ID}/oauth2/v2.0/token`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                client_id: AZURE_CLIENT_ID,
                client_secret: AZURE_CLIENT_SECRET,
                scope: "https://graph.microsoft.com/.default",
                grant_type: "client_credentials"
            })
        });

        if (!tokenRes.ok) {
            const errBody = await tokenRes.text();
            throw new Error(`Failed to get Azure Token: ${errBody}`);
        }
        const tokenData = await tokenRes.json();
        const accessToken = tokenData.access_token;

        const graphFetch = async (endpoint: string, options?: RequestInit) => {
            const url = endpoint.startsWith('http') ? endpoint : `https://graph.microsoft.com/v1.0${endpoint}`;
            const res = await fetch(url, {
                ...options,
                headers: {
                    ...options?.headers,
                    "Authorization": `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                    "Prefer": "HonorNonIndexedQueriesWarningMayFailRandomly"
                }
            });
            if (!res.ok) {
                const errBody = await res.text();
                throw new Error(`Graph API error at ${endpoint}: ${res.status} ${errBody}`);
            }
            if (options?.method === "PATCH") return null;
            return res.json();
        };

        // Resolve Site and List ID
        const site = await graphFetch(`/sites/${HOST}:/sites/${SITE_PATH}`);
        const siteId = site.id;

        const lists = await graphFetch(`/sites/${siteId}/lists`);
        const list = lists.value.find((l: any) => l.name === LIST_NAME || l.displayName === LIST_NAME);
        if (!list) throw new Error('SharePoint list not found!');
        const listId = list.id;

        let reqBody: any = {};
        if (req.method === "POST") {
            try {
                reqBody = await req.json();
            } catch (e) {
                // Ignore parsing error
            }
        }

        // Use 6 minutes as interval to ensure overlap with 5 minute cron
        // If triggered manually from the UI, look back 24 hours to ensure we don't miss anything
        const isManual = reqBody.source === "aprobacion-facturas" || reqBody.manual;
        const minutesBack = isManual ? 24 * 60 : 6;
        const lastSyncTime = new Date(Date.now() - minutesBack * 60 * 1000);
        console.log(`Syncing changes since: ${lastSyncTime.toISOString()} (manual: ${isManual})`);

        const spFilter = `fields/Modified ge '${lastSyncTime.toISOString()}'`;
        const spChangesRes = await graphFetch(`/sites/${siteId}/lists/${listId}/items?expand=fields&$filter=${spFilter}`);
        const spChanges = spChangesRes.value || [];
        console.log(`[SP->SB] Found ${spChanges.length} modified items in SharePoint.`);

        const { data: sbChanges = [], error: sbError } = await supabase
            .from('Registro_Facturas')
            .select('*')
            .gt('updated_at', lastSyncTime.toISOString());

        if (sbError) throw sbError;
        console.log(`[SB->SP] Found ${sbChanges.length} modified items in Supabase.`);

        const processedSPIds = new Set<string>();
        let spToSbCount = 0;
        let sbToSpCount = 0;

        // Helper mappers
        const mapSpToSupabase = (fields: any, spItemId: string) => {
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
                Creado_por: fields.AuthorLookupId ? String(fields.AuthorLookupId) : (fields["Creado por"] ?? null),
                CUFE: fields.CUFE ?? null,
                InformeRecepcion: fields.InformeRecepcion ?? null,
                FechaProcesado: fields.FechaProcesado ?? null,
                DigitadoPor: fields.DigitadoPor ?? null,
                Datos_adjuntos: hasAttachmentsFlag ? 1 : 0,
                tablaCostos: fields.tablaCostos ?? null,
                Procesado: fields.Procesado != null ? String(fields.Procesado) : null,
                Modificado: fields.Modified ?? fields.Modificado ?? null,
                Modificado_por: fields.EditorLookupId ? String(fields.EditorLookupId) : (fields["Modificado por"] ?? null),
                fp: fields.fp ?? null,
                documentos: fields.fp ?? fields.documentos ?? null,
                updated_at: new Date().toISOString()
            };
        };

        const mapSupabaseToSp = (sbItem: any) => {
            const payload: any = {};
            if (sbItem.Proveedor !== null)               payload.Proveedor = sbItem.Proveedor;
            if (sbItem.Nit !== null)                      payload.Nit = sbItem.Nit;
            if (sbItem.Nro_Factura !== null)              payload.Nro_Factura = sbItem.Nro_Factura;
            if (sbItem.Aprobacion_Doliente !== null)      payload.Aprobacion_Doliente = sbItem.Aprobacion_Doliente;
            if (sbItem.Gestion_Contabilidad !== null)     payload.Gestion_Contabilidad = sbItem.Gestion_Contabilidad;
            if (sbItem.Observaciones !== null)            payload.Observaciones = sbItem.Observaciones;
            if (sbItem.Consecutivo !== null)              payload.Consecutivo = sbItem.Consecutivo;
            if (sbItem.centro_costos !== null)            payload.centro_costos = sbItem.centro_costos;
            if (sbItem.tiene_anticipo !== null)           payload.tiene_anticipo = sbItem.tiene_anticipo;
            if (sbItem.CUFE !== null)                     payload.CUFE = sbItem.CUFE;
            if (sbItem.InformeRecepcion !== null)         payload.InformeRecepcion = sbItem.InformeRecepcion;
            if (sbItem.FechaAprobacion !== null)          payload.FechaAprobacion = sbItem.FechaAprobacion;
            if (sbItem.fp !== null)                       payload.fp = sbItem.fp;
            if (sbItem.Procesado !== null)               payload.Procesado = sbItem.Procesado === 'true' || sbItem.Procesado === true;
            if (sbItem.Valor_total !== null)              payload.Valortotal = sbItem.Valor_total;
            return payload;
        };

        // Process SP -> SB
        for (const spItem of spChanges) {
            const spItemId = String(spItem.id);
            processedSPIds.add(spItemId);
            const invoiceData = mapSpToSupabase(spItem.fields, spItemId);

            const conflictEntry = sbChanges.find((sb: any) => String(sb.sharepoint_id) === spItemId);
            if (conflictEntry) {
                const spDate = new Date(invoiceData.Modificado || 0);
                const sbDate = new Date(conflictEntry.updated_at || 0);
                if (sbDate > spDate) {
                    console.log(`[SP->SB] Skip ID: ${spItemId} (Supabase is newer)`);
                    continue;
                }
            }

            console.log(`[SP->SB] Upserting SP ID: ${spItemId}`);
            const { error } = await supabase
                .from('Registro_Facturas')
                .upsert(invoiceData, { onConflict: 'ID' });
            
            if (error) console.error(`[SP->SB] Failed for ${spItemId}:`, error.message);
            else spToSbCount++;
        }

        // Process SB -> SP
        for (const sbItem of sbChanges) {
            const spItemId = sbItem.sharepoint_id;
            if (!spItemId || processedSPIds.has(String(spItemId))) continue;

            const spUpdateFields = mapSupabaseToSp(sbItem);
            if (Object.keys(spUpdateFields).length === 0) continue;

            console.log(`[SB->SP] Updating SP ID: ${spItemId}`);
            try {
                await graphFetch(`/sites/${siteId}/lists/${listId}/items/${spItemId}/fields`, {
                    method: "PATCH",
                    body: JSON.stringify(spUpdateFields)
                });
                sbToSpCount++;
            } catch (spErr: any) {
                console.error(`[SB->SP] Failed for SP ID ${spItemId}:`, spErr.message);
            }
        }

        console.log(`✅ Sync complete. SP->SB: ${spToSbCount}, SB->SP: ${sbToSpCount}`);
        
        return new Response(JSON.stringify({
            success: true,
            spToSbCount,
            sbToSpCount
        }), {
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error: any) {
        console.error('Fatal error during sync:', error);
        return new Response(JSON.stringify({ success: false, error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
});
