import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import * as msal from "@azure/msal-node";
import { Client } from "@microsoft/microsoft-graph-client";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

try {
    const envFile = readFileSync(join(__dirname, '../.env'), 'utf-8');
    envFile.split('\n').forEach(line => {
        const [key, ...vals] = line.split('=');
        if (key && vals.length) process.env[key.trim()] = vals.join('=').trim().replace(/['"\r]/g, '');
    });
} catch (e) {
    console.error('Error loading .env:', e.message);
}

const msalConfig = {
    auth: {
        clientId: process.env.AZURE_CLIENT_ID,
        authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
        clientSecret: process.env.AZURE_CLIENT_SECRET,
    }
};

async function run() {
    const cca = new msal.ConfidentialClientApplication(msalConfig);
    const response = await cca.acquireTokenByClientCredential({ scopes: ["https://graph.microsoft.com/.default"] });
    const client = Client.init({ authProvider: (done) => { done(null, response.accessToken); } });

    try {
        console.log("Resolving site and list...");
        const siteResponse = await client.api('/sites/firplaksa.sharepoint.com:/sites/FPKContabilidad').get();
        const siteId = siteResponse.id;

        const listsResponse = await client.api(`/sites/${siteId}/lists`).get();
        const listName = 'Registro_de_Facturas';
        const list = listsResponse.value.find(l => l.name === listName || l.displayName === listName);
        const listId = list.id;

        console.log("Fetching all items (this may take a few seconds)...");
        let allItems = [];
        let nextLink = `/sites/${siteId}/lists/${listId}/items?$expand=fields&$top=500`;

        while (nextLink) {
            const res = await client.api(nextLink).header('Prefer', 'HonorNonIndexedQueriesWarningMayFailRandomly').get();
            allItems = allItems.concat(res.value);
            nextLink = res['@odata.nextLink'] ? res['@odata.nextLink'].split('v1.0')[1] : null;
        }

        console.log(`\nTotal items fetched from SharePoint: ${allItems.length}`);

        const unassigned = allItems.filter(i => {
            const f = i.fields || {};
            return !f.ResponsabledeAutorizarLookupId && !f.Responsable_de_AutorizarLookupId && !f.ResponsableAprobarLookupId;
        });

        console.log(`\n=> FACTURAS SIN RESPONSABLE: ${unassigned.length}`);
        
        if (unassigned.length > 0) {
            console.log("\nPrimeras 20 facturas sin responsable:");
            unassigned.slice(0, 20).forEach((u, idx) => {
                const facturaId = u.fields?.Nro_Factura || 'Sin Numero';
                const proveedor = u.fields?.Proveedor || 'Desconocido';
                console.log(`${idx + 1}. Factura: ${facturaId} | Proveedor: ${proveedor}`);
            });
        }
    } catch (e) {
        console.error("Error:", e.message);
    }
}

run();
