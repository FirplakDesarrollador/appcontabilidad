const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://zohdtksgxhbheaftgmsi.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvaGR0a3NneGhiaGVhZnRnbXNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjI5NjExNTEsImV4cCI6MjAzODUzNzE1MX0.Euu6FTh11mbh4lUmhKFMTFYZ9hWgZ-RzECcUYKGRYQE';

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    const { data: facturas, error } = await supabase
        .from('Facturas pendientes')
        .select('*')
        .eq('NIT_Emisor', '830114921');

    if (error) {
        console.error(error);
        return;
    }
    console.log('Facturas con NIT 830114921:', JSON.stringify(facturas, null, 2));

    const { data: all, error: e2 } = await supabase
        .from('Facturas pendientes')
        .select('ID, NIT_Emisor, Nombre_Emisor, total') // check if 'total' is case sensitive
        .limit(10);
    
    console.log('All sample:', JSON.stringify(all, null, 2));
}

check();
