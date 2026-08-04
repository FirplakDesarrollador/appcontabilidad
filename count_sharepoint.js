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
    
    let items = [];
    let nextLink = `/sites/${siteResponse.id}/lists/${list.id}/items?$expand=fields`;
    
    console.log("Fetching all items from SharePoint with their fields...");
    while (nextLink) {
        const res = await client.api(nextLink).get();
        items = items.concat(res.value);
        nextLink = res['@odata.nextLink'];
    }
    
    const matchingWithoutCheckbox = items.filter(item => {
        const f = item.fields;
        return f.Aprobacion_Doliente === 'Aprobado' && 
               f.Gestion_Contabilidad && f.Gestion_Contabilidad.toLowerCase().includes('por procesar');
    });
    
    console.log(`Total en SharePoint (sin mirar el chulo): ${matchingWithoutCheckbox.length}`);
    
    const matchingWithCheckbox = matchingWithoutCheckbox.filter(item => {
        const f = item.fields;
        return f.Procesado === false || f.Procesado == null;
    });
    
    console.log(`Total en SharePoint (mirando que el chulo sea falso/vacio): ${matchingWithCheckbox.length}`);
}
run().catch(console.error);
