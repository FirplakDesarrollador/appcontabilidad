import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import { ConfidentialClientApplication } from '@azure/msal-node';
import { Client } from '@microsoft/microsoft-graph-client';

const envFile = readFileSync('.env', 'utf-8');
envFile.split('\n').forEach(line => {
    const [key, ...vals] = line.split('=');
    if (key && vals.length) process.env[key.trim()] = vals.join('=').trim();
});
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function check() {
    console.log('Fetching all SP items...');
    const cca = new ConfidentialClientApplication({
        auth: {
            clientId: process.env.AZURE_CLIENT_ID,
            authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
            clientSecret: process.env.AZURE_CLIENT_SECRET,
        },
    });
    const response = await cca.acquireTokenByClientCredential({ scopes: ['https://graph.microsoft.com/.default'] });
    const client = Client.init({ authProvider: (done) => done(null, response.accessToken) });
    const site = await client.api('/sites/firplaksa.sharepoint.com:/sites/FPKContabilidad').get();
    const lists = await client.api(`/sites/${site.id}/lists`).get();
    const list = lists.value.find(l => l.name === 'Registro_de_Facturas' || l.displayName === 'Registro_de_Facturas');

    let spItems = [];
    let spNextLink = `/sites/${site.id}/lists/${list.id}/items?expand=fields&$top=500`;
    while (spNextLink) {
        const res = await client.api(spNextLink).header('Prefer', 'HonorNonIndexedQueriesWarningMayFailRandomly').get();
        spItems = spItems.concat(res.value || []);
        const nextOdata = res['@odata.nextLink'];
        if (nextOdata) {
            const skiptokenMatch = nextOdata.match(/skiptoken=([^&]+)/);
            if (skiptokenMatch) {
                spNextLink = `/sites/${site.id}/lists/${list.id}/items?expand=fields&$top=500&$skiptoken=${skiptokenMatch[1]}`;
            } else {
                spNextLink = nextOdata.split('v1.0')[1];
            }
        } else {
            spNextLink = null;
        }
    }
    
    console.log('Total SP Items:', spItems.length);
    
    // Create map of true values
    const trueValues = {};
    for (const item of spItems) {
        if(item.fields) {
            trueValues[item.id] = {
                Aprobacion_Doliente: item.fields.Aprobacion_Doliente || '',
                Gestion_Contabilidad: item.fields.Gestion_Contabilidad || ''
            };
        }
    }
    
    let updated = 0;
    for (const id in trueValues) {
        const { error } = await supabase.from('Registro_Facturas')
            .update(trueValues[id])
            .eq('ID', Number(id));
        if (!error) updated++;
        if (updated % 500 === 0) console.log('Updated:', updated);
    }
    
    console.log('Successfully updated records:', updated);
    
    const { count } = await supabase.from('Registro_Facturas')
        .select('*', { count: 'exact', head: true })
        .eq('Aprobacion_Doliente', 'Aprobado')
        .eq('Gestion_Contabilidad', 'Por Procesar');
        
    console.log('FINAL Supabase count:', count);
}
check().catch(console.error);
