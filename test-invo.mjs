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
const { Client } = await import('@microsoft/microsoft-graph-client');

const msalConfig = {
    auth: {
        clientId: process.env.AZURE_CLIENT_ID,
        authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
        clientSecret: process.env.AZURE_CLIENT_SECRET,
    }
};

const cca = new ConfidentialClientApplication(msalConfig);

async function getGraphClient() {
    const authResponse = await cca.acquireTokenByClientCredential({
        scopes: ['https://graph.microsoft.com/.default'],
    });

    if (!authResponse?.accessToken) {
        throw new Error('Could not acquire access token');
    }

    return Client.init({
        authProvider: (done) => {
            done(null, authResponse.accessToken);
        }
    });
}

async function testFetchInvoice(itemId) {
    try {
        const client = await getGraphClient();

        console.log(`Fetching invoice ${itemId}...`);

        // 1. Resolve Site ID
        const siteResponse = await client.api('/sites/firplaksa.sharepoint.com:/sites/FPKContabilidad').get();
        const siteId = siteResponse.id;

        // 2. Find the List
        const listsResponse = await client.api(`/sites/${siteId}/lists`).get();
        const list = listsResponse.value.find(l => l.name === 'Registro_de_Facturas' || l.displayName === 'Registro_de_Facturas');

        if (!list) throw new Error('SharePoint list "Registro_de_Facturas" not found');
        const listId = list.id;

        // 3. Fetch specific item
        const item = await client.api(`/sites/${siteId}/lists/${listId}/items/${itemId}`).expand('fields').get();

        if (item.fields.Documento_x0020_PDF) {
            console.log("Found PDF field:", item.fields.Documento_x0020_PDF);
        } else {
            console.log("PDF field not found!");
            console.log("Raw fields from SharePoint:");
            console.log(Object.keys(item.fields));
            console.log(item.fields);
        }

    } catch (error) {
        console.error("Error:", error.message || error);
    }
}

testFetchInvoice('47600');
