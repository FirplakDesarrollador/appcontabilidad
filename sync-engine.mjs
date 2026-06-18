import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load env vars
try {
    const envFile = readFileSync(join(__dirname, '.env'), 'utf-8');
    envFile.split('\n').forEach(line => {
        const [key, ...vals] = line.split('=');
        if (key && vals.length) process.env[key.trim()] = vals.join('=').trim();
    });
} catch (e) {
    console.error('Error loading .env:', e.message);
    process.exit(1);
}

const { ConfidentialClientApplication } = await import('@azure/msal-node');
const { Client } = await import('@microsoft/microsoft-graph-client');
const { createClient } = await import('@supabase/supabase-js');

// Config
const HOST = 'firplaksa.sharepoint.com';
const SITE_PATH = 'FPKContabilidad';
const LIST_NAME = 'Registro_de_Facturas';
const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutos

const cca = new ConfidentialClientApplication({
    auth: {
        clientId: process.env.AZURE_CLIENT_ID,
        authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
        clientSecret: process.env.AZURE_CLIENT_SECRET,
    },
});

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// ─── Caché de IDs para no re-resolver en cada ciclo ──────────────────────────
let cachedSiteId = null;
let cachedListId = null;

async function getGraphClient() {
    const response = await cca.acquireTokenByClientCredential({
        scopes: ['https://graph.microsoft.com/.default'],
    });
    return Client.init({
        authProvider: (done) => done(null, response.accessToken),
    });
}

async function getSiteAndListId(client) {
    if (cachedSiteId && cachedListId) return { siteId: cachedSiteId, listId: cachedListId };
    
    const site = await client.api(`/sites/${HOST}:/sites/${SITE_PATH}`).get();
    cachedSiteId = site.id;
    
    const lists = await client.api(`/sites/${cachedSiteId}/lists`).get();
    const list = lists.value.find(l => l.name === LIST_NAME || l.displayName === LIST_NAME);
    if (!list) throw new Error('SharePoint list not found!');
    cachedListId = list.id;
    
    console.log(`[Sync] Site ID cached: ${cachedSiteId.substring(0, 20)}...`);
    console.log(`[Sync] List ID cached: ${cachedListId}`);
    return { siteId: cachedSiteId, listId: cachedListId };
}

function getLastSyncTime() {
    const path = join(__dirname, 'last_sync.json');
    if (existsSync(path)) {
        const data = JSON.parse(readFileSync(path, 'utf8'));
        return new Date(data.lastSyncTime);
    }
    const date = new Date();
    date.setHours(date.getHours() - 1);
    return date;
}

function saveLastSyncTime(date) {
    const path = join(__dirname, 'last_sync.json');
    writeFileSync(path, JSON.stringify({ lastSyncTime: date.toISOString() }));
}

// ─── Caché de usuarios en memoria para sync-engine ───────────────────────────
let globalUserMap = null;
let lastUserFetch = 0;
const USER_CACHE_TTL = 30 * 60 * 1000; // 30 minutos

async function getCachedUserMap(client, siteId) {
    const now = Date.now();
    if (globalUserMap && (now - lastUserFetch < USER_CACHE_TTL)) return globalUserMap;
    const userMap = new Map();
    try {
        console.log("[Sync] Fetching User Information List...");
        let userNextLink = `/sites/${siteId}/lists('User Information List')/items?$select=id,fields&$expand=fields($select=Title)&$top=500`;
        while (userNextLink) {
            const userResponse = await client.api(userNextLink).get();
            for (const u of userResponse.value) {
                if (u.fields?.Title) userMap.set(String(u.id), u.fields.Title);
            }
            userNextLink = userResponse['@odata.nextLink'] ? userResponse['@odata.nextLink'].split('v1.0')[1] : null;
        }
        globalUserMap = userMap;
        lastUserFetch = now;
        console.log(`[Sync] Loaded ${userMap.size} users into cache`);
    } catch (e) {
        console.warn('[Sync] Could not load User Information List:', e.message);
        if (!globalUserMap) globalUserMap = new Map();
    }
    return globalUserMap;
}

