const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://zohdtksgxhbheaftgmsi.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvaGR0a3NneGhiaGVhZnRnbXNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjI5NjExNTEsImV4cCI6MjAzODUzNzE1MX0.Euu6FTh11mbh4lUmhKFMTFYZ9hWgZ-RzECcUYKGRYQE';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkProvider() {
    const nit = '830114921';
    console.log(`Checking if provider with NIT ${nit} exists in 'proveedores' table...`);

    const { data, error } = await supabase
        .from('proveedores')
        .select('*')
        .eq('numero_identificacion', nit);

    if (error) {
        console.error('Error:', error);
        return;
    }

    if (data && data.length > 0) {
        console.log('Provider exists:', JSON.stringify(data, null, 2));
    } else {
        console.log('Provider does NOT exist.');
    }
}

checkProvider();
