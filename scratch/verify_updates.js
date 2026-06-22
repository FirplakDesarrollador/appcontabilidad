const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://zohdtksgxhbheaftgmsi.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvaGR0a3NneGhiaGVhZnRnbXNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjI5NjExNTEsImV4cCI6MjAzODUzNzE1MX0.Euu6FTh11mbh4lUmhKFMTFYZ9hWgZ-RzECcUYKGRYQE';

const supabase = createClient(supabaseUrl, supabaseKey);

async function verify() {
    const { data, error } = await supabase
        .from('Facturas pendientes')
        .select('ID, NIT_Emisor, Nombre_Emisor')
        .not('Nombre_Emisor', 'is', null)
        .neq('Nombre_Emisor', '');

    if (error) {
        console.error(error);
        return;
    }
    console.log('Facturas pendientes con nombre (actualizadas):', JSON.stringify(data, null, 2));
}

verify();
