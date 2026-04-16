import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load env vars
const envFile = readFileSync(join(__dirname, '.env.local'), 'utf-8');
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

async function run() {
    const response = await cca.acquireTokenByClientCredential({
        scopes: ['https://graph.microsoft.com/.default'],
    });
    const client = Client.init({
        authProvider: (done) => done(null, response.accessToken),
    });

    const siteId = 'firplaksa.sharepoint.com:/sites/FPKContabilidad';
    const site = await client.api(`/sites/${siteId}`).get();
    console.log('Site ID:', site.id);

    const listName = 'Registro_de_Facturas';
    const lists = await client.api(`/sites/${site.id}/lists`).get();
    const list = lists.value.find(l => l.name === listName || l.displayName === listName);
    console.log('List ID:', list.id);

    // Get item 47701
    const itemId = '47701';
    console.log(`\n--- Fetching Item ${itemId} ---`);
    const item = await client.api(`/sites/${site.id}/lists/${list.id}/items/${itemId}`).expand('fields').get();
    console.log('Item ID (Graph):', item.id);
    console.log('Attachments Field:', item.fields.Attachments);

    // Try to list attachments
    console.log('\n--- Listing Attachments via Graph ---');
    try {
        const atts = await client.api(`/sites/${site.id}/lists/${list.id}/items/${itemId}/attachments`).get();
        console.log('Attachments found:', atts.value.length);
        console.log(JSON.stringify(atts.value, null, 2));
    } catch (e) {
        console.error('Graph Attachments Error:', e.message);
    }
}

run().catch(console.error);
