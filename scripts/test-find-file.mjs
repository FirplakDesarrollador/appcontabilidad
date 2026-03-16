import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const envFile = readFileSync(join(dirname(__dirname), '.env.local'), 'utf-8');
envFile.split('\n').forEach(line => {
    const [key, ...vals] = line.split('=');
    if (key && vals.length) process.env[key.trim()] = vals.join('=').trim();
});

const { createClient } = await import('@supabase/supabase-js');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function findFile() {
    const folder = 'FACTURA-UBL(890916155;INSB5113;2026-03-14;PRINCIPAL;PRINCIPAL)';
    const { data, error } = await supabase.storage.from('facturas-documentos').list(folder);
    
    if (error) {
        console.error('Error:', error.message);
        return;
    }
    
    console.log('Files in folder:', data.map(f => f.name));
}

findFile();
