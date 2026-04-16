import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load env vars manually
const envFile = readFileSync(join(__dirname, '.env.local'), 'utf-8');
envFile.split('\n').forEach(line => {
    const [key, ...vals] = line.split('=');
    if (key && vals.length) process.env[key.trim()] = vals.join('=').trim();
});

const { ConfidentialClientApplication } = await import('@azure/msal-node');
const { Client } = await import('@microsoft/microsoft-graph-client');
const { createClient } = await import('@supabase/supabase-js');

const cca = new ConfidentialClientApplication({
    auth: {
        clientId: process.env.AZURE_CLIENT_ID,
        authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
        clientSecret: process.env.AZURE_CLIENT_SECRET,
    },
});

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

const response = await cca.acquireTokenByClientCredential({
    scopes: ['https://graph.microsoft.com/.default'],
});

const client = Client.init({
    authProvider: (done) => done(null, response.accessToken),
});

async function test() {
    const siteResponse = await client.api('/sites/firplaksa.sharepoint.com:/sites/FPKContabilidad').get();
    const siteId = siteResponse.id;

    const listsResponse = await client.api(`/sites/${siteId}/lists`).get();
    const list = listsResponse.value.find(l => l.name === 'Registro_de_Facturas' || l.displayName === 'Registro_de_Facturas');
    const listId = list.id;

    console.log(`Site ID: ${siteId}`);
    console.log(`List ID: ${listId}`);

    const spItemId = '47600';
    const attachmentsRes = await client.api(`/sites/${siteId}/lists/${listId}/items/${spItemId}/attachments`).get();
    const attachments = attachmentsRes.value || [];

    console.log(`Found ${attachments.length} attachments for item ${spItemId}`);

    for (const att of attachments) {
        console.log(`Processing attachment: ${att.name} (id: ${att.id})`);

        // This is the Graph way to get content
        const fileRes = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${listId}/items/${spItemId}/attachments/${att.id}/$value`, {
            headers: { Authorization: `Bearer ${response.accessToken}` }
        });

        if (fileRes.ok) {
            const buffer = await fileRes.arrayBuffer();
            console.log(`Successfully downloaded ${att.name}, size: ${buffer.byteLength} bytes.`);

            const safeFileName = `test/${spItemId}-${att.name}`;
            const { error: uploadError } = await supabaseAdmin.storage
                .from('facturas-documentos')
                .upload(safeFileName, Buffer.from(buffer), {
                    contentType: fileRes.headers.get('content-type') || 'application/octet-stream',
                    upsert: true
                });

            if (uploadError) {
                console.error(`Upload error: ${uploadError.message}`);
            } else {
                console.log(`Successfully uploaded to Supabase: ${safeFileName}`);
            }
        } else {
            console.error(`Download failed: ${fileRes.status} ${fileRes.statusText}`);
            const errorText = await fileRes.text();
            console.error(`Error details: ${errorText}`);
        }
    }
}

test().catch(console.error);
