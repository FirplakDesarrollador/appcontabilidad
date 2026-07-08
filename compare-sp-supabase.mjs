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

async function compare() {
    console.log('1. Consultando Supabase ("Por Procesar")...');
    
    // Fetch all from Supabase
    let sbData = [];
    let page = 0;
    while(true) {
        const { data, error } = await supabase.from('Registro_Facturas')
            .select('Nro_Factura, Gestion_Contabilidad')
            .eq('Gestion_Contabilidad', 'Por Procesar')
            .range(page * 1000, (page + 1) * 1000 - 1);
        if(error) throw error;
        if(data.length === 0) break;
        sbData = sbData.concat(data);
        page++;
    }
    
    const sbInvoiceNumbers = new Set(sbData.map(d => (d.Nro_Factura || '').trim()).filter(d => d !== ''));
    console.log(`- En Supabase hay ${sbData.length} registros "Por Procesar".`);
    
    console.log('\n2. Consultando SharePoint ("Por Procesar")...');
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
    
    const spInvoiceNumbers = new Set();
    let spPorProcesarCount = 0;
    for (const item of spItems) {
        if(item.fields && item.fields.Gestion_Contabilidad === 'Por Procesar') {
            spPorProcesarCount++;
            const nro = (item.fields.Nro_Factura || '').trim();
            if (nro) spInvoiceNumbers.add(nro);
        }
    }
    console.log(`- En SharePoint hay ${spPorProcesarCount} registros "Por Procesar".`);
    
    console.log('\n--- RESULTADOS DE LA COMPARACIÓN ---');
    console.log(`- Supabase total "Por Procesar": ${sbData.length}`);
    console.log(`- SharePoint total "Por Procesar": ${spPorProcesarCount}`);
    
    const inSbNotInSp = [...sbInvoiceNumbers].filter(nro => !spInvoiceNumbers.has(nro));
    const inSpNotInSb = [...spInvoiceNumbers].filter(nro => !sbInvoiceNumbers.has(nro));
    
    console.log(`\nDiferencias por Número de Factura (Nro_Factura):`);
    console.log(`Facturas que están en Supabase como "Por Procesar" pero NO en SharePoint: ${inSbNotInSp.length}`);
    if (inSbNotInSp.length > 0) {
        console.log(`  -> Detalles: ${inSbNotInSp.join(', ')}`);
    }
    console.log(`Facturas que están en SharePoint como "Por Procesar" pero NO en Supabase: ${inSpNotInSb.length}`);
    if (inSpNotInSb.length > 0) {
        console.log(`  -> Detalles: ${inSpNotInSb.join(', ')}`);
    }
}

compare().catch(console.error);
