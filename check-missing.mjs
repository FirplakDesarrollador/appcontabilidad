import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

const envFile = readFileSync('.env', 'utf-8');
envFile.split('\n').forEach(line => {
    const [key, ...vals] = line.split('=');
    if (key && vals.length) process.env[key.trim()] = vals.join('=').trim();
});

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function checkMissing() {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    const { data, error } = await supabase
        .from('Registro_Facturas')
        .select('ID, Nro_Factura, Proveedor, Nit')
        .is('Proveedor', null);
        
    console.log(`Found ${data?.length || 0} invoices with missing Proveedor.`);
    console.log(data);
}
checkMissing().catch(console.error);
