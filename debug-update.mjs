import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { ConfidentialClientApplication } from '@azure/msal-node';
import { Client } from '@microsoft/microsoft-graph-client';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env.local
const envFile = readFileSync(join(__dirname, '.env.local'), 'utf-8');
envFile.split('\n').forEach(line => {
    const [key, ...vals] = line.split('=');
    if (key && vals.length) process.env[key.trim()] = vals.join('=').trim();
});

const cca = new ConfidentialClientApplication({
    auth: {
        clientId: process.env.AZURE_CLIENT_ID,
        authority: 'https://login.microsoftonline.com/' + process.env.AZURE_TENANT_ID,
        clientSecret: process.env.AZURE_CLIENT_SECRET,
    },
});

const response = await cca.acquireTokenByClientCredential({
    scopes: ['https://graph.microsoft.com/.default'],
});

const client = Client.init({
    authProvider: (done) => done(null, response.accessToken),
});

async function testUpdate() {
    try {
        const siteResponse = await client.api('/sites/firplaksa.sharepoint.com:/sites/FPKContabilidad').get();
        const siteId = siteResponse.id;

        const listsResponse = await client.api(`/sites/${siteId}/lists`).get();
        const list = listsResponse.value.find(l => l.name === 'Registro_de_Facturas' || l.displayName === 'Registro_de_Facturas');
        const listId = list.id;

        // Get one item ID
        const itemsRes = await client.api(`/sites/${siteId}/lists/${listId}/items`).top(1).get();
        const itemId = itemsRes.value[0].id;
        console.log('Testing on Item ID:', itemId);

        const testEmail = 'analista2.desarrollo@firplak.com';

        console.log('--- Attempt 1: validateUpdateListItem ---');
        try {
            const res = await client.api(`/sites/${siteId}/lists/${listId}/items/${itemId}/validateUpdateListItem`).post({
                formValues: [{ fieldName: 'ResponsabledeAutorizar', fieldValue: testEmail }]
            });
            console.log('Result 1:', JSON.stringify(res, null, 2));
        } catch (e) {
            console.log('Error 1:', e.message);
            if (e.body) console.log('Body 1:', e.body);
        }

        console.log('--- Attempt 2: PATCH directly on item fields ---');
        try {
            const res = await client.api(`/sites/${siteId}/lists/${listId}/items/${itemId}`).patch({
                fields: {
                    ResponsabledeAutorizar: testEmail
                }
            });
            console.log('Result 2: Success (Patch)');
        } catch (e) {
            console.log('Error 2:', e.message);
        }

        console.log('--- Attempt 3: PATCH on /fields sub-resource ---');
        try {
            const res = await client.api(`/sites/${siteId}/lists/${listId}/items/${itemId}/fields`).patch({
                ResponsabledeAutorizar: testEmail
            });
            console.log('Result 3: Success (Fields Patch)');
        } catch (e) {
            console.log('Error 3:', e.message);
        }

    } catch (error) {
        console.error('Test failed:', error);
    }
}

testUpdate();
