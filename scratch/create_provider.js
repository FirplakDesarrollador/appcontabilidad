const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://zohdtksgxhbheaftgmsi.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvaGR0a3NneGhiaGVhZnRnbXNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjI5NjExNTEsImV4cCI6MjAzODUzNzE1MX0.Euu6FTh11mbh4lUmhKFMTFYZ9hWgZ-RzECcUYKGRYQE';

const supabase = createClient(supabaseUrl, supabaseKey);

async function createProvider() {
    const provider = {
        razon_social: 'COLOMBIA MOVIL S A E S P',
        numero_identificacion: '830114921',
        aprobacion_automatica: false,
        valor_de_referencia: 0,
        porcentaje_desviacion: 0
    };

    console.log(`Intentando crear el proveedor: ${provider.razon_social} (NIT: ${provider.numero_identificacion})...`);

    // 1. Verificar si ya existe
    const { data: existing, error: checkError } = await supabase
        .from('proveedores')
        .select('id')
        .eq('numero_identificacion', provider.numero_identificacion)
        .single();

    if (existing) {
        console.log('El proveedor ya existe en la tabla proveedores.');
        return;
    }

    // 2. Insertar
    const { data, error } = await supabase
        .from('proveedores')
        .insert(provider)
        .select();

    if (error) {
        console.error('Error al crear el proveedor:', error);
        return;
    }

    console.log('Proveedor creado con éxito:', JSON.stringify(data, null, 2));
}

createProvider();
