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

async function deepDiscover() {
    const site = await client.api('/sites/firplaksa.sharepoint.com:/sites/FPKContabilidad').get();
    const siteId = site.id;

    console.log(`Site ID: ${siteId}`);

    const drives = await client.api(`/sites/${siteId}/drives`).get();

    for (const drive of drives.value) {
        console.log(`\n=== Drive: ${drive.name} (${drive.id}) ===`);
        try {
            const root = await client.api(`/drives/${drive.id}/root/children`).get();
            for (const item of root.value) {
                console.log(` - ${item.name} (${item.folder ? 'Folder' : 'File'})`);
                if (item.folder) {
                    try {
                        const sub = await client.api(`/drives/${drive.id}/items/${item.id}/children`).get();
                        sub.value.forEach(s => console.log(`   -- ${s.name} (${s.folder ? 'Folder' : 'File'})`));
                    } catch (e) { }
                }
            }
        } catch (e) {
            console.log(` Error listing drive: ${e.message}`);
        }
    }
}

deepDiscover().catch(console.error);
