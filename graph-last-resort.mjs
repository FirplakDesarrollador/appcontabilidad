import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const envFile = readFileSync(join(__dirname, '.env.local'), 'utf-8');
envFile.split('\n').forEach(line => {
    const [key, ...vals] = line.split('=');
    if (key && vals.length) process.env[key.trim()] = vals.join('=').trim();
});

const { ConfidentialClientApplication } = await import('@azure/msal-node');
const { Client } = await import('@microsoft/microsoft-graph-client');

async function test() {
    const cca = new ConfidentialClientApplication({
        auth: {
            clientId: process.env.AZURE_CLIENT_ID,
            authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
            clientSecret: process.env.AZURE_CLIENT_SECRET,
        },
    });

    const resp = await cca.acquireTokenByClientCredential({
        scopes: ['https://graph.microsoft.com/.default'],
    });

    const client = Client.init({
        authProvider: (done) => done(null, resp.accessToken),
    });

    const siteId = 'firplaksa.sharepoint.com,61567c23-79a5-4438-a377-2f240de3c001,cbab86be-5337-4c4a-bfa5-29b6803775c3';
    const listId = 'f2b08754-807d-4b36-9f08-f86c5e7566a6';
    const itemId = '47701';

    try {
        const atts = await client.api(`/sites/${siteId}/lists/${listId}/items/${itemId}/attachments`).get();
        console.log('SUCCESS:', atts.value.length, 'attachments');
        writeFileSync('final-graph-test.json', JSON.stringify(atts, null, 2));
    } catch (e) {
        console.log('FAILED:', e.message);
        if (e.body) console.log('BODY:', e.body);
    }
}

test();
