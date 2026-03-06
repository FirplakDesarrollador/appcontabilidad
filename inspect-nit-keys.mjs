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

async function inspectItems() {
    const siteResponse = await client.api('/sites/firplaksa.sharepoint.com:/sites/FPKContabilidad').get();
    const siteId = siteResponse.id;

    const listsResponse = await client.api(`/sites/${siteId}/lists`).get();
    const list = listsResponse.value.find(l => l.name === 'Registro_de_Facturas' || l.displayName === 'Registro_de_Facturas');
    const listId = list.id;

    console.log(`Inspecting first 5 items from list ${listId}`);
    const itemsRes = await client.api(`/sites/${siteId}/lists/${listId}/items?expand=fields&top=5`).get();

    itemsRes.value.forEach((item, idx) => {
        console.log(`\n--- ITEM ${idx + 1} (Graph ID: ${item.id}) ---`);
        const f = item.fields;
        console.log('Title (often Nit):', f.Title);
        console.log('Proveedor:', f.Proveedor);
        console.log('Nro_Factura:', f.Nro_Factura);
        console.log('Nit (internal?):', f.Nit_x0020_);
        console.log('Nit (other?):', f.Nit);
        console.log('Keys:', Object.keys(f).filter(k => k.toLowerCase().includes('nit')).join(', '));
    });
}

inspectItems().catch(console.error);
