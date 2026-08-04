const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const { Client } = require('@microsoft/microsoft-graph-client');
const { ClientSecretCredential } = require('@azure/identity');
require('isomorphic-fetch');

async function run() {
    const credential = new ClientSecretCredential(
        process.env.SHAREPOINT_TENANT_ID,
        process.env.SHAREPOINT_CLIENT_ID,
        process.env.SHAREPOINT_CLIENT_SECRET
    );
    const client = Client.initWithMiddleware({
        authProvider: {
            getAccessToken: async () => {
                const token = await credential.getToken("https://graph.microsoft.com/.default");
                return token.token;
            }
        }
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
    
    const { data: supaIdsData } = await supabase.from('Registro_Facturas').select('ID');
    const supaIds = supaIdsData.map(r => r.ID);
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
