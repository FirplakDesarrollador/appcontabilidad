import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

try {
    const envFile = readFileSync(join(__dirname, '../.env'), 'utf-8');
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
    const facturas = [
        'NCE101802',
        'FEGM13637',
        '8764',
        'NC228',
        'AM98',
        'FE11837',
        '9903151361901', // the E+12 one
        'FPP493293',
        'FPP493296',
        'MAS215914'
    ];

    const { data, error } = await supabase
        .from('Registro_Facturas')
        .update({ Aprobacion_Doliente: 'Aprobado' })
        .in('Nro_Factura', facturas)
        .select('Nit, Nro_Factura, Aprobacion_Doliente');

    if (error) {
        console.error('Error updating facturas:', error);
    } else {
        console.log('Facturas actualizadas a Aprobado:');
        data.forEach(s => console.log(`- Nit: ${s.Nit} | Factura: ${s.Nro_Factura} | Nuevo Estado: ${s.Aprobacion_Doliente}`));
    }
}

main();
