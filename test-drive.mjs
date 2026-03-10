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

async function testDrive() {
    const siteResponse = await client.api('/sites/firplaksa.sharepoint.com:/sites/FPKContabilidad').get();
    const siteId = siteResponse.id;

    const listsResponse = await client.api(`/sites/${siteId}/lists`).get();
    const list = listsResponse.value.find(l => l.name === 'Registro_de_Facturas' || l.displayName === 'Registro_de_Facturas');
    const listId = list.id;

    console.log(`List: ${list.displayName} (id: ${listId})`);

    try {
        // Try to get the drive for the list
        const drive = await client.api(`/sites/${siteId}/lists/${listId}/drive`).get();
        console.log(`Drive ID: ${drive.id}`);
    } catch (e) {
        console.log('List does not have a direct drive associated.');
    }

    // Try to find the item in the site's default drive if it exists
    try {
        const item = await client.api(`/sites/${siteId}/lists/${listId}/items/47380`).expand('driveItem').get();
        if (item.driveItem) {
            console.log(`DriveItem ID: ${item.driveItem.id}`);
            console.log(`Download URL: ${item.driveItem['@microsoft.graph.downloadUrl']}`);
        } else {
            console.log('Item does not have an associated driveItem.');
        }
    } catch (e) {
        console.log('Error fetching item driveItem expansion.');
    }

    // List attachments again but check all properties
    const attachmentsRes = await client.api(`/sites/${siteId}/lists/${listId}/items/47380/attachments`).get();
    console.log('\n=== ATTACHMENT PROPERTIES ===');
    console.log(JSON.stringify(attachmentsRes.value, null, 2));
}

testDrive().catch(console.error);
