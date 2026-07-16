import { readFileSync } from 'fs';
import { ConfidentialClientApplication } from '@azure/msal-node';
import { Client } from '@microsoft/microsoft-graph-client';
import { createClient } from '@supabase/supabase-js';

const envFile = readFileSync('.env', 'utf-8');
envFile.split('\n').forEach(line => {
    const [key, ...vals] = line.split('=');
    if (key && vals.length) process.env[key.trim()] = vals.join('=').trim();
});
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const cca = new ConfidentialClientApplication({
    auth: {
        clientId: process.env.AZURE_CLIENT_ID,
        authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
        clientSecret: process.env.AZURE_CLIENT_SECRET,
    },
});

async function check() {
    const response = await cca.acquireTokenByClientCredential({ scopes: ['https://graph.microsoft.com/.default'] });
    const client = Client.init({ authProvider: (done) => done(null, response.accessToken) });
    const site = await client.api('/sites/firplaksa.sharepoint.com:/sites/FPKContabilidad').get();
    const lists = await client.api(`/sites/${site.id}/lists`).get();
    const list = lists.value.find(l => l.name === 'Registro_de_Facturas' || l.displayName === 'Registro_de_Facturas');
    
    const req = client.api(`/sites/${site.id}/lists/${list.id}/items?expand=fields&$top=20`).header('Prefer', 'HonorNonIndexedQueriesWarningMayFailRandomly');
    const res = await req.get();
    
    for (let i = 0; i < 1; i++) {
        const item = res.value[i];
        console.log(Object.keys(item.fields).filter(k=>k.toLowerCase().includes('digi')));
        console.log(`SP ID ${item.id}: Aprobacion_Doliente=${item.fields.Aprobacion_Doliente}, Gestion_Contabilidad=${item.fields.Gestion_Contabilidad}, Procesado=${item.fields.Procesado}`);
    }
}
check().catch(console.error);
