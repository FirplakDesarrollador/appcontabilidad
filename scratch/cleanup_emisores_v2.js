const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://zohdtksgxhbheaftgmsi.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvaGR0a3NneGhiaGVhZnRnbXNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjI5NjExNTEsImV4cCI6MjAzODUzNzE1MX0.Euu6FTh11mbh4lUmhKFMTFYZ9hWgZ-RzECcUYKGRYQE';

const supabase = createClient(supabaseUrl, supabaseKey);

function normalize(nit) {
    if (!nit) return '';
    return String(nit).replace(/[^0-9]/g, '').slice(0, 9); // Normalmente buscamos los primeros 9 dígitos (sin DV)
}

async function cleanup() {
    console.log('Iniciando recuperación de nombres de emisores (v2 con normalización)...');

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

    // 2. Obtener todos los proveedores conocidos de Registro_Facturas
    // Para simplificar, traemos los más recientes (que son los que probablemente tengan los nombres correctos)
    const { data: facturas, error: fError } = await supabase
        .from('Registro_Facturas')
        .select('Nit, Proveedor')
        .order('ID', { ascending: false });

    if (fError) {
        console.error('Error al buscar en Registro_Facturas:', fError);
        return;
    }

    // Crear un mapa normalizado: NIT_sin_DV -> Nombre
    const nitMap = {};
    facturas.forEach(f => {
        const normNit = normalize(f.Nit);
        if (normNit && f.Proveedor && !nitMap[normNit]) {
            nitMap[normNit] = f.Proveedor;
        }
    });

    console.log(`Mapa de proveedores creado con ${Object.keys(nitMap).length} registros únicos.`);

    // 3. Actualizar los registros
    let updatedCount = 0;
    for (const p of pendientes) {
        const normPendiente = normalize(p.NIT_Emisor);
        const nombreEncontrado = nitMap[normPendiente];
        
        if (nombreEncontrado) {
            console.log(`Actualizando ID ${p.ID}: NIT ${p.NIT_Emisor} -> ${nombreEncontrado}`);
            const { error: uError } = await supabase
                .from('Facturas pendientes')
                .update({ Nombre_Emisor: nombreEncontrado })
                .eq('ID', p.ID);

            if (uError) {
                console.error(`Error actualizando ID ${p.ID}:`, uError);
            } else {
                updatedCount++;
            }
        } else {
            console.log(`No se encontró nombre para NIT ${p.NIT_Emisor} (Normalizado: ${normPendiente})`);
        }
    }

    console.log(`Proceso completado. Se actualizaron ${updatedCount} registros.`);
}

cleanup();
