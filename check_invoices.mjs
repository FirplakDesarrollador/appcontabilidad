import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

try {
    const envFile = readFileSync(join(__dirname, '.env'), 'utf-8');
    envFile.split('\n').forEach(line => {
        const [key, ...vals] = line.split('=');
        if (key && vals.length) process.env[key.trim()] = vals.join('=').trim().replace(/['"]/g, '');
    });
} catch (e) {
    console.error('Error loading .env:', e.message);
}

const { createClient } = await import('@supabase/supabase-js');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function main() {
    const { data: allPending, error: err1 } = await supabase
        .from('Registro_Facturas')
        .select('*')
        .eq('Aprobacion_Doliente', 'Por Aprobar');

    if (err1) console.error('Error fetching pending:', err1);
    else console.log(`Total "Por Aprobar" en Supabase: ${allPending.length}`);

    const { data: specific, error: err2 } = await supabase
        .from('Registro_Facturas')
        .select('ID, Nro_Factura, Aprobacion_Doliente, sharepoint_id, Proveedor, Modificado')
        .in('Nro_Factura', ['POL15486887', 'POL15486891', 'POL15486888']);

    if (err2) console.error('Error fetching specific:', err2);
    else {
        console.log(`\nFacturas específicas en Supabase:`);
        specific.forEach(s => console.log(`- Factura: ${s.Nro_Factura} | Estado: ${s.Aprobacion_Doliente} | SP_ID: ${s.sharepoint_id} | Modificado: ${s.Modificado}`));
    }
}

main();
