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
        const columns = await client.api(`/sites/${siteId}/lists/${list.id}/columns`).get();
        // filter out some hidden/built-in ones for clarity, or just print names
        const internalNames = columns.value.map(c => c.name);
        const displayNames = columns.value.map(c => c.displayName);
        
        let output = 'List of Columns (Display Names):\n';
        displayNames.forEach((name, i) => {
            output += `- ${name} (Internal Name: ${internalNames[i]})\n`;
        });

        // get actual item data keys
        const items = await client.api(`/sites/${siteId}/lists/${list.id}/items`).header('Prefer', 'HonorNonIndexedQueriesWarningMayFailRandomly').top(1).expand('fields').get();
        if (items.value.length > 0) {
            output += '\n--- Real Field Keys in an Item ---\n';
            output += Object.keys(items.value[0].fields).join('\n') + '\n';
        }

        writeFileSync(join(__dirname, 'columns-utf8.txt'), output, 'utf-8');
        console.log('Wrote to columns-utf8.txt');
    } else {
        console.log('List not found');
    }
} catch (e) {
    console.error('Error:', e.message);
}
