import { readFileSync, writeFileSync } from 'fs';
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

    const query = 'parentReference/path:\'/sites/FPKContabilidad/Lists/Registro_de_Facturas/Attachments/47696\'';
    const res = await client.api('/search/query').post({
        requests: [
            {
                entityTypes: ['driveItem'],
                query: {
                    queryString: '47696'
                }
            }
        ]
    });
    
    writeFileSync('tmp/search_res.json', JSON.stringify(res, null, 2));
    console.log("Search finished. Check tmp/search_res.json");

} catch (e) {
    console.error('Error:', e.message);
}
