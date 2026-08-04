const { createClient } = require('@supabase/supabase-js');
const msal = require("@azure/msal-node");
const { Client } = require("@microsoft/microsoft-graph-client");

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const msalConfig = {
    auth: {
        clientId: process.env.AZURE_CLIENT_ID,
        authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
        clientSecret: process.env.AZURE_CLIENT_SECRET,
    }
};

const cca = new msal.ConfidentialClientApplication(msalConfig);

async function getAccessToken() {
    const tokenRequest = { scopes: ["https://graph.microsoft.com/.default"] };
    const response = await cca.acquireTokenByClientCredential(tokenRequest);
    return response.accessToken;
}

async function run() {
    const token = await getAccessToken();
    const client = Client.init({
        authProvider: (done) => { done(null, token); }
    });
    
    console.log("Fetching SharePoint...");
    const siteResponse = await client.api('/sites/firplaksa.sharepoint.com:/sites/FPKContabilidad').get();
    const listsResponse = await client.api(`/sites/${siteResponse.id}/lists`).get();
    const list = listsResponse.value.find(l => l.name === 'Registro_de_Facturas' || l.displayName === 'Registro_de_Facturas');
    
    let items = [];
    let nextLink = `/sites/${siteResponse.id}/lists/${list.id}/items?$select=id`;
    while (nextLink) {
        const response = await client.api(nextLink).get();
        items = items.concat(response.value);
        nextLink = response['@odata.nextLink'];
    }
    
    const spIds = new Set(items.map(item => parseInt(item.id, 10)));
    console.log(`SharePoint has ${spIds.size} total items.`);
    
    console.log("Fetching Supabase...");
    let supaIds = [];
    let offset = 0;
    const limit = 1000;
    while (true) {
        const { data } = await supabase.from('Registro_Facturas').select('ID').range(offset, offset + limit - 1);
        if (!data || data.length === 0) break;
        supaIds = supaIds.concat(data.map(r => r.ID));
        offset += limit;
    }
    
    console.log(`Supabase has ${supaIds.length} total items.`);
    
    const toDelete = supaIds.filter(id => !spIds.has(id));
    console.log(`Found ${toDelete.length} orphaned items in Supabase.`);
    
    if (toDelete.length > 0) {
        const deleteBatchSize = 200;
        let deletedCount = 0;
        for (let i = 0; i < toDelete.length; i += deleteBatchSize) {
            const chunk = toDelete.slice(i, i + deleteBatchSize);
            await supabase.from('Registro_Facturas').delete().in('ID', chunk);
            deletedCount += chunk.length;
        }
        console.log(`Successfully deleted ${deletedCount} orphaned items from Supabase.`);
    }
}
run().catch(console.error);
