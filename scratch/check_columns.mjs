import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

try {
    const envFile = readFileSync(join(__dirname, '../.env'), 'utf-8');
    envFile.split('\n').forEach(line => {
        const [key, ...vals] = line.split('=');
        if (key && vals.length) process.env[key.trim()] = vals.join('=').trim().replace(/['"\r]/g, '');
    });
} catch (e) {
    console.error('Error loading .env:', e.message);
}

const { createClient } = await import('@supabase/supabase-js');
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function run() {
    const { data, error } = await supabase
        .from('Registro_Facturas')
        .select('*')
        .limit(1);
    
    if (error) {
        console.error("Supabase Error:", error);
    } else {
        console.log("Supabase Columns:");
        console.log(Object.keys(data[0] || {}));
    }
}

run();
