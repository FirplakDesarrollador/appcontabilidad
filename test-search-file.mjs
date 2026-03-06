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

async function testSearch() {
    const siteResponse = await client.api('/sites/firplaksa.sharepoint.com:/sites/FPKContabilidad').get();
    const siteId = siteResponse.id;

    // Item 43200 attachment filename from the user's screenshot
    const fileName = 'RAD  93110 ON TIME CARGO EXPRESS RP SAS OTRP501.pdf';

    console.log(`Searching for file: ${fileName}`);

    try {
        // Search in all drives of the site
        const searchRes = await client.api(`/sites/${siteId}/drive/root/search(q='${fileName}')`).get();

        if (searchRes.value && searchRes.value.length > 0) {
            console.log(`Found ${searchRes.value.length} matching files.`);
            const file = searchRes.value[0];
            console.log(`File Name: ${file.name}`);
            console.log(`Download URL: ${file['@microsoft.graph.downloadUrl']}`);
        } else {
            console.log('No file found via drive search.');
        }
    } catch (e) {
        console.log(`Search failed: ${e.message}`);
    }
}

testSearch().catch(console.error);
