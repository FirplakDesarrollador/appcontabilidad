import { readFileSync } from 'fs';
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

try {
    const response = await cca.acquireTokenByClientCredential({
        scopes: ['https://graph.microsoft.com/.default'],
    });
    const client = Client.init({
        authProvider: (done) => done(null, response.accessToken),
    });

    const siteRes = await client.api('/sites/firplaksa.sharepoint.com:/sites/FPKContabilidad').get();
    const siteId = siteRes.id;
    
    const listsRes = await client.api(`/sites/${siteId}/lists`).get();
    const list = listsRes.value.find(l => l.name === 'Registro_de_Facturas' || l.displayName === 'Registro_de_Facturas');
    const listId = list.id;
    
    console.log("Site ID:", siteId);
    console.log("List ID:", listId);
    
    // THE CRITICAL CALL
    console.log("Fetching attachments for 47696...");
    const attachments = await client.api(`/sites/${siteId}/lists/${listId}/items/47696/attachments`).get();
    console.log(JSON.stringify(attachments, null, 2));

} catch (e) {
    console.error('Error:', e.message);
}
