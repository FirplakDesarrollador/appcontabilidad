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
    const response = await cca.acquireTokenByClientCredential({ scopes: ["https://graph.microsoft.com/.default"] });
    const client = Client.init({ authProvider: (done) => { done(null, response.accessToken); } });

    const siteSlug = 'FPKContabilidad';
    const siteResponse = await client.api(`/sites/firplaksa.sharepoint.com:/sites/${siteSlug}`).get();
    const siteId = siteResponse.id;

    // Test with uppercase
    const emailUpper = 'Mateo.Benavides@firplak.com';
    const emailLower = 'mateo.benavides@firplak.com';

    try {
        const res1 = await client.api(`/sites/${siteId}/lists('User Information List')/items`)
            .header('Prefer', 'HonorNonIndexedQueriesWarningMayFailRandomly')
            .expand('fields($select=id,EMail,Title)')
            .filter(`fields/EMail eq '${emailUpper}'`)
            .get();
        console.log("Upper match:", res1.value.length);
    } catch(e) { console.log("Upper failed"); }

    try {
        // Find all pages
        let allUsers = [];
        let nextLink = `/sites/${siteId}/lists('User Information List')/items?$expand=fields($select=id,EMail,Title)&$top=500`;
        while (nextLink) {
            const res = await client.api(nextLink).get();
            allUsers = allUsers.concat(res.value);
            nextLink = res['@odata.nextLink'] ? res['@odata.nextLink'].split('v1.0')[1] : null;
        }
        console.log(`Total users fetched via pagination: ${allUsers.length}`);
        
        const found = allUsers.find(u => u.fields?.EMail?.toLowerCase() === emailLower);
        console.log("Found in pagination:", found ? found.fields.EMail : "No");

    } catch (e) { console.log(e); }
}

test();
