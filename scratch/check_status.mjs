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
        '9,90315E+12',
        'FPP493293',
        'FPP493296',
        'MAS215914'
    ];

    const { data: specific, error: err2 } = await supabase
        .from('Registro_Facturas')
        .select('ID, Nit, Nro_Factura, Aprobacion_Doliente, sharepoint_id, Proveedor, Modificado')
        .in('Nro_Factura', facturas);

    if (err2) console.error('Error fetching specific:', err2);
    else {
        console.log(`\nFacturas encontradas por Nro_Factura:`);
        specific.forEach(s => console.log(`- Nit: ${s.Nit} | Factura: ${s.Nro_Factura} | Estado: ${s.Aprobacion_Doliente} | Proveedor: ${s.Proveedor}`));
    }
    
    // Check missing ones, perhaps by Nit
    const nits = ['901216768-4', '8430782-5', '94533640', '902014472-6', '900607748-1', '830511324-5', '800242106-2', '900209956-01'];
    const { data: nitsData, error: err3 } = await supabase
        .from('Registro_Facturas')
        .select('ID, Nit, Nro_Factura, Aprobacion_Doliente, Proveedor')
        .in('Nit', nits);

    if (err3) console.error('Error fetching nits:', err3);
    else {
        console.log(`\nFacturas de los Nits especificados:`);
        nitsData.forEach(s => {
            if (!facturas.includes(s.Nro_Factura)) {
                console.log(`(Otro) Nit: ${s.Nit} | Factura: ${s.Nro_Factura} | Estado: ${s.Aprobacion_Doliente} | Proveedor: ${s.Proveedor}`);
            }
        });
    }
}

main();
