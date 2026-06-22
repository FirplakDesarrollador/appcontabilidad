const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://zohdtksgxhbheaftgmsi.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvaGR0a3NneGhiaGVhZnRnbXNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjI5NjExNTEsImV4cCI6MjAzODUzNzE1MX0.Euu6FTh11mbh4lUmhKFMTFYZ9hWgZ-RzECcUYKGRYQE';

const supabase = createClient(supabaseUrl, supabaseKey);

async function processAll() {
    const mappings = [
        { nit: '830114921', name: 'COLOMBIA MOVIL S A E S P' },
        { nit: '819000939', name: 'INTERASEO S.A.S. E.S.P.' },
        { nit: '830070527', name: 'REDEBAN S.A.' }
    ];

    for (const item of mappings) {
        console.log(`--- Procesando ${item.nit} (${item.name}) ---`);

        // 1. Asegurar en tabla 'proveedores'
        const { data: existing } = await supabase
            .from('proveedores')
            .select('id')
            .eq('numero_identificacion', item.nit)
            .single();

        if (!existing) {
            console.log(`  Creando en tabla proveedores...`);
            await supabase.from('proveedores').insert({
                razon_social: item.name,
                numero_identificacion: item.nit,
                aprobacion_automatica: false,
                valor_de_referencia: 0,
                porcentaje_desviacion: 0
            });
        } else {
            console.log(`  Ya existe en tabla proveedores.`);
        }

        // 2. Actualizar en tabla 'Facturas pendientes'
        console.log(`  Actualizando nombres en Facturas pendientes...`);
        const { error: updateError } = await supabase
            .from('Facturas pendientes')
            .update({ Nombre_Emisor: item.name })
            .eq('NIT_Emisor', item.nit)
            .or('Nombre_Emisor.is.null, Nombre_Emisor.eq.""');

        if (updateError) {
            console.error(`  Error al actualizar Facturas pendientes:`, updateError);
        } else {
            console.log(`  Actualización completada para ${item.nit}.`);
        }
    }
}

processAll();
