import { readFileSync } from 'fs';
import { ConfidentialClientApplication } from '@azure/msal-node';
import { Client } from '@microsoft/microsoft-graph-client';
import { createClient } from '@supabase/supabase-js';

// Load env vars
const envFile = readFileSync('.env', 'utf-8');
envFile.split('\n').forEach(line => {
    const [key, ...vals] = line.split('=');
    if (key && vals.length) process.env[key.trim()] = vals.join('=').trim();
});
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const cca = new ConfidentialClientApplication({
    auth: {
        clientId: process.env.AZURE_CLIENT_ID,
        authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
        clientSecret: process.env.AZURE_CLIENT_SECRET,
    },
});

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const HOST = 'firplaksa.sharepoint.com';
const SITE_PATH = 'FPKContabilidad';
const LIST_NAME = 'Registro_de_Facturas';

async function mirror() {
    console.log('Fetching Graph Token...');
    const response = await cca.acquireTokenByClientCredential({ scopes: ['https://graph.microsoft.com/.default'] });
    const client = Client.init({ authProvider: (done) => done(null, response.accessToken) });

    console.log('Getting Site and List IDs...');
    const site = await client.api(`/sites/${HOST}:/sites/${SITE_PATH}`).get();
    const lists = await client.api(`/sites/${site.id}/lists`).get();
    const list = lists.value.find(l => l.name === LIST_NAME || l.displayName === LIST_NAME);
    
    console.log('Fetching ALL SP Items...');
    let spItems = [];
    let spNextLink = `/sites/${site.id}/lists/${list.id}/items?expand=fields&$top=500`;
    while (spNextLink) {
        const req = client.api(spNextLink).header('Prefer', 'HonorNonIndexedQueriesWarningMayFailRandomly');
        const res = await req.get();
        spItems = spItems.concat(res.value || []);
        spNextLink = res['@odata.nextLink'] ? res['@odata.nextLink'].split('v1.0')[1] : null;
        console.log(`Fetched ${spItems.length} items so far...`);
    }

    console.log(`Total SP Items: ${spItems.length}`);
    const spIds = new Set(spItems.map(item => String(item.id)));

    console.log('Fetching ALL Supabase Items...');
    let sbItems = [];
    let sbHasMore = true;
    let sbOffset = 0;
    while (sbHasMore) {
        const { data, error } = await supabase.from('Registro_Facturas').select('ID, sharepoint_id').range(sbOffset, sbOffset + 999);
        if (error) throw error;
        sbItems = sbItems.concat(data);
        if (data.length < 1000) sbHasMore = false;
        else sbOffset += 1000;
    }
    console.log(`Total Supabase Items: ${sbItems.length}`);

    const toDelete = sbItems.filter(sb => !spIds.has(String(sb.sharepoint_id))).map(sb => sb.ID);
    console.log(`Items to delete from Supabase (not in SP anymore): ${toDelete.length}`);

    if (toDelete.length > 0) {
        for (let i = 0; i < toDelete.length; i += 200) {
            const batch = toDelete.slice(i, i + 200);
            await supabase.from('Registro_Facturas').delete().in('ID', batch);
            console.log(`Deleted batch of ${batch.length} items...`);
        }
    }
    
    console.log('Deletion phase complete! The background sync-once.mjs will handle the updates for remaining records.');
}
mirror().catch(console.error);
