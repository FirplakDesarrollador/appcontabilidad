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

async function verifySync() {
    console.log('1. Obteniendo datos de Supabase...');
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
    const sbMap = new Map();
    for (const d of sbData) sbMap.set(d.ID, d);

    console.log('2. Obteniendo datos de SharePoint...');
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
    
    console.log(`\n3. Verificando sincronizacion...`);
    
    let discrepanciesPorAprobar = 0;
    let discrepanciesPorProcesar = 0;

    let spPorAprobarCount = 0;
    let spPorProcesarCount = 0;

    let sbPorAprobarCount = 0;
    let sbPorProcesarCount = 0;
    
    for (const item of spItems) {
        const id = Number(item.id);
        const fields = item.fields || {};
        const apr = (fields.Aprobacion_Doliente || '').trim();
        const ges = (fields.Gestion_Contabilidad || '').trim();

        if (apr.toLowerCase() === 'por aprobar') {
            spPorAprobarCount++;
        }
        if (ges.toLowerCase() === 'por procesar') {
            spPorProcesarCount++;
        }
        
        const sbRecord = sbMap.get(id);
        if (!sbRecord) {
             if (apr.toLowerCase() === 'por aprobar') discrepanciesPorAprobar++;
             if (ges.toLowerCase() === 'por procesar') discrepanciesPorProcesar++;
        } else {
            const sbApr = (sbRecord.Aprobacion_Doliente || '').trim();
            const sbGes = (sbRecord.Gestion_Contabilidad || '').trim();
            
            if (apr.toLowerCase() === 'por aprobar' && sbApr.toLowerCase() !== 'por aprobar') {
                discrepanciesPorAprobar++;
            }
            if (ges.toLowerCase() === 'por procesar' && sbGes.toLowerCase() !== 'por procesar') {
                discrepanciesPorProcesar++;
            }
        }
    }

    for (const d of sbData) {
        const sbApr = (d.Aprobacion_Doliente || '').trim();
        const sbGes = (d.Gestion_Contabilidad || '').trim();
        
        if (sbApr.toLowerCase() === 'por aprobar') {
            sbPorAprobarCount++;
        }
        if (sbGes.toLowerCase() === 'por procesar') {
            sbPorProcesarCount++;
        }
    }

    console.log('\n--- RESULTADOS ---');
    console.log(`[Aprobación Doliente = 'Por Aprobar']`);
    console.log(`Cantidad en SharePoint: ${spPorAprobarCount}`);
    console.log(`Cantidad en Supabase:   ${sbPorAprobarCount}`);
    console.log(`Discrepancias (SP -> SB): ${discrepanciesPorAprobar} (en SP pero no en SB o distinto estado)`);

    console.log(`\n[Gestión Contabilidad = 'Por Procesar']`);
    console.log(`Cantidad en SharePoint: ${spPorProcesarCount}`);
    console.log(`Cantidad en Supabase:   ${sbPorProcesarCount}`);
    console.log(`Discrepancias (SP -> SB): ${discrepanciesPorProcesar} (en SP pero no en SB o distinto estado)`);

    if (discrepanciesPorAprobar === 0 && discrepanciesPorProcesar === 0 && spPorAprobarCount === sbPorAprobarCount && spPorProcesarCount === sbPorProcesarCount) {
        console.log('\nESTADO: SINCRONIZADO CORRECTAMENTE ✅');
    } else {
        console.log('\nESTADO: DESINCRONIZADO ❌');
    }
}

verifySync().catch(console.error);
