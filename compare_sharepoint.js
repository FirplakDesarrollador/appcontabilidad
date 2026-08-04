const { Client } = require('@microsoft/microsoft-graph-client');
const { ClientSecretCredential } = require('@azure/identity');
require('isomorphic-fetch');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function getSharePointItems() {
    const credential = new ClientSecretCredential(
        process.env.SHAREPOINT_TENANT_ID,
        process.env.SHAREPOINT_CLIENT_ID,
        process.env.SHAREPOINT_CLIENT_SECRET
    );

    const client = Client.initWithMiddleware({
        authProvider: {
            getAccessToken: async () => {
                const token = await credential.getToken("https://graph.microsoft.com/.default");
                return token.token;
            }
        }
    });

    const siteResponse = await client.api('/sites/firplaksa.sharepoint.com:/sites/FPKContabilidad').get();
    const siteId = siteResponse.id;
    const listsResponse = await client.api(`/sites/${siteId}/lists`).get();
    const list = listsResponse.value.find(l => l.name === 'Registro_de_Facturas' || l.displayName === 'Registro_de_Facturas');
    
    let items = [];
    let nextLink = `/sites/${siteId}/lists/${list.id}/items?$expand=fields`;

    while (nextLink) {
        const response = await client.api(nextLink).get();
        items = items.concat(response.value);
        nextLink = response['@odata.nextLink'];
    }
    
    return items.map(item => ({
        id: item.id,
        aprobacion: item.fields.Aprobacion_Doliente,
        gestion: item.fields.Gestion_Contabilidad,
        procesado: item.fields.Procesado
    }));
}

async function run() {
    console.log("Fetching Supabase...");
    const { data: supaData } = await supabase.from('Registro_Facturas')
        .select('ID, Nro_Factura, Proveedor, Aprobacion_Doliente, Gestion_Contabilidad, Procesado')
        .eq('Aprobacion_Doliente', 'Aprobado')
        .ilike('Gestion_Contabilidad', '%POR PROCESAR%')
        .or('Procesado.eq.false,Procesado.is.null');
        
    console.log(`Supabase has ${supaData.length} items`);
    
    console.log("Fetching SharePoint...");
    const spItems = await getSharePointItems();
    
    const spMatches = spItems.filter(i => 
        i.aprobacion === 'Aprobado' && 
        i.gestion && i.gestion.toLowerCase().includes('por procesar') && 
        (i.procesado === false || i.procesado == null)
    );
    console.log(`SharePoint has ${spMatches.length} items matching criteria`);
    
    const supaIds = supaData.map(d => String(d.ID));
    const spIds = spMatches.map(i => String(i.id));
    
    const inSupaNotSp = supaData.filter(d => !spIds.includes(String(d.ID)));
    console.log(`\nIn Supabase but not matching in SharePoint (${inSupaNotSp.length}):`);
    for (const item of inSupaNotSp) {
        const spItem = spItems.find(i => String(i.id) === String(item.ID));
        if (spItem) {
            console.log(`ID ${item.ID} (Factura: ${item.Nro_Factura}): SP has Aprobacion='${spItem.aprobacion}', Gestion='${spItem.gestion}', Procesado='${spItem.procesado}'`);
        } else {
            console.log(`ID ${item.ID} (Factura: ${item.Nro_Factura}): DELETED in SharePoint!`);
        }
    }
}
run();
