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

async function testExpand() {
    const site = await client.api('/sites/firplaksa.sharepoint.com:/sites/FPKContabilidad').get();
    const lists = await client.api(`/sites/${site.id}/lists`).get();
    const list = lists.value.find(l => l.name === 'Registro_de_Facturas' || l.displayName === 'Registro_de_Facturas');

    const spItemId = '43200';
    console.log(`Testing expansion for item ${spItemId}...`);

    try {
        const item = await client.api(`/sites/${site.id}/lists/${list.id}/items/${spItemId}`)
            .expand('attachments')
            .get();
        console.log('Expansion result keys:', Object.keys(item));
        if (item.attachments) {
            console.log(`Found ${item.attachments.length} attachments in expanded field.`);
            console.log(JSON.stringify(item.attachments[0], null, 2));
        } else {
            console.log('No attachments field in expanded result.');
        }
    } catch (e) {
        console.log(`Expansion failed: ${e.message}`);
    }
}

testExpand().catch(console.error);
