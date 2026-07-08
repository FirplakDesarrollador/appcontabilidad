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

async function fixMissingFields() {
    // Obtener los IDs que están vacíos
    const { data: missingRecords } = await supabase
        .from('Registro_Facturas')
        .select('ID, Nro_Factura')
        .is('Proveedor', null);
        
    const missingIds = missingRecords.map(r => r.ID);
    console.log(`Buscando ${missingIds.length} facturas faltantes en SharePoint...`);

    // Conectar a SP
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

    // Procesar uno por uno
    let actualizados = 0;
    for (const record of missingRecords) {
        if (record.ID === 49076) continue; // Skip test
        
        console.log(`Obteniendo SP ID: ${record.ID} (Factura: ${record.Nro_Factura})...`);
        try {
            const spItem = await spClient.api(`/sites/${site.id}/lists/${list.id}/items/${record.ID}?expand=fields`).get();
            const fields = spItem.fields;
            
            // Normalize
            let nitValue = fields.Nit || fields.Nit_x0020_ || fields["Nit "] || fields.Title || null;
            if (nitValue) nitValue = String(nitValue).replace(/[.\s]/g, '').trim();
            const montoValue = fields.Valortotal ?? fields.Valor_x0020_total ?? fields["Valor total"] ?? fields.Monto ?? null;
            const tieneAnticipo = fields.tiene_anticipo === 't' || fields.tiene_anticipo === true || fields.tiene_anticipo === 'true' || fields.Tiene_x0020_anticipo === 't';
            
            let centroCostos = fields.centro_costos || fields.Centro_x0020_de_x0020_costos || fields.tablaCostos || null;
            
            const updateData = {
                Proveedor: fields.Proveedor || fields.tsic || fields.Nombre_proveedor || fields.Razon_social || "N/A",
                Nit: nitValue,
                Valor_total: montoValue !== null ? Number(montoValue) : null,
                Consecutivo: fields.Consecutivo ? String(fields.Consecutivo) : null,
                Observaciones: fields.Observaciones || null,
                Responsable_de_Autorizar: fields.Responsable_de_Autorizar || null,
                centro_costos: centroCostos,
                tiene_anticipo: tieneAnticipo,
                tablaCostos: fields.tablaCostos || null
            };

            const { error } = await supabase.from('Registro_Facturas').update(updateData).eq('ID', record.ID);
            
            if (error) {
                console.error(`  Error actualizando Supabase para ID ${record.ID}:`, error);
            } else {
                console.log(`  Actualizado exitosamente: ${updateData.Proveedor}`);
                actualizados++;
            }
        } catch (e) {
            console.error(`  Error al obtener SP ID ${record.ID}:`, e.message);
        }
    }
    
    console.log(`\n¡Listo! Se actualizaron ${actualizados} facturas con todos los campos faltantes.`);
}

fixMissingFields().catch(console.error);