// ─── Mapeo de campos SharePoint → Supabase ────────────────────────────────────
function mapSpToSupabase(spItem, userMap) {
    const fields = spItem.fields || spItem;
    const spItemId = spItem.id || fields.id;
    
    const lookupId = fields.ResponsabledeAutorizarLookupId
        || fields.ResponsableAprobarLookupId
        || fields.Responsable_de_AutorizarLookupId;
    const responsable = lookupId && userMap ? (userMap.get(String(lookupId)) || null) : (fields.Responsable_de_Autorizar ?? null);

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
        // Nuevo nombre de columna: Valor_total (era "Valor total")
        Valor_total: fields.Valor_x0020_total ?? fields["Valor total"] ?? fields.Valor_total ?? null,
        tiene_anticipo: fields.tiene_anticipo ?? null,
        Creado: fields.Created ?? fields.Creado ?? null,
        // Nuevo nombre: Creado_por (era "Creado por")
        Creado_por: fields.AuthorLookupId ? String(fields.AuthorLookupId) : (fields["Creado por"] ?? null),
        CUFE: fields.CUFE ?? null,
        InformeRecepcion: fields.InformeRecepcion ?? null,
        FechaProcesado: fields.FechaProcesado ?? null,
        DigitadoPor: fields.DigitadoPor ?? null,
        // Nuevo nombre: Datos_adjuntos (era "Datos adjuntos")
        Datos_adjuntos: fields.Attachments === true ? 1 : (Number(fields.Datos_adjuntos) || 0),
        tablaCostos: fields.tablaCostos ?? null,
        Procesado: fields.Procesado != null ? String(fields.Procesado) : null,
        // Modificado ya tenía ese nombre
        Modificado: fields.Modified ?? fields.Modificado ?? null,
        // Nuevo nombre: Modificado_por (era "Modificado por")
        Modificado_por: fields.EditorLookupId ? String(fields.EditorLookupId) : (fields["Modificado por"] ?? null),
        fp: fields.fp ?? null,
        documentos: fields.fp ?? fields.documentos ?? null,
    };
}

// ─── Mapeo de campos Supabase → SharePoint ────────────────────────────────────
function mapSupabaseToSp(sbItem) {
    const payload = {};
    if (sbItem.Proveedor != null)               payload.Proveedor = sbItem.Proveedor;
    if (sbItem.Nit != null)                      payload.Title = sbItem.Nit;
    if (sbItem.Nro_Factura != null)              payload.Nro_Factura = sbItem.Nro_Factura;
    if (sbItem.Aprobacion_Doliente != null)      payload.Aprobacion_Doliente = sbItem.Aprobacion_Doliente;
    if (sbItem.Gestion_Contabilidad != null)     payload.Gestion_Contabilidad = sbItem.Gestion_Contabilidad;
    if (sbItem.Observaciones != null)            payload.Observaciones = sbItem.Observaciones;
    if (sbItem.Consecutivo != null)              payload.Consecutivo = sbItem.Consecutivo;
    if (sbItem.Responsable_de_Autorizar != null) {
        // En SharePoint, el responsable es un Lookup (Persona) y no se puede actualizar con un string.
        // Se actualiza a través de su propio endpoint de asignación dedicada.
    }
    if (sbItem.centro_costos != null)            payload.centro_costos = sbItem.centro_costos;
    if (sbItem.tiene_anticipo != null)           payload.tiene_anticipo = sbItem.tiene_anticipo;
    if (sbItem.CUFE != null)                     payload.CUFE = sbItem.CUFE;
    if (sbItem.InformeRecepcion != null)         payload.InformeRecepcion = sbItem.InformeRecepcion;
    if (sbItem.FechaAprobacion != null)          payload.FechaAprobacion = sbItem.FechaAprobacion;
    if (sbItem.fp != null)                       payload.fp = sbItem.fp;
    if (sbItem.Procesado != null)               payload.Procesado = sbItem.Procesado === 'true';
    // Valor total: SP usa el nombre interno "Valortotal"
    if (sbItem.Valor_total != null)              payload.Valortotal = sbItem.Valor_total;
    return payload;
}

