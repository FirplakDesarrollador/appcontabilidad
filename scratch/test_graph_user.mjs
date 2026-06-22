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

async function test() {
    const cca = new msal.ConfidentialClientApplication(msalConfig);
    const tokenRequest = { scopes: ["https://graph.microsoft.com/.default"] };
    const response = await cca.acquireTokenByClientCredential(tokenRequest);
    
    const client = Client.init({
        authProvider: (done) => { done(null, response.accessToken); },
    });

    try {
        const siteSlug = 'FPKContabilidad';
        const siteResponse = await client.api(`/sites/firplaksa.sharepoint.com:/sites/${siteSlug}`).get();
        const siteId = siteResponse.id;
        console.log("Site ID:", siteId);

        console.log("Searching user information list for mateo...");
        const userInfoRes = await client.api(`/sites/${siteId}/lists('User Information List')/items`)
            .header('Prefer', 'HonorNonIndexedQueriesWarningMayFailRandomly')
            .expand('fields($select=id,EMail,Title)')
            .filter(`fields/EMail eq 'mateo.benavides@firplak.com'`)
            .get();

        console.log("Filtered Search Results:", JSON.stringify(userInfoRes.value, null, 2));

        console.log("Downloading full list to search locally...");
        const allUsers = await client.api(`/sites/${siteId}/lists('User Information List')/items`)
            .expand('fields($select=id,EMail,Title)')
            .get();
        
        console.log(`Total users in list: ${allUsers.value.length}`);
        
        const foundUser = allUsers.value.find((u) => {
            const email = u.fields?.EMail || '';
            if(email.toLowerCase().includes('mateo')) console.log("Found mateo candidate:", email);
            return email.toLowerCase() === 'mateo.benavides@firplak.com';
        });

        console.log("Full Search Result:", foundUser ? JSON.stringify(foundUser, null, 2) : "Not found in full list");
    } catch (e) {
        console.error("FAILED to query graph:", e.message);
    }
}

test();
