const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://zohdtksgxhbheaftgmsi.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvaGR0a3NneGhiaGVhZnRnbXNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjI5NjExNTEsImV4cCI6MjAzODUzNzE1MX0.Euu6FTh11mbh4lUmhKFMTFYZ9hWgZ-RzECcUYKGRYQE';

const supabase = createClient(supabaseUrl, supabaseKey);

async function repairOne() {
    const id = 1776463742339059;
    console.log(`Intentando reparar ID ${id} mediante re-inserción...`);

    // 1. Obtener datos actuales
    const { data: row, error: fError } = await supabase
        .from('Facturas pendientes')
        .select('*')
        .eq('ID', id)
        .single();

    if (fError || !row) {
        console.error('Error al obtener la fila:', fError);
        return;
    }

    // 2. Definir el nuevo nombre (sabemos que para 830114921 es COLOMBIA MOVIL S A E S P)
    const newRow = { ...row, Nombre_Emisor: 'COLOMBIA MOVIL S A E S P' };

    // 3. Eliminar la fila
    const { error: dError } = await supabase
        .from('Facturas pendientes')
        .delete()
        .eq('ID', id);

    if (dError) {
        console.error('Error al eliminar:', dError);
        return;
    }
    console.log('Fila eliminada con éxito.');

    // 4. Insertar de nuevo
    const { error: iError } = await supabase
        .from('Facturas pendientes')
        .insert(newRow);

    if (iError) {
        console.error('Error al re-insertar:', iError);
        // Intentar recuperar (opcional, pero peligroso si falló el insert por otra razón)
    } else {
        console.log('Fila re-insertada con éxito y nombre actualizado.');
    }
}

repairOne();
