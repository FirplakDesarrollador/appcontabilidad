const msal = require("@azure/msal-node");
const { Client } = require("@microsoft/microsoft-graph-client");
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

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
    
    console.log(`Fetched ${items.length} items from SharePoint.`);
    
    const batchSize = 200;
    for (let i = 0; i < items.length; i += batchSize) {
        const chunk = items.slice(i, i + batchSize);
        const mappedChunk = chunk.map(item => ({
            ID: Number(item.id),
            Aprobacion_Doliente: item.fields.Aprobacion_Doliente ?? null,
            Gestion_Contabilidad: item.fields.Gestion_Contabilidad ?? null,
            Procesado: item.fields.Procesado != null ? String(item.fields.Procesado) : null
        }));
        
        await supabase.from('Registro_Facturas').upsert(mappedChunk, { onConflict: 'ID' });
        console.log(`Upserted batch ${i / batchSize + 1}`);
    }
    console.log("Supabase successfully synced with SharePoint fields!");
}
run().catch(console.error);
