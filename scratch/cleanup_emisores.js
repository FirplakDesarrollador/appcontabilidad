const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://zohdtksgxhbheaftgmsi.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvaGR0a3NneGhiaGVhZnRnbXNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjI5NjExNTEsImV4cCI6MjAzODUzNzE1MX0.Euu6FTh11mbh4lUmhKFMTFYZ9hWgZ-RzECcUYKGRYQE';

const supabase = createClient(supabaseUrl, supabaseKey);

async function cleanup() {
    console.log('Iniciando recuperación de nombres de emisores...');

    // 1. Obtener facturas con Nombre_Emisor vacío
    const { data: pendientes, error: pError } = await supabase
        .from('Facturas pendientes')
        .select('ID, NIT_Emisor, Nombre_Emisor')
        .or('Nombre_Emisor.is.null, Nombre_Emisor.eq.""');

    if (pError) {
        console.error('Error al obtener facturas pendientes:', pError);
        return;
    }

    if (!pendientes || pendientes.length === 0) {
        console.log('No se encontraron facturas con nombre de emisor faltante.');
        return;
    }

    console.log(`Se encontraron ${pendientes.length} facturas para actualizar.`);

    // 2. Crear un mapa de NIT -> Nombre usando la tabla Registro_Facturas
    // Obtenemos los NITs únicos interesados para optimizar la consulta
    const nits = [...new Set(pendientes.map(p => p.NIT_Emisor).filter(Boolean))];
    
    if (nits.length === 0) {
        console.log('No hay NITs válidos para buscar.');
        return;
    }

    const { data: facturas, error: fError } = await supabase
        .from('Registro_Facturas')
        .select('Nit, Proveedor')
        .in('Nit', nits);

    if (fError) {
        console.error('Error al buscar en Registro_Facturas:', fError);
        return;
    }

    // Mapear NIT -> Proveedor (tomamos el primero que aparezca de cada uno)
    const nitMap = {};
    facturas.forEach(f => {
        if (f.Nit && f.Proveedor && !nitMap[f.Nit]) {
            nitMap[f.Nit] = f.Proveedor;
        }
    });

    console.log(`Se encontraron nombres para ${Object.keys(nitMap).length} de los ${nits.length} NITs buscados.`);

    // 3. Actualizar los registros
    let updatedCount = 0;
    for (const p of pendientes) {
        const nombreEncontrado = nitMap[p.NIT_Emisor];
        if (nombreEncontrado) {
            const { error: uError } = await supabase
                .from('Facturas pendientes')
                .update({ Nombre_Emisor: nombreEncontrado })
                .eq('ID', p.ID);

            if (uError) {
                console.error(`Error actualizando ID ${p.ID}:`, uError);
            } else {
                updatedCount++;
            }
        }
    }

    console.log(`Proceso completado. Se actualizaron ${updatedCount} registros.`);
}

cleanup();
