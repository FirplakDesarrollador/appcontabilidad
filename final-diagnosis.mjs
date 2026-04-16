import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const envFile = readFileSync(join(__dirname, '.env.local'), 'utf-8');
envFile.split('\n').forEach(line => {
    const [key, ...vals] = line.split('=');
    if (key && vals.length) process.env[key.trim()] = vals.join('=').trim();
});

const { ConfidentialClientApplication } = await import('@azure/msal-node');

const cca = new ConfidentialClientApplication({
    auth: {
        clientId: process.env.AZURE_CLIENT_ID,
        authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
        clientSecret: process.env.AZURE_CLIENT_SECRET,
    },
});

const output = [];

// Token para SharePoint REST
try {
    const spResp = await cca.acquireTokenByClientCredential({
        scopes: ['https://firplaksa.sharepoint.com/.default'],
    });
    const parts = spResp.accessToken.split('.');
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    output.push('SP_TOKEN: OK');
    output.push('SP_AUD: ' + payload.aud);
    output.push('SP_ROLES: ' + JSON.stringify(payload.roles));

    // Probar acceso real
    const url = 'https://firplaksa.sharepoint.com/sites/FPKContabilidad/_api/web/lists/getbytitle(\'Registro_de_Facturas\')/items(47701)/AttachmentFiles';
    const res = await fetch(url, {
        headers: {
            'Authorization': `Bearer ${spResp.accessToken}`,
            'Accept': 'application/json;odata=nometadata'
        }
    });
    output.push('REST_STATUS: ' + res.status);
    const text = await res.text();
    output.push('REST_BODY: ' + text.substring(0, 300));
} catch (e) {
    output.push('SP_TOKEN_ERROR: ' + e.message);
}

writeFileSync(join(__dirname, 'diagnosis-output.txt'), output.join('\n'));
console.log('Done. Check diagnosis-output.txt');
