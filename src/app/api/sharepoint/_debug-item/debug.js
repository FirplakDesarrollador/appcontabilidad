const { Client } = require("@microsoft/microsoft-graph-client");
const msal = require("@azure/msal-node");
const fs = require("fs");
const path = require("path");

// Load .env.local manually
const envPath = path.join(__dirname, "../../../../../.env.local");
const envContent = fs.readFileSync(envPath, "utf-8");
const env = {};
envContent.split("\n").forEach(line => {
    const parts = line.split("=");
    if (parts.length >= 2) {
        env[parts[0].trim()] = parts.slice(1).join("=").trim();
    }
});

const msalConfig = {
    auth: {
        clientId: env.AZURE_CLIENT_ID,
        authority: `https://login.microsoftonline.com/${env.AZURE_TENANT_ID}`,
        clientSecret: env.AZURE_CLIENT_SECRET,
    }
};

const cca = new msal.ConfidentialClientApplication(msalConfig);

async function getAccessToken() {
    const tokenRequest = {
        scopes: ["https://graph.microsoft.com/.default"],
    };
    const response = await cca.acquireTokenByClientCredential(tokenRequest);
    return response?.accessToken;
}

async function run() {
    const token = await getAccessToken();
    const client = Client.init({
        authProvider: (done) => {
            done(null, token);
        },
    });

    const itemId = "47695";
    const sitePath = "/sites/firplaksa.sharepoint.com:/sites/FPKContabilidad";

    try {
        console.log("Resolving site...");
        const site = await client.api(sitePath).get();
        console.log("Site ID:", site.id);

        console.log("Resolving list...");
        const lists = await client.api(`/sites/${site.id}/lists`).get();
        const list = lists.value.find(l => l.name === 'Registro_de_Facturas' || l.displayName === 'Registro_de_Facturas');
        console.log("List ID:", list.id);

        console.log("\n--- Testing Endpoints for Item " + itemId + " ---");

        // Test 1: Standard attachments endpoint
        try {
            console.log("Testing /items/{id}/attachments ...");
            const res1 = await client.api(`/sites/${site.id}/lists/${list.id}/items/${itemId}/attachments`).get();
            console.log("Success! Count:", res1.value.length);
            console.log(JSON.stringify(res1.value, null, 2));
        } catch (e) {
            console.log("Failed:", e.message);
        }

        // Test 2: Expand attachments via drive item if possible
        try {
             console.log("\nTesting drive item via list...");
             // Items in a list are sometimes accessible via /items/{id}/driveItem
             const resDrive = await client.api(`/sites/${site.id}/lists/${list.id}/items/${itemId}/driveItem`).get();
             console.log("Success! DriveItem Name:", resDrive.name);
             console.log("WebUrl:", resDrive.webUrl);
        } catch (e) {
             console.log("Failed driveItem:", e.message);
        }

    } catch (err) {
        console.error("Critical error:", err);
    }
}

run();
