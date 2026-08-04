const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
async function run() {
    const { data } = await supabase.from('Registro_Facturas')
        .select('ID, Nro_Factura, Proveedor, Aprobacion_Doliente, Gestion_Contabilidad, Procesado, Creado')
        .eq('Aprobacion_Doliente', 'Aprobado')
        .ilike('Gestion_Contabilidad', '%POR PROCESAR%')
        .or('Procesado.eq.false,Procesado.is.null')
        .order('ID', { ascending: false });
    
    console.log(`Total en Supabase que cumplen: ${data ? data.length : 0}`);
    if (data) {
        console.log(data.map(d => `${d.ID} | ${d.Proveedor?.substring(0,30)} | Factura: ${d.Nro_Factura}`).join('\n'));
    }
}
run();
