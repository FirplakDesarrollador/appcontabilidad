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

    const fileUrl = 'https://firplaksa.sharepoint.com/sites/FPKContabilidad/Lists/Registro_de_Facturas/Attachments/47380/Factura_Venta_Electronica_2276.pdf';
    
    // Base64url encode the url
    const encodeBase64Url = (str) => {
        return Buffer.from(str, 'utf8')
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
    };
    
    const encodedUrl = `u!${encodeBase64Url(fileUrl)}`;
    console.log("Encoded URL parameter:", encodedUrl);

    try {
        const driveItem = await client.api(`/shares/${encodedUrl}/driveItem`).get();
        console.log("Found driveItem via shares:", driveItem.id);
        console.log("Download URL:", driveItem['@microsoft.graph.downloadUrl']);
    } catch(e) {
        console.log("Shares approach failed:", e.message);
    }
} catch (e) {
    console.error('Error:', e.message);
}
