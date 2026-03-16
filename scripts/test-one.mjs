import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const envFile = readFileSync(join(dirname(__dirname), '.env.local'), 'utf-8');
envFile.split('\n').forEach(line => {
    const [key, ...vals] = line.split('=');
    if (key && vals.length) process.env[key.trim()] = vals.join('=').trim();
});

const { ConfidentialClientApplication } = await import('@azure/msal-node');
const { Client } = await import('@microsoft/microsoft-graph-client');
const { createClient } = await import('@supabase/supabase-js');

async function testOne() {
    console.log("🧪 Iniciando prueba de migración de UN solo archivo...");
    
    const cca = new ConfidentialClientApplication({
        auth: {
            clientId: process.env.AZURE_CLIENT_ID,
            authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
            clientSecret: process.env.AZURE_CLIENT_SECRET,
        },
    });
    const token = await cca.acquireTokenByClientCredential({ scopes: ['https://graph.microsoft.com/.default'] });
    const client = Client.init({ authProvider: (done) => done(null, token.accessToken) });
    const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

    const site = await client.api('/sites/firplaksa.sharepoint.com:/sites/ITPowerApps').get();
    const res = await client.api(`/sites/${site.id}/drive/root:/Reenvio facture:/children?$top=1`).get();
    
    if (res.value.length === 0) return console.log("No hay folders.");
    
    const folder = res.value[0];
    console.log("Folder Name:", folder.name);
    
    const files = await client.api(`/drives/${folder.parentReference.driveId}/items/${folder.id}/children`).get();
    const targetFile = files.value.find(f => f.file && f.name.toLowerCase().endsWith('.pdf'));
    
    if (!targetFile) return console.log("No hay PDF en ese folder.");
    
    console.log("Target File:", targetFile.name);
    
    const content = await client.api(`/drives/${folder.parentReference.driveId}/items/${targetFile.id}/content`).get();
    const chunks = [];
    for await (const chunk of content) chunks.push(chunk);
    const buffer = Buffer.concat(chunks);
    
    const path = `${folder.name}/${targetFile.name}`;
    console.log("Dest Path:", path);
    
    const { data, error } = await s.storage.from('facturas-documentos').upload(path, buffer, {
        contentType: 'application/pdf',
        upsert: true
    });
    
    if (error) console.error("Error Upload:", error);
    else console.log("Success Upload:", data);
}

testOne();
