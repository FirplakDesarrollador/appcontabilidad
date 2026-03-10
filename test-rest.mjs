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

async function testRest() {
    // SharePoint REST endpoint for attachments content
    // /_api/web/lists/getbytitle('ListName')/items(ID)/AttachmentFiles('FileName')/$value
    const spItemId = '43200';
    const fileName = 'RAD  93110 ON TIME CARGO EXPRESS RP SAS OTRP501.pdf';
    const encodedFileName = encodeURIComponent(fileName);

    const url = `https://firplaksa.sharepoint.com/sites/FPKContabilidad/_api/web/lists/getbytitle('Registro_de_Facturas')/items(${spItemId})/AttachmentFiles('${encodedFileName}')/$value`;

    console.log(`Trying SharePoint REST with Graph Token: ${url}`);

    const res = await fetch(url, {
        headers: {
            'Authorization': `Bearer ${response.accessToken}`,
            'Accept': 'application/json;odata=verbose'
        }
    });

    console.log(`Status: ${res.status} ${res.statusText}`);
    if (res.ok) {
        const buffer = await res.arrayBuffer();
        console.log(`Success! Downloaded ${buffer.byteLength} bytes.`);
    } else {
        const text = await res.text();
        console.log(`Error: ${text.substring(0, 500)}`);
    }
}

testRest().catch(console.error);
