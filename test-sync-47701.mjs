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

async function runSync() {
    console.log('Fetching token...');
    const tokenResponse = await cca.acquireTokenByClientCredential({
        scopes: ['https://firplaksa.sharepoint.com/.default'],
    });
    const token = tokenResponse.accessToken;
    
    const headers = {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json;odata=nometadata',
    };

    const spItemId = '47701';
    const spBase = 'https://firplaksa.sharepoint.com/sites/FPKContabilidad';
    const listName = 'Registro_de_Facturas';
    
    console.log(`Checking attachments for item ${spItemId}...`);
    const attachUrl = `${spBase}/_api/web/lists/getbytitle('${listName}')/items(${spItemId})/AttachmentFiles`;
    const attachRes = await fetch(attachUrl, { headers });
    
    console.log(`Status: ${attachRes.status}`);
    const data = await attachRes.json();
    console.log('REST Data:', JSON.stringify(data, null, 2));

    if (data.value && data.value.length > 0) {
        console.log('Found attachments:', data.value.length);
        const attachment = data.value[0];
        const downloadUrl = `https://firplaksa.sharepoint.com${attachment.ServerRelativeUrl}`;
        console.log(`Testing download from: ${downloadUrl}`);
        const dlRes = await fetch(downloadUrl, { headers });
        console.log(`Download Status: ${dlRes.status}`);
    } else {
        console.log('No attachments found in REST response.');
    }
}

runSync().catch(error => {
    console.error('Error:', error);
});
