import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load env vars manually
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
    const listsResponse = await client.api(`/sites/${siteId}/lists`).get();
    const list = listsResponse.value.find(l => l.name === 'Registro_de_Facturas' || l.displayName === 'Registro_de_Facturas');
    
    // Using test item id
    const itemId = 47380; // We know this one has attachments
    console.log(`Testing with Item ID: ${itemId}`);

    // Get attachments metadata
    const attachments = await client.api(`/sites/${siteId}/lists/${list.id}/items/${itemId}/attachments`).get();
    
    if (attachments.value.length === 0) {
        console.log("No attachments on this item");
    } else {
        const att = attachments.value[0];
        console.log(`Found attachment: ${att.name} (ID: ${att.id}) (Type: ${att.contentType})`);
        
        // Let's try to get its content using graph api
        try {
            const fileStream = await client.api(`/sites/${siteId}/lists/${list.id}/items/${itemId}/attachments/${att.id}/$value`).getStream();
            // Consume stream to buffer
            const chunks = [];
            for await (const chunk of fileStream) {
                chunks.push(chunk);
            }
            const buffer = Buffer.concat(chunks);

            console.log(`SUCCESS! Downloaded file via Graph API. Size: ${buffer.length} bytes.`);
            writeFileSync(join(__dirname, `test_graph_dl_${att.name}`), buffer);
            console.log(`Saved file to tmp directory to verify it works.`);
        } catch(e) {
            console.log("Error downloading attachment content via graph:", e.message);
            console.dir(e, {depth: null});
        }
    }
} catch (e) {
    console.error('Error:', e.message);
}
