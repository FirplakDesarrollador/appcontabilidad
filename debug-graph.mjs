import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

try {
    const envFile = readFileSync(join(__dirname, '.env'), 'utf-8');
    envFile.split('\n').forEach(line => {
        const [key, ...vals] = line.split('=');
        if (key && vals.length) process.env[key.trim()] = vals.join('=').trim();
    });
} catch (e) {
    console.error('No .env file found');
    process.exit(1);
}

const { ConfidentialClientApplication } = await import('@azure/msal-node');
const { Client } = await import('@microsoft/microsoft-graph-client');

const msalConfig = {
    auth: {
        clientId: process.env.AZURE_CLIENT_ID,
        authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
        clientSecret: process.env.AZURE_CLIENT_SECRET,
    },
};

const cca = new ConfidentialClientApplication(msalConfig);

async function test() {
    try {
        console.log('Acquiring token...');
        const authResponse = await cca.acquireTokenByClientCredential({
            scopes: ['https://graph.microsoft.com/.default'],
        });
        
        console.log('Token acquired. Initializing Graph Client...');
        const client = Client.init({
            authProvider: (done) => done(null, authResponse.accessToken),
        });

        // Test the site itself rather than lists first to see if site is valid
        const HOST = 'firplaksa.sharepoint.com';
        const SITE_PATH = 'FPKContabilidad';
        console.log(`Fetching site info for /sites/${HOST}:/sites/${SITE_PATH}...`);
        
        const site = await client.api(`/sites/${HOST}:/sites/${SITE_PATH}`).get();
        writeFileSync('debug-graph-output.json', JSON.stringify({ success: true, site }, null, 2));

        console.log(`Site ID is: ${site.id}`);
        console.log('Fetching lists...');
        const lists = await client.api(`/sites/${site.id}/lists`).get();
        
        writeFileSync('debug-graph-output.json', JSON.stringify({ success: true, site, lists: lists.value.length }, null, 2));
    } catch (e) {
        console.error('ERROR OCCURRED, saving to file');
        const errObj = {
            statusCode: e.statusCode,
            code: e.code,
            message: e.message,
            body: e.body
        };
        writeFileSync('debug-graph-output.json', JSON.stringify(errObj, null, 2));
    }
}

test();
