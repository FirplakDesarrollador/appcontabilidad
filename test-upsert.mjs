import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

const envFile = readFileSync('.env', 'utf-8');
envFile.split('\n').forEach(line => {
    const [key, ...vals] = line.split('=');
    if (key && vals.length) process.env[key.trim()] = vals.join('=').trim();
});
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function testUpsert() {
    // 1. Fetch an item that is currently 'Por Procesar' in Supabase
    const { data: item } = await supabase.from('Registro_Facturas').select('*').eq('Gestion_Contabilidad', 'Por Procesar').limit(1);
    console.log('Original item:', item[0].ID, item[0].Gestion_Contabilidad);
    
    // 2. Upsert it with null for Gestion_Contabilidad
    const payload = { ...item[0], Gestion_Contabilidad: null };
    const { data: updated, error } = await supabase.from('Registro_Facturas').upsert(payload, { onConflict: 'ID' }).select();
    
    console.log('Upserted item (error?):', error, updated[0].Gestion_Contabilidad);
}
testUpsert().catch(console.error);
