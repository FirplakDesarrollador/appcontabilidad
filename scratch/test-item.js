const { ConfidentialClientApplication } = require('@azure/msal-node');
const { Client } = require('@microsoft/microsoft-graph-client');
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

async function run() {
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

    console.log("Fetching item 50095 fields...");
    const item = await client.api(`/sites/${siteId}/lists/${listId}/items/50095?expand=fields`).get();
    console.log("Item Fields:", JSON.stringify(item.fields, null, 2));

    const fields = item.fields || {};
    const lookupId = fields.ResponsabledeAutorizarLookupId
        || fields.ResponsableAprobarLookupId
        || fields.Responsable_de_AutorizarLookupId;
    
    console.log("Resolved lookupId:", lookupId);

    if (lookupId) {
        console.log(`Fetching user info for ID ${lookupId}...`);
        try {
            const userRes = await client.api(`/sites/${siteId}/lists('User Information List')/items/${lookupId}?expand=fields`).get();
            console.log("User Info:", JSON.stringify(userRes.fields, null, 2));
        } catch (e) {
            console.log("Error fetching user:", e.message);
        }
    }
}

run().catch(console.error);
