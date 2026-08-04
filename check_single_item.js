const msal = require("@azure/msal-node");
const { Client } = require("@microsoft/microsoft-graph-client");

const msalConfig = {
    auth: {
        clientId: process.env.AZURE_CLIENT_ID,
        authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
        clientSecret: process.env.AZURE_CLIENT_SECRET,
    }
};

const cca = new msal.ConfidentialClientApplication(msalConfig);

async function run() {
    const tokenRequest = { scopes: ["https://graph.microsoft.com/.default"] };
    const response = await cca.acquireTokenByClientCredential(tokenRequest);
    const token = response.accessToken;
    const client = Client.init({ authProvider: (done) => { done(null, token); } });
    
    const siteResponse = await client.api('/sites/firplaksa.sharepoint.com:/sites/FPKContabilidad').get();
    const listsResponse = await client.api(`/sites/${siteResponse.id}/lists`).get();
    const list = listsResponse.value.find(l => l.name === 'Registro_de_Facturas');
    
    const item = await client.api(`/sites/${siteResponse.id}/lists/${list.id}/items/51560?$expand=fields`).get();
    console.log("Item 51560 Fields:");
    console.log("Aprobacion_Doliente:", item.fields.Aprobacion_Doliente);
    console.log("Gestion_Contabilidad:", item.fields.Gestion_Contabilidad);
    console.log("Procesado:", item.fields.Procesado);
}
run().catch(console.error);
