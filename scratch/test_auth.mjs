import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import * as msal from "@azure/msal-node";

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
    console.log("Client ID:", process.env.AZURE_CLIENT_ID);
    const cca = new msal.ConfidentialClientApplication(msalConfig);
    try {
        const tokenRequest = { scopes: ["https://graph.microsoft.com/.default"] };
        const response = await cca.acquireTokenByClientCredential(tokenRequest);
        console.log("SUCCESS! Token acquired.");
    } catch (e) {
        console.error("FAILED to acquire token:", e.message);
    }
}

test();
