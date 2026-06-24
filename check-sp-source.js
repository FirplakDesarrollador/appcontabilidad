const msal = require('@azure/msal-node');
const { Client } = require('@microsoft/microsoft-graph-client');

const msalConfig = {
    auth: {
        clientId: '3de4d500-8a6e-44a4-ae78-36086e8e829f',
        authority: 'https://login.microsoftonline.com/fa1de04f-4780-4d83-a942-93c7ae8dee9d',
        clientSecret: process.env.CLIENT_SECRET || 'YOUR_CLIENT_SECRET_HERE',
    },
};

const cca = new msal.ConfidentialClientApplication(msalConfig);

async function checkSP() {
    const tokenResponse = await cca.acquireTokenByClientCredential({
        scopes: ['https://graph.microsoft.com/.default'],
    });
    const client = Client.init({
        authProvider: (done) => done(null, tokenResponse.accessToken),
    });

    const SHAREPOINT_HOST = 'firplaksa.sharepoint.com';
    const SHAREPOINT_SITE = 'FPKContabilidad';
    const LIST_NAME = 'Registro_de_Facturas';

    const siteResponse = await client.api(`/sites/${SHAREPOINT_HOST}:/sites/${SHAREPOINT_SITE}`).get();
    const siteId = siteResponse.id;

    const listsResponse = await client.api(`/sites/${siteId}/lists`).get();
    const list = listsResponse.value.find((l) => l.name === LIST_NAME || l.displayName === LIST_NAME);
    const listId = list.id;

    // Get item count
    const itemsResponse = await client.api(`/sites/${siteId}/lists/${listId}/items?$top=1`).get();
    console.log('SharePoint Total Items (estimate via @odata.count):', itemsResponse['@odata.count']);
    
    // Search for the specific invoice in SharePoint
    const searchResponse = await client.api(`/sites/${siteId}/lists/${listId}/items?expand=fields&filter=fields/Nro_Factura eq 'WF1264308'`).get();
    console.log('Search for WF1264308 in SP:', searchResponse.value);

    // Search for 81851891091
    const searchResponse2 = await client.api(`/sites/${siteId}/lists/${listId}/items?expand=fields&filter=fields/Nro_Factura eq '81851891091'`).get();
    console.log('Search for 81851891091 in SP:', searchResponse2.value);
}

checkSP().catch(console.error);
