import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

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

try {
    const caGraph = await cca.acquireTokenByClientCredential({
        scopes: ['https://graph.microsoft.com/.default'],
    });
    const client = Client.init({
        authProvider: (done) => done(null, caGraph.accessToken),
    });

    const siteId = 'firplaksa.sharepoint.com,fa299047-d355-47e2-a0d7-2f77c36a43b2,0ebf6fb5-51ee-4899-ad00-fa2bd081ad7d';
    const listId = '3284aa5a-ba02-45e8-9642-fe8c20ecffc0'; // Registro_de_Facturas
    const itemId = 47696;

    console.log(`Testing with BETA Graph API...`);

    // Get attachments metadata using beta!
    const attachments = await client.api(`/sites/${siteId}/lists/${listId}/items/${itemId}/attachments`).version('beta').get();
    
    console.log(JSON.stringify(attachments, null, 2));
} catch (e) {
    console.error('Error:', e.message);
}
