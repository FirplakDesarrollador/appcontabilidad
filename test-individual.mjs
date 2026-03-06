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

const cca = new ConfidentialClientApplication({
    auth: {
        clientId: process.env.AZURE_CLIENT_ID,
        authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
        clientSecret: process.env.AZURE_CLIENT_SECRET,
    },
});

const response = await cca.acquireTokenByClientCredential({
    scopes: ['https://graph.microsoft.com/.default'],
});

const client = Client.init({
    authProvider: (done) => done(null, response.accessToken),
});

async function testIndividual() {
    const siteResponse = await client.api('/sites/firplaksa.sharepoint.com:/sites/FPKContabilidad').get();
    const siteId = siteResponse.id;

    const listsResponse = await client.api(`/sites/${siteId}/lists`).get();
    const list = listsResponse.value.find(l => l.name === 'Registro_de_Facturas' || l.displayName === 'Registro_de_Facturas');
    const listId = list.id;

    const spItemId = '43200';
    // List attachments first to get an ID
    const attachmentsRes = await client.api(`/sites/${siteId}/lists/${listId}/items/${spItemId}/attachments`).get();
    const attId = attachmentsRes.value[0].id;

    console.log(`Testing individual attachment ID: ${attId}`);

    const att = await client.api(`/sites/${siteId}/lists/${listId}/items/${spItemId}/attachments/${attId}`).get();
    console.log('=== FULL ATTACHMENT METADATA ===');
    console.log(JSON.stringify(att, null, 2));

    if (att['@microsoft.graph.downloadUrl']) {
        console.log('DOWNLOAD URL FOUND!');
    }
}

testIndividual().catch(console.error);
