import * as msal from "@azure/msal-node";
import { Client } from "@microsoft/microsoft-graph-client";
import fs from 'fs';

function loadEnv() {
    try {
        if (fs.existsSync('.env')) {
            const envContent = fs.readFileSync('.env', 'utf8');
            envContent.split('\n').forEach(line => {
                const [key, ...valueParts] = line.split('=');
                if (key && valueParts.length > 0) {
                    const value = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
                    process.env[key.trim()] = value;
                }
            });
        }
    } catch (e) {}
}

loadEnv();


const msalConfig = {
    auth: {
        clientId: process.env.AZURE_CLIENT_ID,
        authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
        clientSecret: process.env.AZURE_CLIENT_SECRET,
    }
};

const cca = new msal.ConfidentialClientApplication(msalConfig);

async function getAccessToken() {
    const tokenRequest = {
        scopes: ["https://graph.microsoft.com/.default"],
    };
    const response = await cca.acquireTokenByClientCredential(tokenRequest);
    return response.accessToken;
}

async function inspectListFields(listId) {
    try {
        const token = await getAccessToken();
        const client = Client.init({
            authProvider: (done) => {
                done(null, token);
            },
        });

        // Resolve Site ID
        const siteResponse = await client.api('/sites/firplaksa.sharepoint.com:/sites/FPKContabilidad').get();
        const siteId = siteResponse.id;

        console.log(`Inspecting list ${listId} in site ${siteId}...`);

        // Get Columns
        const columns = await client.api(`/sites/${siteId}/lists/${listId}/columns`).get();
        console.log("=== COLUMNS ===");
        columns.value.forEach(col => {
            console.log(`Display: ${col.displayName} | Internal: ${col.name} | Type: ${col.text ? 'text' : col.choice ? 'choice' : col.lookup ? 'lookup' : 'other'}`);
        });

        // Get one item to see values
        const items = await client.api(`/sites/${siteId}/lists/${listId}/items`).expand('fields').top(1).get();
        if (items.value.length > 0) {
            console.log("\n=== SAMPLE ITEM FIELDS ===");
            console.log(JSON.stringify(items.value[0].fields, null, 2));
        }

    } catch (error) {
        console.error("Error:", error);
    }
}

inspectListFields("97e0ab5e-2cb8-4e28-b4fd-b1b638a0068f"); 
