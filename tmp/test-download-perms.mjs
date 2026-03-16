import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load env vars manually
const envFile = readFileSync(join(dirname(__dirname), '.env.local'), 'utf-8');
envFile.split('\n').forEach(line => {
    const [key, ...vals] = line.split('=');
    if (key && vals.length) process.env[key.trim()] = vals.join('=').trim();
});

const { ConfidentialClientApplication } = await import('@azure/msal-node');
const { Client } = await import('@microsoft/microsoft-graph-client');

const cca = new ConfidentialClientApplication({
    auth: {
        clientId: process.env.AZURE_CLIENT_ID,
        authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
        clientSecret: process.env.AZURE_CLIENT_SECRET,
    },
});

try {
    const REST_SCOPES = [`https://firplaksa.sharepoint.com/.default`];
    const response = await cca.acquireTokenByClientCredential({
        scopes: REST_SCOPES,
    });

    const token = response.accessToken;
    const headers = {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json;odata=nometadata',
    };

    const SP_BASE = 'https://firplaksa.sharepoint.com/sites/FPKContabilidad';
    const listName = 'Registro_de_Facturas';

    // First, let's try to get an item ID that has attachments using Graph API
    const caGraph = await cca.acquireTokenByClientCredential({
        scopes: ['https://graph.microsoft.com/.default'],
    });
    const client = Client.init({
        authProvider: (done) => done(null, caGraph.accessToken),
    });
    const siteResponse = await client.api('/sites/firplaksa.sharepoint.com:/sites/FPKContabilidad').get();
    const listsResponse = await client.api(`/sites/${siteResponse.id}/lists`).get();
    const list = listsResponse.value.find(l => l.name === 'Registro_de_Facturas' || l.displayName === 'Registro_de_Facturas');
    
    const items = await client.api(`/sites/${siteResponse.id}/lists/${list.id}/items?$filter=fields/Attachments eq true&$expand=fields`).header('Prefer', 'HonorNonIndexedQueriesWarningMayFailRandomly').top(1).get();
    
    if (items.value.length === 0) {
        console.log("No items with attachments found to test.");
        process.exit(0);
    }

    const itemId = items.value[0].id;
    console.log(`Testing with Item ID: ${itemId}`);

    // Get attachment files list using REST API
    const attachUrl = `${SP_BASE}/_api/web/lists/getbytitle('${listName}')/items(${itemId})/AttachmentFiles`;
    console.log(`Fetching: ${attachUrl}`);
    const attachRes = await fetch(attachUrl, { headers });
    
    if (!attachRes.ok) {
        const errorText = await attachRes.text();
        console.error(`REST API failed to list attachments (${attachRes.status}): ${errorText}`);
        process.exit(1);
    }

    const attachData = await attachRes.json();
    const attachments = attachData.value || [];
    
    if (attachments.length === 0) {
        console.log("Item has no attachments in REST query either.");
        process.exit(0);
    }
    
    const targetAttach = attachments[0];
    console.log(`Found attachment: ${targetAttach.FileName}`);
    console.log(`ServerRelativeUrl: ${targetAttach.ServerRelativeUrl}`);

    // Now try to download it
    const downloadUrl = `https://firplaksa.sharepoint.com${targetAttach.ServerRelativeUrl}`;
    console.log(`Downloading from: ${downloadUrl}`);
    const fileResponse = await fetch(downloadUrl, { headers });

    if (!fileResponse.ok) {
        console.error(`Failed to download file: ${fileResponse.status} ${fileResponse.statusText}`);
        const err = await fileResponse.text();
        console.log(err);
    } else {
        const buffer = await fileResponse.arrayBuffer();
        console.log(`SUCCESS! Downloaded file. Size: ${buffer.byteLength} bytes.`);
        writeFileSync(join(__dirname, `test_download_${targetAttach.FileName}`), Buffer.from(buffer));
        console.log(`Saved file to tmp directory to verify it works.`);
    }

} catch (e) {
    console.error('Error:', e.message);
}
