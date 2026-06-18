const nits = [
    '1020747752', // MACANA DEL VECCHIO
    '890937509-8', // COBRE Y VIDRIO SAS
    '830002655-4', // INTERWORLD FREIGHT SAS
    '901170281-1', // GRUPO EMPRESARIAL MAXIASEO SAS
    '901807024-1', // POCO COMUN SAS
    '830114921-1', // COLOMBIA MOVIL S A E S P
    '901203138', // corbox s.a.s
    '830122566-1', // COLOMBIA TELECOMUNICACIONES S A ESP
    '890300279-4' // BANCO DE OCCIDENTE
];

const SERVICIOS_SUPABASE_URL = "https://lnphhmowklqiomownurw.supabase.co";
const SERVICIOS_SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxucGhobW93a2xxaW9tb3dudXJ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE2OTIwMzQwMjUsImV4cCI6MjAwNzYxMDAyNX0.FHCOWrVp-K-7qrM3CtYmYaqiOqwzsX_Au7pLm-MN3eQ";

async function getResponsables() {
    for (const nit of nits) {
        // Remove check digit for a base search, or try both
        const baseNit = nit.split('-')[0];
        const url = `${SERVICIOS_SUPABASE_URL}/rest/v1/Proveedores_con_Responsable?Nit=ilike.${baseNit}*&select=Nit,"Nombre de socio de negocios",Responsable,Autorizador,Correo`;
        
        try {
            const response = await fetch(url, {
                headers: {
                    "apikey": SERVICIOS_SUPABASE_KEY,
                    "Authorization": `Bearer ${SERVICIOS_SUPABASE_KEY}`
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data && data.length > 0) {
                    const row = data[0];
                    console.log(`NIT ${nit} (${row["Nombre de socio de negocios"]}): Responsable = ${row.Responsable || row.Autorizador || 'VACÍO'} (Correo: ${row.Correo || 'VACÍO'})`);
                } else {
                    console.log(`NIT ${nit}: NO ENCONTRADO en la tabla de proveedores con responsable`);
                }
            } else {
                console.log(`Error querying NIT ${nit}:`, response.statusText);
            }
        } catch (e) {
            console.error(`Exception querying NIT ${nit}:`, e.message);
        }
    }
}

getResponsables();
