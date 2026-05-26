import { createClient } from '@supabase/supabase-js';
import * as msal from '@azure/msal-node';
import { Client } from '@microsoft/microsoft-graph-client';
import dotenv from 'dotenv';
dotenv.config();

const msalConfig = {
    auth: {
        clientId: process.env.AZURE_CLIENT_ID,
        authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
        clientSecret: process.env.AZURE_CLIENT_SECRET,
    },
};
const cca = new msal.ConfidentialClientApplication(msalConfig);

async function getGraphClient() {
    const response = await cca.acquireTokenByClientCredential({
        scopes: ['https://graph.microsoft.com/.default'],
    });
    return Client.init({
        authProvider: (done) => done(null, response.accessToken),
    });
}

async function test() {
    try {
        const client = await getGraphClient();
        const siteResponse = await client.api('/sites/firplaksa.sharepoint.com:/sites/FPKContabilidad').get();
        const siteId = siteResponse.id;
        
        const listsResponse = await client.api(`/sites/${siteId}/lists`).get();
        const list = listsResponse.value.find(l => l.name === 'Documento_Soporte');
        const listId = list.id;

        console.log("Fetching with orderby...");
        const res = await client.api(`/sites/${siteId}/lists/${listId}/items?expand=fields&top=5&$orderby=id desc`).get();
        console.log("Success! Items fetched:", res.value.map(item => item.id));
    } catch (e) {
        console.error("Failed:", e);
    }
}

test();
