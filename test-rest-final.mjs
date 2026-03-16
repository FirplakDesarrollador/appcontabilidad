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

const cca = new ConfidentialClientApplication({
    auth: {
        clientId: process.env.AZURE_CLIENT_ID,
        authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
        clientSecret: process.env.AZURE_CLIENT_SECRET,
    },
});

async function testRest() {
    const response = await cca.acquireTokenByClientCredential({
        scopes: ['https://firplaksa.sharepoint.com/.default'],
    });
    const token = response.accessToken;

    const spItemId = '47701';
    const spBase = 'https://firplaksa.sharepoint.com/sites/FPKContabilidad';
    const listName = 'Registro_de_Facturas';
    
    console.log(`Testing REST for item ${spItemId}...`);
    
    // Try ByTitle
    const url = `${spBase}/_api/web/lists/getbytitle('${listName}')/items(${spItemId})/AttachmentFiles`;
    const res = await fetch(url, {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json;odata=nometadata'
        }
    });

    console.log(`Status: ${res.status}`);
    const data = await res.json();
    console.log('Data:', JSON.stringify(data, null, 2));
}

testRest().catch(console.error);
