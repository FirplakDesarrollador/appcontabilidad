import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const envFile = readFileSync(join(dirname(__dirname), '.env.local'), 'utf-8');
envFile.split('\n').forEach(line => {
    const [key, ...vals] = line.split('=');
    if (key && vals.length) process.env[key.trim()] = vals.join('=').trim();
});

const { ConfidentialClientApplication } = await import('@azure/msal-node');
const { Client } = await import('@microsoft/microsoft-graph-client');

const cca = new ConfidentialClientApplication({
    auth: {
        clientId: process.env.AZURE_CLIENT_ID,
        authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
        clientSecret: process.env.AZURE_CLIENT_SECRET,
    },
});

async function run() {
    try {
        const response = await cca.acquireTokenByClientCredential({
            scopes: ['https://graph.microsoft.com/.default'],
        });
        const client = Client.init({
            authProvider: (done) => done(null, response.accessToken),
        });

        console.log("Searching for site ITPowerApps...");
        const site = await client.api('/sites/firplaksa.sharepoint.com:/sites/ITPowerApps').get();
        console.log("Site ID:", site.id);

        console.log("Testing drive access...");
        const drives = await client.api(`/sites/${site.id}/drives`).get();
        const mainDrive = drives.value.find(d => d.name === 'Documentos' || d.name === 'Shared Documents');
        
        if (mainDrive) {
            console.log("Found Drive:", mainDrive.name, mainDrive.id);
            const folderPath = 'Reenvio facture';
            const children = await client.api(`/drives/${mainDrive.id}/root:/${folderPath}:/children`).get();
            children.value.forEach(item => {
                console.log(`- ${item.name} (${item.folder ? 'Folder' : 'File'})`);
            });
        }

    } catch (e) {
        console.error('Error details:', e.message);
        if (e.body) console.log(e.body);
    }
}

run();
