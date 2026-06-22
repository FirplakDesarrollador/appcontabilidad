import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load env
try {
    const envFile = readFileSync(join(__dirname, '../.env'), 'utf-8');
    envFile.split('\n').forEach(line => {
        const [key, ...vals] = line.split('=');
        if (key && vals.length) process.env[key.trim()] = vals.join('=').trim().replace(/['"\r]/g, '');
    });
} catch (e) {
    console.error('Error loading .env:', e.message);
}

// We need to use the logic from sharepoint.ts to test it directly.
import * as msal from "@azure/msal-node";

const msalConfig = {
    auth: {
        clientId: process.env.AZURE_CLIENT_ID,
        authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
        clientSecret: process.env.AZURE_CLIENT_SECRET,
    }
};

const cca = new msal.ConfidentialClientApplication(msalConfig);

async function getSharePointRESTToken() {
    const response = await cca.acquireTokenByClientCredential({
        scopes: ["https://firplaksa.sharepoint.com/.default"],
    });
    return response?.accessToken;
}

async function testEnsureUser(email) {
    console.log(`Testing ensureUser for ${email}...`);
    const restToken = await getSharePointRESTToken();
    if (!restToken) {
        console.error("No token");
        return;
    }

    const spBaseUrl = 'https://firplaksa.sharepoint.com/sites/FPKContabilidad';
    
    // 1. Get digest
    let digest = "";
    try {
        const digestRes = await fetch(`${spBaseUrl}/_api/contextinfo`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${restToken}`,
                'Accept': 'application/json;odata=verbose',
            }
        });
        if (digestRes.ok) {
            const digestData = await digestRes.json();
            digest = digestData.d.GetContextWebInformation.FormDigestValue;
        } else {
            console.warn("Digest failed:", await digestRes.text());
        }
    } catch (e) {
        console.warn('Digest fetch error:', e);
    }

    // 2. ensureUser
    const ensureUrl = `${spBaseUrl}/_api/web/ensureuser`;
    const payload = JSON.stringify({ 'logonName': `i:0#.f|membership|${email}` });
    
    const ensureRes = await fetch(ensureUrl, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${restToken}`,
            'Accept': 'application/json;odata=verbose',
            'Content-Type': 'application/json;odata=verbose',
            ...(digest ? { 'X-RequestDigest': digest } : {})
        },
        body: payload
    });

    if (ensureRes.ok) {
        const data = await ensureRes.json();
        console.log("Success:", data.d);
    } else {
        const errText = await ensureRes.text();
        console.error("ensureUser failed:", errText);
    }
}

testEnsureUser("mateo.benavides@firplak.com");
