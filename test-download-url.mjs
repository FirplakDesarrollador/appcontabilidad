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

const response = await cca.acquireTokenByClientCredential({
    scopes: ['https://graph.microsoft.com/.default'],
});

async function testDownload() {
    const url = 'https://firplaksa.sharepoint.com/sites/FPKContabilidad/Lists/Registro_de_Facturas/Attachments/43200/RAD%20%2093110%20ON%20TIME%20CARGO%20EXPRESS%20RP%20SAS%20OTRP501.pdf';

    console.log(`Trying to download: ${url}`);

    const res = await fetch(url, {
        headers: {
            'Authorization': `Bearer ${response.accessToken}`
        }
    });

    console.log(`Status: ${res.status} ${res.statusText}`);
    if (res.ok) {
        const buffer = await res.arrayBuffer();
        console.log(`Success! Downloaded ${buffer.byteLength} bytes.`);
    } else {
        const text = await res.text();
        console.log(`Error: ${text.substring(0, 200)}`);
    }
}

testDownload().catch(console.error);
