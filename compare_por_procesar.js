const msal = require("@azure/msal-node");
const { Client } = require("@microsoft/microsoft-graph-client");
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const cca = new msal.ConfidentialClientApplication({
    auth: {
        clientId: process.env.AZURE_CLIENT_ID,
        authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
        clientSecret: process.env.AZURE_CLIENT_SECRET,
    }
});

async function run() {
    const token = (await cca.acquireTokenByClientCredential({ scopes: ["https://graph.microsoft.com/.default"] })).accessToken;
    const client = Client.init({ authProvider: (done) => { done(null, token); } });
    
    const siteResponse = await client.api('/sites/firplaksa.sharepoint.com:/sites/FPKContabilidad').get();
    const listsResponse = await client.api(`/sites/${siteResponse.id}/lists`).get();
    const list = listsResponse.value.find(l => l.name === 'Registro_de_Facturas');
    
    let items = [];
    let nextLink = `/sites/${siteResponse.id}/lists/${list.id}/items?$expand=fields($select=id,Aprobacion_Doliente,Gestion_Contabilidad,Procesado)`;
    while (nextLink) {
        const res = await client.api(nextLink).get();
        items = items.concat(res.value);
        nextLink = res['@odata.nextLink'];
    }
    
    const spPorProcesar = items.filter(item => {
        const f = item.fields;
        return f.Aprobacion_Doliente === 'Aprobado' && 
               f.Gestion_Contabilidad && f.Gestion_Contabilidad.toLowerCase().includes('por procesar');
    });
    
    console.log(`SharePoint Por Procesar (sin filtro): ${spPorProcesar.length}`);
    const spIds = new Set(spPorProcesar.map(i => parseInt(i.id)));
    
    // Get Supabase Por Procesar
    const { data: supaRows } = await supabase
        .from('Registro_Facturas')
        .select('ID, Proveedor, Nro_Factura, FechaProcesado')
        .eq('Aprobacion_Doliente', 'Aprobado')
        .ilike('Gestion_Contabilidad', '%por procesar%')
        .is('FechaProcesado', null);
    
    console.log(`Supabase Por Procesar (FechaProcesado null): ${supaRows.length}`);
    const supaIds = new Set(supaRows.map(r => r.ID));
    
    // In Supabase but not in SP
    const onlyInSupabase = supaRows.filter(r => !spIds.has(r.ID));
    console.log(`\nEn Supabase pero NO en SharePoint (${onlyInSupabase.length}):`);
    onlyInSupabase.forEach(r => console.log(' ', r.ID, r.Proveedor, r.Nro_Factura));
    
    // In SP but not in Supabase
    const onlyInSP = spPorProcesar.filter(i => !supaIds.has(parseInt(i.id)));
    console.log(`\nEn SharePoint pero NO en Supabase (${onlyInSP.length}):`);
    onlyInSP.forEach(i => console.log(' ', i.id, i.fields.Gestion_Contabilidad));
}
run().catch(console.error);
