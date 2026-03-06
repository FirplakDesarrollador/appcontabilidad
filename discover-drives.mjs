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

async function discover() {
    const site = await client.api('/sites/firplaksa.sharepoint.com:/sites/FPKContabilidad').get();
    console.log(`Site ID: ${site.id}`);

    // List all drives in the site
    const drives = await client.api(`/sites/${site.id}/drives`).get();
    console.log('\n=== DRIVES IN SITE ===');
    drives.value.forEach(d => console.log(`Drive: ${d.name} (id: ${d.id}, type: ${d.driveType})`));

    // For each drive, look for a folder named "Lists" or similar
    for (const drive of drives.value) {
        console.log(`\nInspecting Drive: ${drive.name}...`);
        try {
            const root = await client.api(`/drives/${drive.id}/root/children`).get();
            root.value.forEach(c => console.log(` - ${c.name} (${c.folder ? 'Folder' : 'File'})`));

            // Look for "Lists" folder
            const listsFolder = root.value.find(c => c.name === 'Lists');
            if (listsFolder) {
                console.log('   FOUND "Lists" folder! Inspecting...');
                const listChildren = await client.api(`/drives/${drive.id}/items/${listsFolder.id}/children`).get();
                listChildren.value.forEach(lc => console.log(`    -- ${lc.name}`));
            }
        } catch (e) {
            console.log(`   Error: ${e.message}`);
        }
    }
}

discover().catch(console.error);
