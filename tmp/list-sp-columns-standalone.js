
const msal = require("@azure/msal-node");
const { Client } = require("@microsoft/microsoft-graph-client");
const dotenv = require('dotenv');
dotenv.config();

const msalConfig = {
    auth: {
        clientId: process.env.AZURE_CLIENT_ID,
        authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
        clientSecret: process.env.AZURE_CLIENT_SECRET,
    }
};

const cca = new msal.ConfidentialClientApplication(msalConfig);

async function getAccessToken() {
    const tokenRequest = {
        scopes: ["https://graph.microsoft.com/.default"],
    };
    const response = await cca.acquireTokenByClientCredential(tokenRequest);
    return response.accessToken;
}

async function test() {
    try {
        const token = await getAccessToken();
        const client = Client.init({
            authProvider: (done) => {
                done(null, token);
            },
        });

        const siteResponse = await client.api('/sites/firplaksa.sharepoint.com:/sites/FPKContabilidad').get();
        const siteId = siteResponse.id;
        const listsResponse = await client.api(`/sites/${siteId}/lists`).get();
        const list = listsResponse.value.find(l => l.name === 'Registro_de_Facturas' || l.displayName === 'Registro_de_Facturas');
        const listId = list.id;

        const columnsResponse = await client.api(`/sites/${siteId}/lists/${listId}/columns`).get();
        console.log('Columns:');
        columnsResponse.value.forEach(col => {
            console.log(`${col.displayName} (Internal: ${col.name})`);
        });
    } catch (e) {
        console.error(e);
    }
}

test();
