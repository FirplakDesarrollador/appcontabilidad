import * as msal from "@azure/msal-node";
import { Client } from "@microsoft/microsoft-graph-client";
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
const lines = env.split('\n');
const process_env = {};
lines.forEach(line => {
    const parts = line.split('=');
    if (parts.length === 2) {
        process_env[parts[0].trim()] = parts[1].trim();
    }
});

const msalConfig = {
    auth: {
        clientId: process_env.AZURE_CLIENT_ID,
        authority: `https://login.microsoftonline.com/${process_env.AZURE_TENANT_ID}`,
        clientSecret: process_env.AZURE_CLIENT_SECRET,
    }
};

const cca = new msal.ConfidentialClientApplication(msalConfig);

async function run() {
    try {
        const response = await cca.acquireTokenByClientCredential({
            scopes: ["https://graph.microsoft.com/.default"],
        });
        const client = Client.init({
            authProvider: (done) => done(null, response.accessToken),
        });

        const site = await client.api('/sites/firplaksa.sharepoint.com:/sites/FPKContabilidad').get();
        const lists = await client.api(`/sites/${site.id}/lists`).get();
        const list = lists.value.find((l) => l.name === 'Registro_de_Facturas' || l.displayName === 'Registro_de_Facturas');
        
        console.log("List ID:", list.id);
        const columns = await client.api(`/sites/${site.id}/lists/${list.id}/columns`).get();
        const targets = ['tablaCostos', 'centro_costos'];
        targets.forEach(t => {
            const col = columns.value.find(c => c.name === t);
            console.log(`${t} Column Info:`, JSON.stringify(col, null, 2));
        });
    } catch (e) {
        console.error(e);
    }
}

run();
