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

const response = await cca.acquireTokenByClientCredential({
    scopes: ['https://graph.microsoft.com/.default'],
});

async function testPath() {
    const siteId = 'firplaksa.sharepoint.com,41f4866c-5fec-4b36-9f08-f86c5e7566a6,2d6e04d4-34fd-49db-88fa-05b6301389e0'; // Use actual ID from prev logs

    // Pattern: /Lists/ListName/Attachments/ID/FileName
    const relativePath = '/Lists/Registro_de_Facturas/Attachments/43200/RAD  93110 ON TIME CARGO EXPRESS RP SAS OTRP501.pdf';
    const escapedPath = relativePath.split('/').map(segment => encodeURIComponent(segment)).join('/');

    const url = `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:${escapedPath}`;

    console.log(`Trying URL: ${url}`);

    const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${response.accessToken}` }
    });

    console.log(`Status: ${res.status} ${res.statusText}`);
    if (res.ok) {
        const data = await res.json();
        console.log(`Found DriveItem! Download URL: ${data['@microsoft.graph.downloadUrl']}`);
    } else {
        const err = await res.text();
        console.log(`Error: ${err}`);
    }
}

testPath().catch(console.error);
