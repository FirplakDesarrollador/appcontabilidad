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

async function syncPorAprobar() {
    console.log('1. Consultando facturas "Por Aprobar" en SharePoint...');
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
    
    // Filtrar solo las "Por Aprobar"
    const porAprobarItems = spItems.filter(item => {
        return (item.fields && item.fields.Aprobacion_Doliente === 'Por Aprobar');
    });
    
    console.log(`Se encontraron ${porAprobarItems.length} facturas con estado "Por Aprobar" en SharePoint.`);
    
    console.log('2. Sincronizándolas con Supabase...');
    let successCount = 0;
    
    // Como pueden no existir en Supabase (son nuevas), usamos upsert basado en Nro_Factura o insert si falla
    for (const item of porAprobarItems) {
        const fields = item.fields;
        
        // Vamos a verificar si existe en Supabase primero por ID
        const { data: existingData } = await supabase.from('Registro_Facturas')
            .select('ID')
            .eq('ID', Number(item.id))
            .single();
            
        const upsertData = {
            Nro_Factura: fields.Nro_Factura || null,
            Aprobacion_Doliente: fields.Aprobacion_Doliente || null,
            Gestion_Contabilidad: fields.Gestion_Contabilidad || null
        };
        
        if (existingData) {
            // Existe, actualizamos
            const { error } = await supabase.from('Registro_Facturas').update(upsertData).eq('ID', Number(item.id));
            if (error) console.error(`Error actualizando SP ID ${item.id}:`, error.message);
            else successCount++;
        } else {
            // No existe, insertamos. Renombramos `id` a `ID` si es necesario para el insert.
            // Ajustamos el objeto para coincidir con las columnas.
            const insertData = {
                ID: Number(item.id),
                Nro_Factura: fields.Nro_Factura || null,
                Aprobacion_Doliente: fields.Aprobacion_Doliente || null,
                Gestion_Contabilidad: fields.Gestion_Contabilidad || null
            };
            const { error } = await supabase.from('Registro_Facturas').insert([insertData]);
            if (error) console.error(`Error insertando SP ID ${item.id} (Nro: ${fields.Nro_Factura}):`, error.message);
            else {
                console.log(`INSERTADO NUEVO: SP ID ${item.id} (Nro: ${fields.Nro_Factura})`);
                successCount++;
            }
        }
    }
    
    console.log(`\n¡Completado! Se sincronizaron correctamente ${successCount} facturas "Por Aprobar".`);
}

syncPorAprobar().catch(console.error);
