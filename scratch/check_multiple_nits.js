const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://zohdtksgxhbheaftgmsi.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvaGR0a3NneGhiaGVhZnRnbXNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjI5NjExNTEsImV4cCI6MjAzODUzNzE1MX0.Euu6FTh11mbh4lUmhKFMTFYZ9hWgZ-RzECcUYKGRYQE';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkPendingProviders() {
    const nits = ['819000939', '830070527', '901378596', '830114921'];
    console.log(`Checking existence for NITs: ${nits.join(', ')}`);

    const { data, error } = await supabase
        .from('proveedores')
        .select('razon_social, numero_identificacion')
        .in('numero_identificacion', nits);

    if (error) {
        console.error('Error:', error);
        return;
    }

    console.log('Existing providers:', JSON.stringify(data, null, 2));
}

checkPendingProviders();
