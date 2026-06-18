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
    const nits = [
        '901216768-4',
        '8430782-5',
        '94533640',
        '902014472-6',
        '900607748-1',
        '830511324-5',
        '800242106-2',
        '900209956-01'
    ];

    const { data, error } = await supabase
        .from('Registro_Facturas')
        .select('Nit, Proveedor, Nro_Factura, Responsable_de_Autorizar, centro_costos, tablaCostos')
        .in('Nit', nits);

    if (error) {
        console.error('Error:', error);
    } else {
        const porProveedor = {};
        data.forEach(d => {
            if (!porProveedor[d.Proveedor]) porProveedor[d.Proveedor] = { conResponsable: [], sinResponsable: [] };
            if (d.Responsable_de_Autorizar) {
                porProveedor[d.Proveedor].conResponsable.push(d.Responsable_de_Autorizar);
            } else {
                porProveedor[d.Proveedor].sinResponsable.push(d.Nro_Factura);
            }
        });

        for (const [prov, info] of Object.entries(porProveedor)) {
            const responsablesUnicos = [...new Set(info.conResponsable)];
            console.log(`\nProveedor: ${prov}`);
            console.log(`- Facturas CON responsable: ${info.conResponsable.length} (Responsables: ${responsablesUnicos.join(', ')})`);
            console.log(`- Facturas SIN responsable: ${info.sinResponsable.length}`);
        }
    }
}

main();
