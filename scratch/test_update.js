const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://zohdtksgxhbheaftgmsi.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvaGR0a3NneGhiaGVhZnRnbXNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjI5NjExNTEsImV4cCI6MjAzODUzNzE1MX0.Euu6FTh11mbh4lUmhKFMTFYZ9hWgZ-RzECcUYKGRYQE';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testUpdate() {
    console.log('Testing update on ID 1776463742339059...');
    const result = await supabase
        .from('Facturas pendientes')
        .update({ Nombre_Emisor: 'TEST UPDATE' })
        .eq('ID', 1776463742339059)
        .select();

    console.log('Update result:', JSON.stringify(result, null, 2));
}

testUpdate();
