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

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function compareAprobacion() {
    console.log('1. Consultando Supabase...');
    
    // Fetch all from Supabase
    let sbData = [];
    let page = 0;
    while(true) {
        const { data, error } = await supabase.from('Registro_Facturas')
            .select('Aprobacion_Doliente')
            .range(page * 1000, (page + 1) * 1000 - 1);
        if(error) throw error;
        if(data.length === 0) break;
        sbData = sbData.concat(data);
        page++;
    }
    
    const sbCounts = {};
    for (const d of sbData) {
        const val = (d.Aprobacion_Doliente || 'VACÍO').trim();
        sbCounts[val] = (sbCounts[val] || 0) + 1;
    }
    
    console.log('\n2. Consultando SharePoint...');
    const cca = new ConfidentialClientApplication({
        auth: {
            clientId: process.env.AZURE_CLIENT_ID,
            authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
            clientSecret: process.env.AZURE_CLIENT_SECRET,
        },
    });
    const response = await cca.acquireTokenByClientCredential({ scopes: ['https://graph.microsoft.com/.default'] });
    const spClient = Client.init({ authProvider: (done) => done(null, response.accessToken) });
    const site = await spClient.api('/sites/firplaksa.sharepoint.com:/sites/FPKContabilidad').get();
    const lists = await spClient.api(`/sites/${site.id}/lists`).get();
    const list = lists.value.find(l => l.name === 'Registro_de_Facturas' || l.displayName === 'Registro_de_Facturas');

    let spItems = [];
    let spNextLink = `/sites/${site.id}/lists/${list.id}/items?expand=fields&$top=500`;
    while (spNextLink) {
        const res = await spClient.api(spNextLink).header('Prefer', 'HonorNonIndexedQueriesWarningMayFailRandomly').get();
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
    
    const spCounts = {};
    for (const item of spItems) {
        const val = (item.fields && item.fields.Aprobacion_Doliente || 'VACÍO').trim();
        spCounts[val] = (spCounts[val] || 0) + 1;
    }
    
    console.log('\n--- RESULTADOS DE LA COMPARACIÓN (Aprobacion_Doliente) ---');
    console.log(`Total de registros en Supabase: ${sbData.length}`);
    console.log(`Total de registros en SharePoint: ${spItems.length}\n`);
    
    const allKeys = new Set([...Object.keys(sbCounts), ...Object.keys(spCounts)]);
    
    for (const key of allKeys) {
        const sb = sbCounts[key] || 0;
        const sp = spCounts[key] || 0;
        console.log(`Estado: "${key}"`);
        console.log(`  - SharePoint: ${sp}`);
        console.log(`  - Supabase:   ${sb}`);
        if (sp !== sb) {
            console.log(`  -> DIFERENCIA: ${Math.abs(sp - sb)} registros`);
        }
        console.log('');
    }
}

compareAprobacion().catch(console.error);
