const { Client } = require("@microsoft/microsoft-graph-client");
const msal = require("@azure/msal-node");
const fs = require("fs");
const path = require("path");

// Manually parse .env file
try {
    const envPath = path.join(__dirname, "../.env");
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, "utf-8");
        envContent.split("\n").forEach(line => {
            const matches = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
            if (matches) {
                const key = matches[1];
                let value = matches[2] || "";
                if (value.length > 0 && value.charAt(0) === '"' && value.charAt(value.length - 1) === '"') {
                    value = value.replace(/\\n/gm, "\n");
                }
                process.env[key] = value.replace(/(^["']|["']$)/g, "");
            }
        });
    }
} catch (e) {
    console.error("Error reading .env file:", e);
}

const msalConfig = {
    auth: {
        clientId: process.env.AZURE_CLIENT_ID,
        authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
        clientSecret: process.env.AZURE_CLIENT_SECRET,
    }
};

const cca = new msal.ConfidentialClientApplication(msalConfig);

async function run() {
    const tokenRequest = { scopes: ["https://graph.microsoft.com/.default"] };
    const response = await cca.acquireTokenByClientCredential(tokenRequest);
    const token = response.accessToken;
    
    const client = Client.init({
        authProvider: (done) => { done(null, token); },
    });

    const siteResponse = await client.api('/sites/firplaksa.sharepoint.com:/sites/FPKContabilidad').get();
    const siteId = siteResponse.id;

    const listsResponse = await client.api(`/sites/${siteId}/lists`).get();
    
    const list = listsResponse.value.find(l => l.name === 'Registro_de_Facturas' || l.displayName === 'Registro_de_Facturas');
    
    if (!list) {
        console.log("Could not find Registro_de_Facturas list.");
        return;
    }
    
    console.log("List Name:", list.name, "List ID:", list.id);

    try {
        const item = await client.api(`/sites/${siteId}/lists/${list.id}/items/49925?expand=fields`).get();
        console.log("\n--- ITEM 49925 FIELDS ---");
        console.log(JSON.stringify(item.fields, null, 2));
    } catch (e) {
        console.error("Error fetching item 49925:", e.message);
    }
}

run().catch(console.error);
