const SUPABASE_URL = "https://zohdtksgxhbheaftgmsi.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvaGR0a3NneGhiaGVhZnRnbXNpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTcyMjk2MTE1MSwiZXhwIjoyMDM4NTM3MTUxfQ.Y-OdRzGTe0llD1VRPYxyUIo1man7MCeABlMrZVuAqus";

async function countUnassigned() {
    // Count how many are pending and have no responsible
    const url = `${SUPABASE_URL}/rest/v1/Registro_Facturas?Aprobacion_Doliente=eq.Por%20Aprobar&Responsable_de_Autorizar=is.null&select=Nro_Factura`;
    try {
        const response = await fetch(url, {
            headers: {
                "apikey": SUPABASE_KEY,
                "Authorization": `Bearer ${SUPABASE_KEY}`
            }
        });
        if (response.ok) {
            const data = await response.json();
            console.log(`Total pendientes sin responsable: ${data.length}`);
            // Just print the first 20 to get an idea
            data.slice(0, 20).forEach(d => console.log(d.Nro_Factura));
        } else {
            console.log("Error:", response.statusText);
        }
    } catch (e) {
        console.error(e.message);
    }
}
countUnassigned();
