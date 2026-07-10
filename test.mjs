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
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function test() {
    const response = await cca.acquireTokenByClientCredential({ scopes: ['https://graph.microsoft.com/.default'] });
    const client = Client.init({ authProvider: (done) => done(null, response.accessToken) });
    const site = await client.api(`/sites/firplaksa.sharepoint.com:/sites/FPKContabilidad`).get();
    const lists = await client.api(`/sites/${site.id}/lists`).get();
    const list = lists.value.find(l => l.name === 'Registro_de_Facturas' || l.displayName === 'Registro_de_Facturas');
    
    let spItems = [];
    let spNextLink = `/sites/${site.id}/lists/${list.id}/items?expand=fields&$top=500`;
    while (spNextLink) {
        const req = client.api(spNextLink).header('Prefer', 'HonorNonIndexedQueriesWarningMayFailRandomly');
        const res = await req.get();
        spItems = spItems.concat(res.value || []);
        spNextLink = res['@odata.nextLink'] ? res['@odata.nextLink'].split('v1.0')[1] : null;
    }
    
    let count = 0;
    for(const item of spItems) {
        if(item.fields && item.fields.Aprobacion_Doliente === 'Aprobado' && item.fields.Gestion_Contabilidad === 'Por Procesar') {
            count++;
        }
    }
    console.log('--- SP API ---');
    console.log('Total SP API items:', spItems.length);
    console.log('SP API items with Aprobado + Por Procesar:', count);
    
    console.log('--- SUPABASE API ---');
    const { count: sbCount, error } = await supabase.from('Registro_Facturas')
        .select('*', { count: 'exact', head: true })
        .eq('Aprobacion_Doliente', 'Aprobado')
        .eq('Gestion_Contabilidad', 'Por Procesar');
    console.log('Supabase items with Aprobado + Por Procesar:', sbCount);
}
test().catch(console.error);
