import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load env vars manually
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

const response = await cca.acquireTokenByClientCredential({
    scopes: ['https://graph.microsoft.com/.default'],
});

const client = Client.init({
    authProvider: (done) => done(null, response.accessToken),
});

try {
    const siteResponse = await client.api('/sites/firplaksa.sharepoint.com:/sites/FPKContabilidad').get();
    const siteId = siteResponse.id;

    const listsResponse = await client.api(`/sites/${siteId}/lists`).get();
    const list = listsResponse.value.find(l => l.name === 'Registro_de_Facturas' || l.displayName === 'Registro_de_Facturas');
    
    if (list) {
        // Find an item that has attachments
        const items = await client.api(`/sites/${siteId}/lists/${list.id}/items`).header('Prefer', 'HonorNonIndexedQueriesWarningMayFailRandomly').top(10).expand('fields').get();
        for (const item of items.value) {
            if (item.fields.Attachments) {
                console.log(`Found item with ID ${item.id} that has attachments.`);
                
                // Get attachments for this item
                try {
                    const attachments = await client.api(`/sites/${siteId}/lists/${list.id}/items/${item.id}/attachmentFiles`).get();
                    console.log('attachmentFiles works');
                } catch(e) {}

                try {
                   const attachments = await client.api(`/sites/${siteId}/lists/${list.id}/items/${item.id}/attachments`).get();
                   let output = `Attachments for Item ${item.id}:\n`;
                   output += JSON.stringify(attachments.value, null, 2);
                   
                   writeFileSync(join(__dirname, 'attachments-info.txt'), output, 'utf-8');
                   console.log('Wrote info to attachments-info.txt');
                   break;
                } catch(e) {
                   console.error('attachment endpoint error:', e.message);
                }
            }
        }
    } else {
        console.log('List not found');
    }
} catch (e) {
    console.error('Error:', e.message);
}
