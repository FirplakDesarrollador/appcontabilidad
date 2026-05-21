import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load env vars
const envFile = readFileSync(join(__dirname, '..', '.env'), 'utf-8');
envFile.split('\n').forEach(line => {
    const [key, ...vals] = line.split('=');
    if (key && vals.length) process.env[key.trim()] = vals.join('=').trim();
});

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function test() {
    const testData = {
        ID: 999999,
        sharepoint_id: "999999",
        Nit: "123456",
        Proveedor: "TEST PROVEEDOR",
        Nro_Factura: "TEST-12345",
        Valor_total: 1000,
        Creado: new Date().toISOString(),
        updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
        .from('Registro_Facturas')
        .upsert(testData, { onConflict: 'ID' });

    if (error) {
        console.error("Upsert failed:", error);
    } else {
        console.log("Upsert success:", data);
    }
}

test();
