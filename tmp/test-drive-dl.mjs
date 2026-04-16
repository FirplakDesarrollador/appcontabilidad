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
    const caGraph = await cca.acquireTokenByClientCredential({
        scopes: ['https://graph.microsoft.com/.default'],
    });
    const client = Client.init({
        authProvider: (done) => done(null, caGraph.accessToken),
    });
    const siteResponse = await client.api('/sites/firplaksa.sharepoint.com:/sites/FPKContabilidad').get();
    const siteId = siteResponse.id;
    const listsResponse = await client.api(`/sites/${siteId}/lists`).get();
    const list = listsResponse.value.find(l => l.name === 'Registro_de_Facturas' || l.displayName === 'Registro_de_Facturas');
    
    const items = await client.api(`/sites/${siteId}/lists/${list.id}/items?$filter=fields/Attachments eq true&$expand=fields`).header('Prefer', 'HonorNonIndexedQueriesWarningMayFailRandomly').top(1).get();
    
    if (items.value.length === 0) {
        console.log("No items with attachments found to test.");
        process.exit(0);
    }

    const item = items.value[0];
    const itemId = item.id;
    console.log(`Testing with Item ID: ${itemId}`);

    // Let's check driveItem
    try {
        const driveItem = await client.api(`/sites/${siteId}/lists/${list.id}/items/${itemId}/driveItem`).get();
        console.log('driveItem exists:', driveItem['@microsoft.graph.downloadUrl']);
        if (driveItem['@microsoft.graph.downloadUrl']) {
           const fileResponse = await fetch(driveItem['@microsoft.graph.downloadUrl']);
           const b = await fileResponse.arrayBuffer();
           console.log(`Downloaded ${b.byteLength} bytes`);
        }
    } catch (e) {
        console.log('driveItem error:', e.message);
    }
} catch (e) {
    console.error('Error:', e.message);
}
