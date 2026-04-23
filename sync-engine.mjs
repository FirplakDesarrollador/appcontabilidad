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

async function getGraphClient() {
    const response = await cca.acquireTokenByClientCredential({
        scopes: ['https://graph.microsoft.com/.default'],
    });
    return Client.init({
        authProvider: (done) => done(null, response.accessToken),
    });
}

function getLastSyncTime() {
    const path = join(__dirname, 'last_sync.json');
    if (existsSync(path)) {
        const data = JSON.parse(readFileSync(path, 'utf8'));
        return new Date(data.lastSyncTime);
    }
    // Default to 1 hour ago if no previous sync
    const date = new Date();
    date.setHours(date.getHours() - 1);
    return date;
}

function saveLastSyncTime(date) {
    const path = join(__dirname, 'last_sync.json');
    writeFileSync(path, JSON.stringify({ lastSyncTime: date.toISOString() }));
}

async function runSync() {
    console.log(`\n[${new Date().toISOString()}] Starting bidirectional sync...`);
    const syncStartTime = new Date();
    const lastSyncTime = getLastSyncTime();
    console.log(`Syncing changes since: ${lastSyncTime.toISOString()}`);

    try {
        const graphClient = await getGraphClient();
        
        // 1. Get Site and List IDs
        const site = await graphClient.api(`/sites/${HOST}:/sites/${SITE_PATH}`).get();
        const lists = await graphClient.api(`/sites/${site.id}/lists`).get();
        const list = lists.value.find(l => l.name === LIST_NAME || l.displayName === LIST_NAME);
        
        if (!list) {
            console.error('SharePoint list not found!');
            return;
        }

        // 2. Fetch changes from SharePoint
        const spFilter = `fields/Modified ge '${lastSyncTime.toISOString()}'`;
        console.log(`Checking SharePoint for updates...`);
        const spChangesRes = await graphClient.api(`/sites/${site.id}/lists/${list.id}/items`)
            .expand('fields')
            .filter(spFilter)
            .get();
        const spChanges = spChangesRes.value || [];
        console.log(`Found ${spChanges.length} modified items in SharePoint.`);

        // 3. Fetch changes from Supabase
        console.log(`Checking Supabase for updates...`);
        const { data: sbChanges, error: sbError } = await supabase
            .from('Registro_Facturas')
            .select('*')
            .gt('updated_at', lastSyncTime.toISOString());
            
        if (sbError) {
            console.error('Error fetching from Supabase:', sbError.message);
            return;
        }
        
        console.log(`Found ${sbChanges.length} modified items in Supabase.`);

        // Track items we've already synced to avoid duplicate work or loops in this cycle
        const processedSPIds = new Set();

        // --- STEP A: Sync from SharePoint -> Supabase ---
        for (const spItem of spChanges) {
            const spItemId = spItem.id;
            const fields = spItem.fields;
            processedSPIds.add(String(spItemId));
            
            // Map fields (same as migration script)
            const invoiceData = {
                ID: Number(spItemId),
                sharepoint_id: String(spItemId),
                Nit: fields.Nit || null,
                Proveedor: fields.Proveedor || null,
                Nro_Factura: fields.Nro_Factura || null,
                Aprobacion_Doliente: fields.Aprobacion_Doliente || null,
                Gestion_Contabilidad: fields.Gestion_Contabilidad || null,
                Observaciones: fields.Observaciones || null,
                Consecutivo: fields.Consecutivo || null,
                Responsable_de_Autorizar: fields.Responsable_de_Autorizar || null,
                FechaAprobacion: fields.FechaAprobacion || null,
                centro_costos: fields.centro_costos || null,
                "Valor total": fields["Valor total"] || fields["Valor_x0020_total"] || null,
                tiene_anticipo: fields.tiene_anticipo || null,
                Creado: fields.Created || null,
                "Creado por": fields.AuthorLookupId || null,
                CUFE: fields.CUFE || null,
                InformeRecepcion: fields.InformeRecepcion || null,
                FechaProcesado: fields.FechaProcesado || null,
                DigitadoPor: fields.DigitadoPor || null,
                Procesado: fields.Procesado || null,
                Modificado: fields.Modified || null,
                "Modificado por": fields.EditorLookupId || null,
                fp: fields.fp || null
            };

            // Before upserting, check if this same item was also modified in Supabase recently
            const conflictEntry = sbChanges.find(sb => sb.sharepoint_id === invoiceData.sharepoint_id);
            if (conflictEntry) {
                // Conflict resolution: compare modified dates. We assume 'updated_at' for SB vs 'Modified' for SP
                const spDate = new Date(invoiceData.Modificado);
                const sbDate = new Date(conflictEntry.updated_at);
                if (sbDate > spDate) {
                    // Supabase is newer, skip updating SP -> SB, it will be handled in STEP B
                    console.log(`[SP->SB] Skip ID: ${spItemId} (Supabase has newer changes)`);
                    continue;
                }
            }

            console.log(`[SP->SB] Syncing SharePoint ID: ${spItemId} to Supabase...`);
            const { error: upsertErr } = await supabase.from('Registro_Facturas').upsert(invoiceData, { onConflict: 'ID' });
            if (upsertErr) {
                console.error(`[SP->SB] Failed to sync ${spItemId}:`, upsertErr.message);
            }
        }

        // --- STEP B: Sync from Supabase -> SharePoint ---
        for (const sbItem of sbChanges) {
            const spItemId = sbItem.sharepoint_id;
            
            // Skip if we already synced this item downwards because SP was newer
            if (spItemId && processedSPIds.has(spItemId)) {
                continue;
            }

            if (!spItemId) {
                console.log(`[SB->SP] Supabase ID ${sbItem.ID} has no sharepoint_id. Cannot sync backwards yet.`);
                continue;
            }

            console.log(`[SB->SP] Syncing Supabase changes for SP ID: ${spItemId} back to SharePoint...`);
            
            // Map Supabase fields back to SharePoint expected fields
            const spUpdateFields = {
                Proveedor: sbItem.Proveedor || "",
                Nit: sbItem.Nit || "",
                Nro_Factura: sbItem.Nro_Factura || "",
                Aprobacion_Doliente: sbItem.Aprobacion_Doliente || "",
                Gestion_Contabilidad: sbItem.Gestion_Contabilidad || "",
                Observaciones: sbItem.Observaciones || "",
                Consecutivo: sbItem.Consecutivo || "",
                Responsable_de_Autorizar: sbItem.Responsable_de_Autorizar || "",
                centro_costos: sbItem.centro_costos || "",
                tiene_anticipo: sbItem.tiene_anticipo || null,
                CUFE: sbItem.CUFE || "",
                InformeRecepcion: sbItem.InformeRecepcion || "",
                fp: sbItem.fp || "",
                Procesado: sbItem.Procesado === 'true' ? true : (sbItem.Procesado === 'false' ? false : null)
            };

            // Remove nulls to avoid Graph API errors
            Object.keys(spUpdateFields).forEach(key => spUpdateFields[key] === null && delete spUpdateFields[key]);

            try {
                // Graph API expects a PATCH with the fields object
                await graphClient.api(`/sites/${site.id}/lists/${list.id}/items/${spItemId}/fields`)
                    .patch(spUpdateFields);
                console.log(`[SB->SP] Successfully updated SP ID: ${spItemId}`);
            } catch (spErr) {
                console.error(`[SB->SP] Failed to update SP ID: ${spItemId}:`, spErr.message);
            }
        }

        // Save new standard sync time 
        // We use the start time of this operation to ensure we don't miss anything that happened DURING the sync
        saveLastSyncTime(syncStartTime);
        console.log(`Sync complete. Last sync time updated.`);

    } catch (err) {
        console.error('Fatal error during sync:', err);
    }
}

// Run immediately and then poll every 60 seconds
runSync();
setInterval(runSync, 60000);
