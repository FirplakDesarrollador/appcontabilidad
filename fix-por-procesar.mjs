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

async function fixPorProcesar() {
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
    
    console.log(`\n3. Analizando diferencias y corrigiendo...`);
    let inserts = 0;
    let updates = 0;
    
    for (const item of spItems) {
        const id = Number(item.id);
        const fields = item.fields || {};
        const apr = (fields.Aprobacion_Doliente || '').trim();
        const ges = (fields.Gestion_Contabilidad || '').trim();
        const nro = (fields.Nro_Factura || '').trim();
        
        // El usuario pidió organizar las de "Por Procesar"
        // Validaremos si difieren en Gestión Contabilidad o si es una nueva que falta en SB.
        
        const sbRecord = sbMap.get(id);
        if (!sbRecord) {
            // No existe en Supabase, la insertamos
            const insertData = {
                ID: id,
                Nro_Factura: nro || null,
                Aprobacion_Doliente: apr || null,
                Gestion_Contabilidad: ges || null
            };
            const { error } = await supabase.from('Registro_Facturas').insert([insertData]);
            if (error) console.error(`Error insertando SP ID ${id}:`, error.message);
            else {
                console.log(`INSERTADO NUEVO: SP ID ${id} (Nro: ${nro})`);
                inserts++;
            }
        } else {
            // Existe. Verificamos si los estados están desactualizados
            const sbApr = (sbRecord.Aprobacion_Doliente || '').trim();
            const sbGes = (sbRecord.Gestion_Contabilidad || '').trim();
            
            if (apr !== sbApr || ges !== sbGes) {
                const updateData = {
                    Aprobacion_Doliente: apr || null,
                    Gestion_Contabilidad: ges || null
                };
                const { error } = await supabase.from('Registro_Facturas').update(updateData).eq('ID', id);
                if (error) {
                    console.error(`Error actualizando SP ID ${id}:`, error.message);
                } else {
                    console.log(`ACTUALIZADO ESTADO: SP ID ${id} (Nro: ${nro}) -> Ges: ${sbGes} pasó a ${ges}`);
                    updates++;
                }
            }
        }
    }
    
    console.log(`\n¡Sincronización Inteligente Completada!`);
    console.log(`Nuevas facturas insertadas: ${inserts}`);
    console.log(`Facturas actualizadas a su estado real: ${updates}`);
}

fixPorProcesar().catch(console.error);
