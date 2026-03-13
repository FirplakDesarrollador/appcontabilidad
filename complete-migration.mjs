import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createClient } from '@supabase/supabase-js';
import * as msal from '@azure/msal-node';
import { Client } from '@microsoft/microsoft-graph-client';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load env vars from .env
try {
    const envFile = readFileSync(join(__dirname, '.env'), 'utf-8');
    envFile.split('\n').forEach(line => {
        const [key, ...vals] = line.split('=');
        if (key && vals.length) process.env[key.trim()] = vals.join('=').trim();
    });
} catch (e) {
    console.error('Error loading .env:', e.message);
}

const HOST = 'firplaksa.sharepoint.com';
const SITE_PATH = 'FPKContabilidad';
const LIST_NAME = 'Registro_de_Facturas';
const BUCKET = 'facturas-documentos';
const SP_BASE = `https://${HOST}/sites/${SITE_PATH}`;

const msalConfig = {
    auth: {
        clientId: process.env.AZURE_CLIENT_ID,
        authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
        clientSecret: process.env.AZURE_CLIENT_SECRET,
    },
};

const cca = new msal.ConfidentialClientApplication(msalConfig);

async function getTokens() {
    console.log('Acquiring tokens...');
    const graphResponse = await cca.acquireTokenByClientCredential({
        scopes: ['https://graph.microsoft.com/.default'],
    });
    const spResponse = await cca.acquireTokenByClientCredential({
        scopes: ['https://firplaksa.sharepoint.com/.default'],
    });
    return {
        graph: graphResponse.accessToken,
        sharepoint: spResponse.accessToken,
    };
}

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function migrate() {
    const { graph: graphToken, sharepoint: spToken } = await getTokens();
    const client = Client.init({
        authProvider: (done) => done(null, graphToken),
    });

    console.log(`Fetching site info for /sites/${HOST}:/sites/${SITE_PATH}...`);
    const site = await client.api(`/sites/${HOST}:/sites/${SITE_PATH}`).get();
    const SITE_ID = site.id;

    console.log('Fetching list metadata to get List ID...');
    const lists = await client.api(`/sites/${SITE_ID}/lists`).get();
    const list = lists.value.find(l => l.name === LIST_NAME || l.displayName === LIST_NAME);
    if (!list) throw new Error(`List ${LIST_NAME} not found`);
    const listId = list.id;
    console.log(`List ID: ${listId}`);

    let allItems = [];
    let nextLink = `/sites/${SITE_ID}/lists/${listId}/items?expand=fields&top=500`;

    console.log('Starting data fetch from SharePoint...');
    while (nextLink) {
        const response = await client.api(nextLink).get();
        allItems = [...allItems, ...response.value];
        nextLink = response['@odata.nextLink'] ? response['@odata.nextLink'].split('v1.0')[1] : null;
        console.log(`Fetched ${allItems.length} items...`);
    }

    console.log(`Total items to process: ${allItems.length}`);

    for (let i = 0; i < allItems.length; i++) {
        const item = allItems[i];
        const fields = item.fields;
        const spItemId = item.id;

        // Map fields to Supabase schema
        const invoiceData = {
            ID: Number(spItemId),
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
            "Valor total": fields["Valor_x0020_total"] || fields["Valor total"] || null,
            tiene_anticipo: fields.tiene_anticipo || null,
            Creado: fields.Created || null,
            "Creado por": fields.AuthorLookupId || null,
            CUFE: fields.CUFE || null,
            InformeRecepcion: fields.InformeRecepcion || null,
            FechaProcesado: fields.FechaProcesado || null,
            DigitadoPor: fields.DigitadoPor || null,
            "Datos adjuntos": fields.Attachments ? 1 : 0,
            tablaCostos: fields.tablaCostos || null,
            Procesado: fields.Procesado || null,
            Modificado: fields.Modified || null,
            "Modificado por": fields.EditorLookupId || null,
            fp: fields.fp || null,
            notificar_reasignacion: fields.notificar_reasignacion === 'Sí' || fields.notificar_reasignacion === true,
            sharepoint_id: String(spItemId)
        };

        // 1. Upsert metadata
        const { error: upsertError } = await supabase
            .from('Registro_Facturas')
            .upsert(invoiceData);

        if (upsertError) {
            console.error(`Error upserting item ${spItemId}:`, upsertError.message);
            continue;
        }

        // 2. Process attachments if flag is true
        if (fields.Attachments) {
            console.log(`[${i + 1}/${allItems.length}] Processing attachments for item ${spItemId}...`);
            try {
                const attachUrl = `${SP_BASE}/_api/web/lists/getbytitle('${LIST_NAME}')/items(${spItemId})/AttachmentFiles`;
                const attachRes = await fetch(attachUrl, {
                    headers: {
                        'Authorization': `Bearer ${spToken}`,
                        'Accept': 'application/json;odata=nometadata'
                    }
                });

                if (attachRes.ok) {
                    const attachData = await attachRes.json();
                    const attachments = attachData.value || [];
                    const uploadedUrls = [];

                    for (const attachment of attachments) {
                        const fileName = attachment.FileName;
                        const safeName = `${spItemId}/${Date.now()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
                        const downloadUrl = `https://firplaksa.sharepoint.com${attachment.ServerRelativeUrl}`;

                        const fileRes = await fetch(downloadUrl, {
                            headers: { 'Authorization': `Bearer ${spToken}` }
                        });

                        if (fileRes.ok) {
                            const buffer = await fileRes.arrayBuffer();
                            const ext = fileName.split('.').pop().toLowerCase();
                            const contentType = ext === 'pdf' ? 'application/pdf' : 'application/octet-stream';

                            const { error: uploadError } = await supabase.storage
                                .from(BUCKET)
                                .upload(safeName, Buffer.from(buffer), { contentType, upsert: true });

                            if (!uploadError) {
                                const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(safeName);
                                uploadedUrls.push(pub.publicUrl);
                            } else {
                                console.error(`  Upload error for ${fileName}:`, uploadError.message);
                            }
                        } else {
                            console.error(`  Download error for ${fileName}: ${fileRes.status}`);
                        }
                    }

                    if (uploadedUrls.length > 0) {
                        const docValue = uploadedUrls.length === 1 ? uploadedUrls[0] : JSON.stringify(uploadedUrls);
                        await supabase.from('Registro_Facturas').update({ documentos: docValue }).eq('ID', spItemId);
                        console.log(`  Uploaded ${uploadedUrls.length} files.`);
                    }
                } else {
                    console.error(`  Failed to fetch attachment list for ${spItemId}: ${attachRes.status}`);
                }
            } catch (err) {
                console.error(`  Error processing attachments for ${spItemId}:`, err.message);
            }
        }

        if ((i + 1) % 50 === 0) {
            console.log(`Processed ${i + 1} / ${allItems.length} items...`);
        }
    }

    console.log('Migration completed successfully!');
}

migrate().catch(err => {
    console.error('Fatal migration error:', err);
});
