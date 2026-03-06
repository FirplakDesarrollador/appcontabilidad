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

async function inspectFields() {
    const siteResponse = await client.api('/sites/firplaksa.sharepoint.com:/sites/FPKContabilidad').get();
    const siteId = siteResponse.id;

    const listsResponse = await client.api(`/sites/${siteId}/lists`).get();
    const list = listsResponse.value.find(l => l.name === 'Registro_de_Facturas' || l.displayName === 'Registro_de_Facturas');
    const listId = list.id;

    console.log('Listing ALL keys for first 3 items...');
    const itemsRes = await client.api(`/sites/${siteId}/lists/${listId}/items?expand=fields&top=3`).get();

    const allKeys = new Set();
    itemsRes.value.forEach(item => {
        Object.keys(item.fields).forEach(key => allKeys.add(key));
    });

    console.log('AVAILABLE KEYS:');
    console.log(Array.from(allKeys).sort().join('\n'));

    console.log('\nSAMPLE DATA (First Item):');
    const firstItem = itemsRes.value[0].fields;
    ['Valor_x0020_total', 'Valor_total', 'Nit', 'Nit ', 'Nro_Factura', 'Proveedor'].forEach(key => {
        console.log(`${key}: ${firstItem[key]}`);
    });
}

inspectFields().catch(console.error);
