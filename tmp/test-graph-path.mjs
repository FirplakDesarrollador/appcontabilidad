import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

try {
    const caGraph = await cca.acquireTokenByClientCredential({
        scopes: ['https://graph.microsoft.com/.default'],
    });
    const client = Client.init({
        authProvider: (done) => done(null, caGraph.accessToken),
    });
    const siteResponse = await client.api('/sites/firplaksa.sharepoint.com:/sites/FPKContabilidad').get();
    const siteId = siteResponse.id;

    // Test access via relative path to the attachments folder
    const folderPath = '/Lists/Registro_de_Facturas/Attachments/47380';
    try {
        // Try getting drive items by path on the default site drive:
        // note: Lists are not always in the default document library.
        // If not, we might need to get the "Site Assets" or just try generic path addressing.
        const res = await client.api(`/sites/${siteId}/drive/root:${folderPath}:/children`).get();
        console.log("Success default drive children:", res);
    } catch(e) {
        console.log("Default drive error:", e.message);
    }
    
    // Test access to site items directly by path if possible
    try {
        const driveItem = await client.api(`/sites/${siteId}/drive/root:Lists/Registro_de_Facturas/Attachments/47380`).get();
        console.log("Found driveItem:", driveItem.id);
    } catch(e) {
        console.log("Drive path error:", e.message);
    }

} catch (e) {
    console.error('Error:', e.message);
}
