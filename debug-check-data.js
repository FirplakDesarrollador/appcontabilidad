const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function checkData() {
    const { data, count, error } = await supabase
        .from('Registro_Facturas')
        .select('*', { count: 'exact', head: true });

    if (error) {
        console.error('Error:', error);
        return;
    }
    console.log('Total records in Supabase:', count);

    const { count: rejectedCount, error: err2 } = await supabase
        .from('Registro_Facturas')
        .select('*', { count: 'exact', head: true })
        .or('Aprobacion_Doliente.eq.Rechazado,Gestion_Contabilidad.eq.Rechazado');

    if (err2) {
        console.error('Error counting rejected:', err2);
        return;
    }
    console.log('Count of items with "Rechazado" in either status column:', rejectedCount);
}

checkData();
