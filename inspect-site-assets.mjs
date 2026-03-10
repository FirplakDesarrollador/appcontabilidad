import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load env vars
try {
    const envFile = readFileSync(join(__dirname, '.env.local'), 'utf-8');
    envFile.split('\n').forEach(line => {
        const [key, ...vals] = line.split('=');
        if (key && vals.length) process.env[key.trim()] = vals.join('=').trim();
    });
} catch (e) { }

const { ConfidentialClientApplication } = await import('@azure/msal-node');
const { Client } = await import('@microsoft/microsoft-graph-client');

const cca = new ConfidentialClientApplication({
    auth: {
        clientId: process.env.AZURE_CLIENT_ID,
        authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
        clientSecret: process.env.AZURE_CLIENT_SECRET,
    },
});

const response = await cca.acquireTokenByClientCredential({
    scopes: ['https://graph.microsoft.com/.default'],
});

const client = Client.init({
    authProvider: (done) => done(null, response.accessToken),
});

async function findSiteAssets() {
    const site = await client.api('/sites/firplaksa.sharepoint.com:/sites/FPKContabilidad').get();
    const siteId = site.id;

    const drives = await client.api(`/sites/${siteId}/drives`).get();
    const siteAssets = drives.value.find(d => d.name === 'Site Assets');

    if (!siteAssets) {
        console.log('Site Assets drive not found.');
        return;
    }

    console.log(`Site Assets ID: ${siteAssets.id}`);

    // List all folders in Site Assets
    const root = await client.api(`/drives/${siteAssets.id}/root/children`).get();
    root.value.forEach(c => console.log(` - ${c.name} (${c.folder ? 'Folder' : 'File'})`));

    const listsFolder = root.value.find(c => c.name === 'Lists');
    if (listsFolder) {
        console.log('\nFound "Lists" in Site Assets. Inspecting...');
        const listChildren = await client.api(`/drives/${siteAssets.id}/items/${listsFolder.id}/children`).get();
        listChildren.value.forEach(lc => console.log(`  -- ${lc.name}`));
    }
}

findSiteAssets().catch(console.error);
