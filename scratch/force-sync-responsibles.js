const { ConfidentialClientApplication } = require('@azure/msal-node');
const { Client } = require('@microsoft/microsoft-graph-client');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Manually load env variables
try {
    const envFile = fs.readFileSync(path.join(__dirname, '../.env'), 'utf-8');
    envFile.split('\n').forEach(line => {
        const [key, ...vals] = line.split('=');
        if (key && vals.length) process.env[key.trim()] = vals.join('=').trim();
    });
} catch (e) {
    console.error('Error loading .env:', e.message);
}

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

async function run() {
    // 1. Get SharePoint Client
    const response = await cca.acquireTokenByClientCredential({
        scopes: ['https://graph.microsoft.com/.default'],
    });
    const client = Client.init({
        authProvider: (done) => done(null, response.accessToken),
    });

    const HOST = 'firplaksa.sharepoint.com';
    const SITE_PATH = 'FPKContabilidad';
    const LIST_NAME = 'Registro_de_Facturas';

    const site = await client.api(`/sites/${HOST}:/sites/${SITE_PATH}`).get();
    const siteId = site.id;
    
    const lists = await client.api(`/sites/${siteId}/lists`).get();
    const list = lists.value.find(l => l.name === LIST_NAME || l.displayName === LIST_NAME);
    const listId = list.id;

    // 2. Fetch User Information List
    console.log("Loading User Information List from SharePoint...");
    const userMap = new Map();
    let userNextLink = `/sites/${siteId}/lists('User Information List')/items?$select=id,fields&$expand=fields($select=Title)&$top=500`;
    while (userNextLink) {
        const userResponse = await client.api(userNextLink).get();
        for (const u of userResponse.value) {
            if (u.fields?.Title) userMap.set(String(u.id), u.fields.Title);
        }
        userNextLink = userResponse['@odata.nextLink'] ? userResponse['@odata.nextLink'].split('v1.0')[1] : null;
    }
    console.log(`Loaded ${userMap.size} users.`);

    // 3. Fetch null responsibles from Supabase (focused on 'Por Aprobar' first, then others)
    console.log("Fetching null-responsible invoices from Supabase...");
    const { data: invoices, error } = await supabase
        .from('Registro_Facturas')
        .select('ID, sharepoint_id, Nro_Factura')
        .is('Responsable_de_Autorizar', null)
        .order('ID', { ascending: false });

    if (error) throw error;
    console.log(`Found ${invoices.length} invoices with null responsible.`);

    let updatedCount = 0;
    
    // Process them in chunks/sequence
    for (const inv of invoices) {
        const spId = inv.sharepoint_id || String(inv.ID);
        if (!spId) continue;
        
        console.log(`Resolving for ${inv.Nro_Factura} (ID: ${inv.ID}, SP ID: ${spId})...`);
        try {
            const spItem = await client.api(`/sites/${siteId}/lists/${listId}/items/${spId}?expand=fields`).get();
            const fields = spItem.fields || {};
            const lookupId = fields.ResponsabledeAutorizarLookupId
                || fields.ResponsableAprobarLookupId
                || fields.Responsable_de_AutorizarLookupId;
                
            if (lookupId) {
                const name = userMap.get(String(lookupId));
                if (name) {
                    console.log(`-> Resolved: ${name}`);
                    const { error: updateErr } = await supabase
                        .from('Registro_Facturas')
                        .update({ Responsable_de_Autorizar: name })
                        .eq('ID', inv.ID);
                        
                    if (updateErr) {
                        console.error(`Error updating Supabase for ID ${inv.ID}:`, updateErr.message);
                    } else {
                        updatedCount++;
                    }
                } else {
                    console.log(`-> Lookup ID ${lookupId} not found in userMap`);
                }
            } else {
                console.log(`-> No lookupId found for item`);
            }
        } catch (err) {
            console.error(`Error fetching SP item ${spId}:`, err.message);
        }
    }
    
    console.log(`Done! Successfully updated ${updatedCount} invoices.`);
}

run().catch(console.error);
