import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

async function findNitKey() {
    const siteResponse = await client.api('/sites/firplaksa.sharepoint.com:/sites/FPKContabilidad').get();
    const siteId = siteResponse.id;

    const listsResponse = await client.api(`/sites/${siteId}/lists`).get();
    const list = listsResponse.value.find(l => l.name === 'Registro_de_Facturas' || l.displayName === 'Registro_de_Facturas');
    const listId = list.id;

    console.log('Searching for NIT "890916155-4" or "800185306-4" in first 100 items...');
    const itemsRes = await client.api(`/sites/${siteId}/lists/${listId}/items?expand=fields&top=100`).get();

    for (const item of itemsRes.value) {
        const fields = item.fields;
        for (const [key, val] of Object.entries(fields)) {
            const strVal = String(val);
            if (strVal.includes('890916155-4') || strVal.includes('800185306-4')) {
                console.log(`FOUND MATCH! Item ID: ${item.id}, Key: ${key}, Value: ${val}`);
            }
        }
    }
}

findNitKey().catch(console.error);
