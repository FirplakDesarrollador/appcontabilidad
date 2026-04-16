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

    const siteId = 'firplaksa.sharepoint.com,fa299047-d355-47e2-a0d7-2f77c36a43b2,0ebf6fb5-51ee-4899-ad00-fa2bd081ad7d';
    // Let's get the drives for the site
    const drives = await client.api(`/sites/${siteId}/drives`).get();
    let driveId = null;
    
    // We want the default document library to browse the whole site? Or is there a "Site Assets" or what?
    // Wait, Lists is in the root of the site path? Let's check root of the site.
    // Graph doesn't allow accessing lists via /drives/{id} if it's not a document library.
    
    // Let's try children of the site
    const items = await client.api(`/sites/${siteId}/drive/root:/Lists/Registro_de_Facturas/Attachments/47696:/children`).get().catch(e => e.message);
    console.log("Via drive/root:", items);
    
    // How about search?
    const searchRes = await client.api('/search/query').post({
        requests: [
            {
                entityTypes: ['driveItem', 'listItem'],
                query: {
                    queryString: 'path:"/sites/FPKContabilidad/Lists/Registro_de_Facturas/Attachments/47696"'
                }
            }
        ]
    }).catch(e => e.message);
    console.log("Via search:", JSON.stringify(searchRes, null, 2));

} catch (e) {
    console.error('Error:', e.message);
}