async function runSync() {
    console.log(`\n[${new Date().toISOString()}] Starting bidirectional sync (interval: ${SYNC_INTERVAL_MS/1000}s)...`);
    const syncStartTime = new Date();
    const lastSyncTime = getLastSyncTime();
    console.log(`Syncing changes since: ${lastSyncTime.toISOString()}`);

    try {
        const graphClient = await getGraphClient();
        const { siteId, listId } = await getSiteAndListId(graphClient);
        const userMap = await getCachedUserMap(graphClient, siteId);

        // ── A: SharePoint → Supabase ──────────────────────────────────────────
        let spChanges = [];
        let spNextLink = `/sites/${siteId}/lists/${listId}/items?expand=fields&$top=500`;
        const spFilter = `fields/Modified ge '${lastSyncTime.toISOString()}'`;
        
        console.log(`[SP→SB] Fetching modified items from SharePoint...`);
        while (spNextLink) {
            const req = graphClient.api(spNextLink).header('Prefer', 'HonorNonIndexedQueriesWarningMayFailRandomly');
            if (spNextLink.includes('?expand=fields') && !spNextLink.includes('skiptoken')) {
                req.filter(spFilter);
            }
            const res = await req.get();
            spChanges = spChanges.concat(res.value || []);
            spNextLink = res['@odata.nextLink'] ? res['@odata.nextLink'].split('v1.0')[1] : null;
        }
        console.log(`[SP→SB] Found ${spChanges.length} modified items in SharePoint.`);

        // ── B: Supabase → SharePoint ──────────────────────────────────────────
        let sbChanges = [];
        let sbHasMore = true;
        let sbOffset = 0;
        const sbLimit = 1000;
        
        console.log(`[SB→SP] Fetching modified items from Supabase...`);
        while (sbHasMore) {
            const { data: batch, error: sbError } = await supabase
                .from('Registro_Facturas')
                .select('*')
                .gt('updated_at', lastSyncTime.toISOString())
                .range(sbOffset, sbOffset + sbLimit - 1);
            
            if (sbError) {
                console.error('Error fetching from Supabase:', sbError.message);
                return;
            }
            
            sbChanges = sbChanges.concat(batch || []);
            if (!batch || batch.length < sbLimit) {
                sbHasMore = false;
            } else {
                sbOffset += sbLimit;
            }
        }
        console.log(`[SB→SP] Found ${sbChanges.length} modified items in Supabase.`);

        const processedSPIds = new Set();

        // ── Paso A: SP → SB ───────────────────────────────────────────────────
        for (const spItem of spChanges) {
            const spItemId = String(spItem.id);
            processedSPIds.add(spItemId);

            const invoiceData = mapSpToSupabase(spItem, userMap);

            // Resolución de conflictos: si SB es más reciente, SB gana
            const conflictEntry = sbChanges.find(sb => String(sb.sharepoint_id) === spItemId);
            if (conflictEntry) {
                const spDate = new Date(invoiceData.Modificado || 0);
                const sbDate = new Date(conflictEntry.updated_at || 0);
                if (sbDate > spDate) {
                    console.log(`[SP→SB] Skip ID: ${spItemId} (Supabase is newer by ${Math.round((sbDate - spDate)/1000)}s)`);
                    continue;
                }
            }

            console.log(`[SP→SB] Upserting SP ID: ${spItemId}`);
            const { error } = await supabase
                .from('Registro_Facturas')
                .upsert(invoiceData, { onConflict: 'ID' });
            if (error) console.error(`[SP→SB] Failed for ${spItemId}:`, error.message);
        }

        // ── Paso B: SB → SP ───────────────────────────────────────────────────
        for (const sbItem of sbChanges) {
            const spItemId = sbItem.sharepoint_id;
            if (!spItemId) {
                console.log(`[SB→SP] Supabase ID ${sbItem.ID} has no sharepoint_id. Skipping.`);
                continue;
            }
            if (processedSPIds.has(spItemId)) continue; // SP era más reciente, ya se procesó

            const spUpdateFields = mapSupabaseToSp(sbItem);
            if (Object.keys(spUpdateFields).length === 0) continue;

            console.log(`[SB→SP] Updating SP ID: ${spItemId}`);
            try {
                await graphClient
                    .api(`/sites/${siteId}/lists/${listId}/items/${spItemId}/fields`)
                    .patch(spUpdateFields);
                console.log(`[SB→SP] ✓ Updated SP ID: ${spItemId}`);
            } catch (spErr) {
                console.error(`[SB→SP] Failed for SP ID ${spItemId}:`, spErr.message);
            }
        }

        saveLastSyncTime(syncStartTime);
        console.log(`✅ Sync complete. Next sync in ${SYNC_INTERVAL_MS/1000}s`);

    } catch (err) {
        console.error('Fatal error during sync:', err);
    }
}

// Ejecutar inmediatamente y luego cada 5 minutos
runSync();
setInterval(runSync, SYNC_INTERVAL_MS);
