import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load env vars manually
const envFile = readFileSync(join(__dirname, '.env.local'), 'utf-8');
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

const response = await cca.acquireTokenByClientCredential({
    scopes: ['https://graph.microsoft.com/.default'],
});

const client = Client.init({
    authProvider: (done) => done(null, response.accessToken),
});

async function testFolder() {
    const siteResponse = await client.api('/sites/firplaksa.sharepoint.com:/sites/FPKContabilidad').get();
    const siteId = siteResponse.id;

    console.log(`Site ID: ${siteId}`);

    const spItemId = '43200'; // Using an ID from the user's example
    const path = `/Lists/Registro_de_Facturas/Attachments/${spItemId}`;

    console.log(`Trying to access path: ${path}`);

    try {
        // Try to access as a drive item from the site's default drive
        const driveItem = await client.api(`/sites/${siteId}/drive/root:${path}`).get();
        console.log(`Found folder: ${driveItem.id}`);

        const children = await client.api(`/sites/${siteId}/drive/items/${driveItem.id}/children`).get();
        console.log(`Found ${children.value.length} files in attachment folder.`);

        for (const file of children.value) {
            console.log(`File: ${file.name}, Download URL: ${file['@microsoft.graph.downloadUrl']}`);
        }
    } catch (e) {
        console.log(`Failed to access folder via Graph API: ${e.message}`);
    }
}

testFolder().catch(console.error);
