const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://zohdtksgxhbheaftgmsi.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvaGR0a3NneGhiaGVhZnRnbXNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjI5NjExNTEsImV4cCI6MjAzODUzNzE1MX0.Euu6FTh11mbh4lUmhKFMTFYZ9hWgZ-RzECcUYKGRYQE';

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspect() {
    const { data, error } = await supabase
        .from('Registro_Facturas')
        .select('Nit, Proveedor')
        .limit(5);

    if (error) {
        console.error(error);
        return;
    }
    console.log('Sample Registro_Facturas:', JSON.stringify(data, null, 2));

    const { data: pData, error: pError } = await supabase
        .from('Facturas pendientes')
        .select('NIT_Emisor, Nombre_Emisor')
        .limit(5);

    if (pError) {
        console.error(pError);
        return;
    }
    console.log('Sample Facturas pendientes:', JSON.stringify(pData, null, 2));
}

inspect();
