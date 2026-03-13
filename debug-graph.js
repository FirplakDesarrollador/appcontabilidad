const { ConfidentialClientApplication } = require('@azure/msal-node');
const { Client } = require('@microsoft/microsoft-graph-client');
require('dotenv').config();

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

        const SITE_ID = 'firplaksa.sharepoint.com,41f4866c-5fec-4b36-9f08-f86c5e7566a6,2d6e04d4-34fd-49db-88fa-05b6301389e0';
        console.log(`Fetching lists for site ${SITE_ID}...`);
        
        const lists = await client.api(`/sites/${SITE_ID}/lists`).get();
        console.log(`Success! Found ${lists.value.length} lists.`);
    } catch (e) {
        console.error('ERROR OCCURRED:');
        console.error(e.statusCode);
        console.error(e.message);
        if (e.body) console.error(e.body);
    }
}

test();
