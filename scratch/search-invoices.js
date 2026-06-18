const invoices = [
    { nit: '1020747752', factura: 'FE5456' },
    { nit: '1020747752', factura: 'FE5455' },
    { nit: '890937509-8', factura: 'CVFE23465' },
    { nit: '830002655-4', factura: '1FE55333' },
    { nit: '901170281-1', factura: 'M9833' },
    { nit: '901807024-1', factura: 'FEP57' },
    { nit: '830114921-1', factura: 'FCPT13231184' },
    { nit: '830114921-1', factura: 'FCPT13231639' },
    { nit: '901203138', factura: 'FV2870' },
    { nit: '830122566-1', factura: '5,80831E+11' },
    { nit: '890300279-4', factura: '6152681' }
];

const SUPABASE_URL = "https://zohdtksgxhbheaftgmsi.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvaGR0a3NneGhiaGVhZnRnbXNpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTcyMjk2MTE1MSwiZXhwIjoyMDM4NTM3MTUxfQ.Y-OdRzGTe0llD1VRPYxyUIo1man7MCeABlMrZVuAqus";

async function search() {
    for (const inv of invoices) {
        let url = `${SUPABASE_URL}/rest/v1/Registro_Facturas?Nro_Factura=eq.${inv.factura}&select=ID,Nro_Factura,Proveedor,Aprobacion_Doliente,Gestion_Contabilidad,Responsable_de_Autorizar,sharepoint_id`;
        
        // Check by Nit if Nro_Factura fails
        if (inv.factura === '5,80831E+11' || inv.factura === '6152681') {
            url = `${SUPABASE_URL}/rest/v1/Registro_Facturas?Nit=eq.${inv.nit}&select=ID,Nro_Factura,Proveedor,Aprobacion_Doliente,Gestion_Contabilidad,Responsable_de_Autorizar,sharepoint_id`;
        }

        const response = await fetch(url, {
            headers: {
                "apikey": SUPABASE_KEY,
                "Authorization": `Bearer ${SUPABASE_KEY}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data && data.length > 0) {
                console.log(`FOUND ${inv.factura}:`, data);
            } else {
                console.log(`NOT FOUND in Supabase: ${inv.factura}`);
            }
        }
    }
}

search().catch(console.error);
