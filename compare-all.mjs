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

async function compareAll() {
    console.log('1. Consultando Supabase...');
    
    // Fetch all from Supabase
    let sbData = [];
    let page = 0;
    while(true) {
        const { data, error } = await supabase.from('Registro_Facturas')
            .select('ID, Nro_Factura, Aprobacion_Doliente, Gestion_Contabilidad')
            .range(page * 1000, (page + 1) * 1000 - 1);
        if(error) throw error;
        if(data.length === 0) break;
        sbData = sbData.concat(data);
        page++;
    }
    
    const sbAprobacionCounts = {};
    const sbGestionCounts = {};
    const sbMap = new Map();
    for (const d of sbData) {
        const apr = (d.Aprobacion_Doliente || 'VACÍO').trim();
        const ges = (d.Gestion_Contabilidad || 'VACÍO').trim();
        sbAprobacionCounts[apr] = (sbAprobacionCounts[apr] || 0) + 1;
        sbGestionCounts[ges] = (sbGestionCounts[ges] || 0) + 1;
        sbMap.set(d.ID, { Aprobacion_Doliente: apr, Gestion_Contabilidad: ges, Nro_Factura: d.Nro_Factura });
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
    
    const spAprobacionCounts = {};
    const spGestionCounts = {};
    const spMap = new Map();
    for (const item of spItems) {
        const id = Number(item.id);
        const apr = (item.fields && item.fields.Aprobacion_Doliente || 'VACÍO').trim();
        const ges = (item.fields && item.fields.Gestion_Contabilidad || 'VACÍO').trim();
        const nro = (item.fields && item.fields.Nro_Factura || '').trim();
        spAprobacionCounts[apr] = (spAprobacionCounts[apr] || 0) + 1;
        spGestionCounts[ges] = (spGestionCounts[ges] || 0) + 1;
        spMap.set(id, { Aprobacion_Doliente: apr, Gestion_Contabilidad: ges, Nro_Factura: nro });
    }
    
    console.log('\n--- RESULTADOS GENERALES ---');
    console.log(`Total Supabase: ${sbData.length}`);
    console.log(`Total SharePoint: ${spItems.length}\n`);
    
    console.log('--- COLUMNA: Aprobacion_Doliente ---');
    const allAprKeys = new Set([...Object.keys(sbAprobacionCounts), ...Object.keys(spAprobacionCounts)]);
    for (const key of allAprKeys) {
        const sb = sbAprobacionCounts[key] || 0;
        const sp = spAprobacionCounts[key] || 0;
        console.log(`- "${key}": SP = ${sp} | Supabase = ${sb} ${sp !== sb ? ' (DIFERENCIA: ' + Math.abs(sp - sb) + ')' : ''}`);
    }

    console.log('\n--- COLUMNA: Gestion_Contabilidad ---');
    const allGesKeys = new Set([...Object.keys(sbGestionCounts), ...Object.keys(spGestionCounts)]);
    for (const key of allGesKeys) {
        const sb = sbGestionCounts[key] || 0;
        const sp = spGestionCounts[key] || 0;
        console.log(`- "${key}": SP = ${sp} | Supabase = ${sb} ${sp !== sb ? ' (DIFERENCIA: ' + Math.abs(sp - sb) + ')' : ''}`);
    }
    
    console.log('\n--- DESFASE DE REGISTROS ESPECÍFICOS ---');
    let diffs = 0;
    for (const [id, spVal] of spMap.entries()) {
        const sbVal = sbMap.get(id);
        if (!sbVal) {
            console.log(`FALTA EN SUPABASE: SP ID ${id} (Nro: ${spVal.Nro_Factura}) -> Apr: ${spVal.Aprobacion_Doliente}, Ges: ${spVal.Gestion_Contabilidad}`);
            diffs++;
        } else {
            if (spVal.Aprobacion_Doliente !== sbVal.Aprobacion_Doliente || spVal.Gestion_Contabilidad !== sbVal.Gestion_Contabilidad) {
                console.log(`DIFERENCIA DE ESTADO: SP ID ${id} (Nro: ${spVal.Nro_Factura})`);
                console.log(`  SP -> Apr: ${spVal.Aprobacion_Doliente}, Ges: ${spVal.Gestion_Contabilidad}`);
                console.log(`  SB -> Apr: ${sbVal.Aprobacion_Doliente}, Ges: ${sbVal.Gestion_Contabilidad}`);
                diffs++;
            }
        }
    }
    
    for (const [id, sbVal] of sbMap.entries()) {
        if (!spMap.has(id)) {
            console.log(`SOBRA EN SUPABASE (No está en SP): SB ID ${id} (Nro: ${sbVal.Nro_Factura})`);
            diffs++;
        }
    }
    
    if (diffs === 0) {
        console.log('¡Sincronización PERFECTA! No hay ningún desfase entre las bases de datos.');
    } else {
        console.log(`\nSe encontraron ${diffs} diferencias en total.`);
    }
}

compareAll().catch(console.error);
