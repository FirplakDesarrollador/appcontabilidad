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

async function syncSpecific() {
    const targetInvoices = ['180,000', 'BOPU136707725', 'FCII1260491'];
    
    console.log('1. Buscando en SharePoint...');
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
    
    const itemsToUpdate = spItems.filter(item => {
        const nro = (item.fields && item.fields.Nro_Factura || '').trim();
        return targetInvoices.includes(nro);
    });
    
    console.log(`Encontradas ${itemsToUpdate.length} facturas en SharePoint.`);
    
    for (const item of itemsToUpdate) {
        const fields = item.fields;
        console.log(`Actualizando ${fields.Nro_Factura} -> Gestion_Contabilidad: ${fields.Gestion_Contabilidad}`);
        
        const updateData = {
            Gestion_Contabilidad: fields.Gestion_Contabilidad || null,
            Aprobacion_Doliente: fields.Aprobacion_Doliente || null
        };
        
        const { error } = await supabase.from('Registro_Facturas').update(updateData).eq('ID', Number(item.id));
        if (error) {
            console.error(`Error actualizando ${fields.Nro_Factura}:`, error.message);
        } else {
            console.log(`Exito: ${fields.Nro_Factura} sincronizada en Supabase.`);
        }
    }
    
    // Check if any target invoices were NOT found in SharePoint at all
    const foundInSp = itemsToUpdate.map(item => (item.fields.Nro_Factura || '').trim());
    const notFoundInSp = targetInvoices.filter(nro => !foundInSp.includes(nro));
    
    if (notFoundInSp.length > 0) {
        console.log(`\nADVERTENCIA: Las siguientes facturas NO se encontraron en SharePoint: ${notFoundInSp.join(', ')}`);
        console.log(`Borrando estas facturas de Supabase para que quede igual que SharePoint...`);
        for (const nro of notFoundInSp) {
            const { error } = await supabase.from('Registro_Facturas').delete().eq('Nro_Factura', nro);
            if (error) {
                console.error(`Error borrando ${nro}:`, error.message);
            } else {
                console.log(`Exito: ${nro} borrada de Supabase.`);
            }
        }
    }
    
    console.log('\nSincronización de diferencias completada.');
}

syncSpecific().catch(console.error);
