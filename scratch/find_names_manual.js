const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://zohdtksgxhbheaftgmsi.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvaGR0a3NneGhiaGVhZnRnbXNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjI5NjExNTEsImV4cCI6MjAzODUzNzE1MX0.Euu6FTh11mbh4lUmhKFMTFYZ9hWgZ-RzECcUYKGRYQE';

const supabase = createClient(supabaseUrl, supabaseKey);

async function findNames() {
    const nits = ['819000939', '830070527'];
    for (const nit of nits) {
        console.log(`Searching for NIT ${nit} in 'Registro_Facturas'...`);
        const { data, error } = await supabase
            .from('Registro_Facturas')
            .select('Proveedor, Nit')
            .ilike('Nit', `%${nit}%`);
        
        if (error) {
            console.error(error);
            continue;
        }
        console.log(`Results for ${nit}:`, JSON.stringify(data, null, 2));
    }
}

findNames();
