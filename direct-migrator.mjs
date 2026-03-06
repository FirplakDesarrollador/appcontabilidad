import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env.local
try {
    const envFile = readFileSync(join(__dirname, '.env.local'), 'utf-8');
    envFile.split('\n').forEach(line => {
        const [key, ...vals] = line.split('=');
        if (key && vals.length) process.env[key.trim()] = vals.join('=').trim();
    });
} catch (e) {
    console.error('No .env.local file found');
    process.exit(1);
}

const { ConfidentialClientApplication } = await import('@azure/msal-node');
const { Client } = await import('@microsoft/microsoft-graph-client');
const { createClient } = await import('@supabase/supabase-js');

// Configuration
const SHAREPOINT_HOST = 'firplaksa.sharepoint.com';
const SHAREPOINT_SITE = 'FPKContabilidad';
const LIST_NAME = 'Registro_de_Facturas';
const SUPABASE_BUCKET = 'facturas-documentos';

// MSAL Configurations
const msalConfig = {
    auth: {
        clientId: process.env.AZURE_CLIENT_ID,
        authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
        clientSecret: process.env.AZURE_CLIENT_SECRET,
    },
};

const cca = new ConfidentialClientApplication(msalConfig);

// Create Supabase client
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function getGraphClient() {
    const authResponse = await cca.acquireTokenByClientCredential({
        scopes: ['https://graph.microsoft.com/.default'],
    });
    return Client.init({
        authProvider: (done) => done(null, authResponse.accessToken),
    });
}

async function getSharePointToken() {
    // Crucial: Scope for SharePoint REST API
    const authResponse = await cca.acquireTokenByClientCredential({
        scopes: [`https://${SHAREPOINT_HOST}/.default`],
    });
    return authResponse.accessToken;
}

