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

async function findProviders() {
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

    const nits = ['819000939', '830070527'];
    
    for (const nit of nits) {
        console.log(`Searching for NIT ${nit} in SharePoint...`);
        // In SharePoint, the NIT might be in 'Title' or 'Nit' or 'Proveedor' (if searched by provider name)
        // Let's search by NIT in Title field first (assuming NIT is Title)
        const res = await client.api(`/sites/${siteId}/lists/${listId}/items?expand=fields&filter=fields/Title eq '${nit}'`)
            .header('Prefer', 'HonorNonIndexedQueriesWarningMayFailRandomly')
            .get();
        if (res.value && res.value.length > 0) {
            console.log(`Found for ${nit}:`, res.value[0].fields.Proveedor);
        } else {
            // Try searching by Nit_x0020_ field if it exists
            const res2 = await client.api(`/sites/${siteId}/lists/${listId}/items?expand=fields&filter=fields/Nit_x0020_ eq '${nit}'`)
                .header('Prefer', 'HonorNonIndexedQueriesWarningMayFailRandomly')
                .get();
             if (res2.value && res2.value.length > 0) {
                console.log(`Found for ${nit} (in Nit field):`, res2.value[0].fields.Proveedor);
            } else {
                console.log(`Not found for ${nit}`);
            }
        }
    }
}

findProviders().catch(console.error);
