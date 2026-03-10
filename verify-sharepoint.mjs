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

async function verifyUpdate() {
    try {
        const siteResponse = await client.api('/sites/firplaksa.sharepoint.com:/sites/FPKContabilidad').get();
        const siteId = siteResponse.id;

        const listsResponse = await client.api(`/sites/${siteId}/lists`).get();
        const list = listsResponse.value.find(l => l.name === 'Registro_de_Facturas' || l.displayName === 'Registro_de_Facturas');
        const listId = list.id;

        const itemId = '47518';
        console.log('--- TEST START ---');
        console.log('Item:', itemId);

        const initialRes = await client.api(`/sites/${siteId}/lists/${listId}/items/${itemId}`).expand('fields').get();
        const initialId = initialRes.fields.ResponsabledeAutorizarLookupId;
        console.log('1. Initial LookupId:', initialId);

        // Try to find a DIFFERENT user to update to
        const userRes = await client.api(`/sites/${siteId}/lists('User Information List')/items`).expand('fields($select=Title,EMail)').top(10).get();
        const otherUser = userRes.value.find(u => u.id !== initialId && u.fields.EMail);

        if (!otherUser) {
            console.log('Could not find another user to test update with.');
            return;
        }

        const targetEmail = otherUser.fields.EMail;
        const targetId = otherUser.id;
        console.log('2. Target User:', otherUser.fields.Title, '(', targetEmail, ') ID:', targetId);

        console.log('3. Attempting PATCH .../fields with email:', targetEmail);
        await client.api(`/sites/${siteId}/lists/${listId}/items/${itemId}/fields`).patch({
            ResponsabledeAutorizar: targetEmail
        });

        const after1 = await client.api(`/sites/${siteId}/lists/${listId}/items/${itemId}`).expand('fields').get();
        console.log('4. LookupId after email patch:', after1.fields.ResponsabledeAutorizarLookupId);

        if (String(after1.fields.ResponsabledeAutorizarLookupId) === String(targetId)) {
            console.log('>> SUCCESS with Email Patch!');
        } else {
            console.log('>> FAILED with Email Patch.');

            console.log('5. Attempting PATCH .../fields with LookupId directly:', targetId);
            await client.api(`/sites/${siteId}/lists/${listId}/items/${itemId}/fields`).patch({
                ResponsabledeAutorizarLookupId: targetId
            });

            const after2 = await client.api(`/sites/${siteId}/lists/${listId}/items/${itemId}`).expand('fields').get();
            console.log('6. LookupId after ID patch:', after2.fields.ResponsabledeAutorizarLookupId);

            if (String(after2.fields.ResponsabledeAutorizarLookupId) === String(targetId)) {
                console.log('>> SUCCESS with ID Patch!');
            } else {
                console.log('>> FAILED with ID Patch.');
            }
        }

    } catch (error) {
        console.error('VERIFICATION ERROR:', error);
    }
}

verifyUpdate();