async function runMigration(limit = 10, offset = 0) {
    console.log(`\n--- Starting Migration Batch: Offset ${offset}, Limit ${limit} ---`);

    const graphClient = await getGraphClient();
    const spToken = await getSharePointToken();

    // 1. Resolve Site and List IDs
    const site = await graphClient.api(`/sites/${SHAREPOINT_HOST}:/sites/${SHAREPOINT_SITE}`).get();
    const lists = await graphClient.api(`/sites/${site.id}/lists`).get();
    const list = lists.value.find(l => l.name === LIST_NAME || l.displayName === LIST_NAME);

    if (!list) {
        console.error(`List ${LIST_NAME} not found`);
        return;
    }

    // 2. Fetch items from SharePoint Graph API (metadata)
    console.log('Fetching items from SharePoint...');
    // We fetch a larger chunk to handle the slice
    const response = await graphClient.api(`/sites/${site.id}/lists/${list.id}/items`)
        .expand('fields')
        .top(offset + limit) // Fetch enough for the slice
        .get();

    const items = response.value.slice(offset, offset + limit);
    console.log(`Processing ${items.length} items...`);

    for (const item of items) {
        const fields = item.fields;
        const spItemId = item.id;

        console.log(`\n[${spItemId}] Processing factura ${fields.Nro_Factura || 'S/N'}...`);

        const hasAttachments = fields.Attachments === true || fields['{HasAttachments}'] === true;
        let uploadedDocUrls = [];

        if (hasAttachments) {
            console.log(`[${spItemId}] Item has attachments. Fetching via REST API...`);
            try {
                const restUrl = `https://${SHAREPOINT_HOST}/sites/${SHAREPOINT_SITE}/_api/web/lists/getbytitle('${LIST_NAME}')/items(${spItemId})/AttachmentFiles`;
                const attachRes = await fetch(restUrl, {
                    headers: {
                        'Authorization': `Bearer ${spToken}`,
                        'Accept': 'application/json;odata=nometadata'
                    }
                });

                if (attachRes.ok) {
                    const data = await attachRes.json();
                    const attachments = data.value || [];
                    console.log(`[${spItemId}] Found ${attachments.length} attachments.`);

                    for (const att of attachments) {
                        const fileName = att.FileName;
                        const serverRelativeUrl = att.ServerRelativeUrl;
                        const downloadUrl = `https://${SHAREPOINT_HOST}${serverRelativeUrl}`;

                        console.log(`[${spItemId}] Downloading: ${fileName}...`);

                        const fileBody = await fetch(downloadUrl, {
                            headers: { 'Authorization': `Bearer ${spToken}` }
                        });

                        if (fileBody.ok) {
                            const buffer = await fileBody.arrayBuffer();
                            const destPath = `${spItemId}/${Date.now()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

                            const { error: uploadError } = await supabase.storage
                                .from(SUPABASE_BUCKET)
                                .upload(destPath, Buffer.from(buffer), {
                                    contentType: fileBody.headers.get('content-type') || 'application/octet-stream',
                                    upsert: true
                                });

                            if (!uploadError) {
                                const { data: pubUrl } = supabase.storage.from(SUPABASE_BUCKET).getPublicUrl(destPath);
                                uploadedDocUrls.push(pubUrl.publicUrl);
                                console.log(`[${spItemId}] Uploaded to Supabase: ${pubUrl.publicUrl}`);
                            } else {
                                console.error(`[${spItemId}] Supabase Upload Error:`, uploadError.message);
                            }
                        } else {
                            console.error(`[${spItemId}] File Download Error:`, fileBody.status);
                        }
                    }
                } else {
                    console.error(`[${spItemId}] REST Attachments Error:`, attachRes.status);
                }
            } catch (e) {
                console.error(`[${spItemId}] Attachment Fetch Exception:`, e.message);
            }
        }

        // 3. Upsert into Supabase
        const docValue = uploadedDocUrls.length === 0 ? null
            : (uploadedDocUrls.length === 1 ? uploadedDocUrls[0] : JSON.stringify(uploadedDocUrls));

        const invoiceData = {
            ID: Number(spItemId),
            sharepoint_id: String(spItemId),
            Nit: fields.Nit ?? null,
            Proveedor: fields.Proveedor ?? null,
            Nro_Factura: fields.Nro_Factura ?? null,
            Aprobacion_Doliente: fields.Aprobacion_Doliente ?? null,
            Gestion_Contabilidad: fields.Gestion_Contabilidad ?? null,
            Observaciones: fields.Observaciones ?? null,
            Consecutivo: fields.Consecutivo ?? null,
            Responsable_de_Autorizar: fields.Responsable_de_Autorizar ?? null,
            FechaAprobacion: fields.FechaAprobacion ?? null,
            centro_costos: fields.centro_costos ?? null,
            "Valor total": fields["Valor total"] ?? fields.Valor_total ?? null,
            tiene_anticipo: fields.tiene_anticipo ?? null,
            Creado: fields.Created ?? fields.Creado ?? null,
            "Creado por": fields["Creado por"] ?? fields.Creado_por ?? null,
            CUFE: fields.CUFE ?? null,
            InformeRecepcion: fields.InformeRecepcion ?? null,
            FechaProcesado: fields.FechaProcesado ?? null,
            DigitadoPor: fields.DigitadoPor ?? null,
            "Datos adjuntos": hasAttachments ? uploadedDocUrls.length : 0,
            tablaCostos: fields.tablaCostos ?? null,
            Procesado: fields.Procesado != null ? String(fields.Procesado) : null,
            Modificado: fields.Modified ?? fields.Modificado ?? null,
            "Modificado por": (fields["Modificado por"] || fields.Modificado_por) ?? null,
            fp: fields.fp ?? null,
            documentos: docValue
        };

        const { error: dbError } = await supabase
            .from('Registro_Facturas')
            .upsert(invoiceData, { onConflict: 'ID' });

        if (dbError) {
            console.error(`[${spItemId}] Database Error:`, dbError.message);
        } else {
            console.log(`[${spItemId}] Successfully migrated metadata.`);
        }
    }

    return items.length;
}

// Main execution loop
async function main() {
    try {
        let offset = 0;
        const batchLimit = 20; // Process 20 items at a time
        const totalToSync = 100; // Let's start with first 100 for safety, then we can expand

        console.log('--- STARTING MASSIVE MIGRATION ---');

        while (offset < totalToSync) {
            const processedCount = await runMigration(batchLimit, offset);
            if (processedCount === 0) break;
            offset += processedCount;
            console.log(`\nProgress: ${offset}/${totalToSync} items handled.`);
        }

        console.log('\n--- MIGRATION COMPLETED ---');
    } catch (e) {
        console.error('FATAL ERROR:', e);
    }
}

main();
