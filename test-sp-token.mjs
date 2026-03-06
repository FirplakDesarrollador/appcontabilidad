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

async function testSPToken() {
    console.log('Requesting SharePoint token...');
    try {
        const authResponse = await cca.acquireTokenByClientCredential({
            // Specifically try the SharePoint principal
            scopes: ['https://firplaksa.sharepoint.com/.default'],
        });

        const token = authResponse.accessToken;
        console.log('Token acquired successfully.');

        const spItemId = '43200';
        const url = `https://firplaksa.sharepoint.com/sites/FPKContabilidad/_api/web/lists/getbytitle('Registro_de_Facturas')/items(${spItemId})/AttachmentFiles`;

        console.log(`Fetching from: ${url}`);
        const res = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json;odata=nometadata'
            }
        });

        console.log(`Status: ${res.status} ${res.statusText}`);
        const text = await res.text();
        console.log(`Response: ${text.substring(0, 500)}`);
    } catch (e) {
        console.log(`Token request failed: ${e.message}`);
    }
}

testSPToken().catch(console.error);
