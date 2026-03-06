// Script to inspect SharePoint item fields
require('dotenv').config({ path: '.env.local' });
const msal = require('@azure/msal-node');
const { Client } = require('@microsoft/microsoft-graph-client');

const cca = new msal.ConfidentialClientApplication({
    auth: {
        clientId: process.env.AZURE_CLIENT_ID,
        authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
        clientSecret: process.env.AZURE_CLIENT_SECRET,
    },
});

async function main() {
    const response = await cca.acquireTokenByClientCredential({
        scopes: ['https://graph.microsoft.com/.default'],
    });

    const client = Client.init({
        authProvider: (done) => done(null, response.accessToken),
    });

    const siteResponse = await client.api('/sites/firplaksa.sharepoint.com:/sites/FPKContabilidad').get();
    const siteId = siteResponse.id;

    const listsResponse = await client.api(`/sites/${siteId}/lists`).get();
    const list = listsResponse.value.find(l => l.name === 'Registro_de_Facturas' || l.displayName === 'Registro_de_Facturas');
    const listId = list.id;

    // Get item 47380 with all fields
    const item = await client.api(`/sites/${siteId}/lists/${listId}/items/47380`)
        .expand('fields')
        .get();

    console.log('=== ALL FIELD NAMES ===');
    console.log(Object.keys(item.fields).join('\n'));

    console.log('\n=== ATTACHMENT-RELATED FIELDS ===');
    const allKeys = Object.keys(item.fields);
    const attachKeys = allKeys.filter(k =>
        k.toLowerCase().includes('attach') ||
        k.toLowerCase().includes('doc') ||
        k.toLowerCase().includes('adjunto') ||
        k.toLowerCase().includes('file') ||
        k.toLowerCase().includes('archivo')
    );
    attachKeys.forEach(k => console.log(`${k}: ${JSON.stringify(item.fields[k])}`));

    console.log('\n=== FULL ITEM FIELDS (first 20) ===');
    allKeys.slice(0, 20).forEach(k => console.log(`${k}: ${JSON.stringify(item.fields[k])}`));
}

main().catch(console.error);
