const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://zohdtksgxhbheaftgmsi.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvaGR0a3NneGhiaGVhZnRnbXNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjI5NjExNTEsImV4cCI6MjAzODUzNzE1MX0.Euu6FTh11mbh4lUmhKFMTFYZ9hWgZ-RzECcUYKGRYQE';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkId() {
    const id = 1776463742339059;
    const { data, error } = await supabase
        .from('Facturas pendientes')
        .select('*')
        .eq('ID', id);

    if (error) {
        console.error(error);
        return;
    }
    console.log(`Row with ID ${id}:`, JSON.stringify(data, null, 2));
}

checkId();
