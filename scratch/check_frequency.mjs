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
        '901216768-4', // ADELANTE SOLUCIONES FINANCIERAS SAS
        '8430782-5', // MUÑOZ LOPEZ GUSTAVO ALBERTO
        '94533640', // DEVIA VALENCIA MARCO ANTONIO
        '902014472-6', // GRUPO OCQ COLOMBIA SAS
        '900607748-1', // AMEN EMPORIO S.A.S.
        '830511324-5', // SERVIMPREX SAS
        '800242106-2', // SODIMAC COLOMBIA S A
        '900209956-01' // PEOPLE PASS SAS
    ];

    const { data, error } = await supabase
        .from('Registro_Facturas')
        .select('Proveedor, Responsable_de_Autorizar')
        .in('Nit', nits)
        .not('Responsable_de_Autorizar', 'is', null);

    if (error) {
        console.error('Error:', error);
    } else {
        const counts = {};
        
        data.forEach(d => {
            const p = d.Proveedor;
            const r = d.Responsable_de_Autorizar;
            if (!counts[p]) counts[p] = {};
            if (!counts[p][r]) counts[p][r] = 0;
            counts[p][r]++;
        });

        for (const prov in counts) {
            console.log(`\nProveedor: ${prov}`);
            const sortedResp = Object.entries(counts[prov]).sort((a, b) => b[1] - a[1]);
            sortedResp.forEach(([r, count]) => {
                console.log(`  - ${r}: ${count} facturas`);
            });
        }
    }
}

main();
