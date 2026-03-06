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

const cca = new ConfidentialClientApplication({
    auth: {
        clientId: process.env.AZURE_CLIENT_ID,
        authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
        clientSecret: process.env.AZURE_CLIENT_SECRET,
    },
});

const auth = await cca.acquireTokenByClientCredential({
    scopes: ['https://graph.microsoft.com/.default'],
});

async function testBeta() {
    const siteId = 'firplaksa.sharepoint.com,41f4866c-5fec-4b36-9f08-f86c5e7566a6,2d6e04d4-34fd-49db-88fa-05b6301389e0';
    const listId = 'f2b08754-807d-4b36-9f08-f86c5e7566a6';
    const itemId = '47380';

    // Test beta endpoint for attachments
    const url = `https://graph.microsoft.com/beta/sites/${siteId}/lists/${listId}/items/${itemId}/attachments`;

    console.log(`Trying Beta URL: ${url}`);
    const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${auth.accessToken}` }
    });

    console.log(`Status: ${res.status} ${res.statusText}`);
    const data = await res.json();
    console.log(`Response: ${JSON.stringify(data, null, 2).substring(0, 1000)}`);
}

testBeta().catch(console.error);
