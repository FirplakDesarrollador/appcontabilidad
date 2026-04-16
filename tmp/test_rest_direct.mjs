import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const envFile = readFileSync(join(dirname(__dirname), '.env.local'), 'utf-8');
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

try {
    const response = await cca.acquireTokenByClientCredential({
        scopes: ['https://firplaksa.sharepoint.com/.default'],
    });
    
    const token = response.accessToken;
    const listId = '3284aa5a-ba02-45e8-9642-fe8c20ecffc0';
    const itemId = 47696;
    const url = `https://firplaksa.sharepoint.com/sites/FPKContabilidad/_api/web/lists(guid'${listId}')/items(${itemId})/AttachmentFiles`;
    
    console.log("Fetching REST URL:", url);
    const res = await fetch(url, {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json;odata=nometadata'
        }
    });
    
    console.log("Status:", res.status);
    const data = await res.json();
    console.log("Data:", JSON.stringify(data, null, 2));

} catch (e) {
    console.error('Error:', e.message);
}
