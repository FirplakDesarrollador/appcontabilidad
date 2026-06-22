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

        console.log("Fetching all items to find unassigned...");
        let allItems = [];
        let nextLink = `/sites/${siteId}/lists/${listId}/items?$expand=fields&$top=500`;

        while (nextLink) {
            const res = await client.api(nextLink).header('Prefer', 'HonorNonIndexedQueriesWarningMayFailRandomly').get();
            allItems = allItems.concat(res.value);
            nextLink = res['@odata.nextLink'] ? res['@odata.nextLink'].split('v1.0')[1] : null;
        }

        const unassigned = allItems.filter(i => {
            const f = i.fields || {};
            return !f.ResponsabledeAutorizarLookupId && !f.Responsable_de_AutorizarLookupId && !f.ResponsableAprobarLookupId;
        });

        console.log(`Found ${unassigned.length} facturas sin responsable.`);
        
        // ID de Mateo Benavides en SharePoint FPKContabilidad es 206
        const mateoId = 206;

        for (const item of unassigned) {
            const facturaId = item.fields?.Nro_Factura || 'Sin Numero';
            console.log(`Asignando a Mateo (ID 206) en SharePoint para factura: ${facturaId} (SharePoint Item ID: ${item.id})...`);
            
            let updated = false;
            const fieldsToTry = ['ResponsabledeAutorizarLookupId', 'Responsable_de_AutorizarLookupId', 'ResponsableAprobarLookupId'];
            
            for (const fieldName of fieldsToTry) {
                try {
                    await client.api(`/sites/${siteId}/lists/${listId}/items/${item.id}/fields`).patch({
                        [fieldName]: mateoId
                    });
                    console.log(`✅ Actualizado correctamente en el campo ${fieldName}`);
                    updated = true;
                    break;
                } catch (e) {
                    // Try next field
                }
            }

            if (!updated) {
                console.error(`❌ No se pudo actualizar ${facturaId} en ningún campo conocido.`);
            }
        }

        console.log("¡Proceso completado!");
    } catch (e) {
        console.error("Error:", e.message);
    }
}

run();
