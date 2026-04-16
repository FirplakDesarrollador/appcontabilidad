
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load env vars manually
try {
    const envPath = join(process.cwd(), '.env');
    if (existsSync(envPath)) {
        const envFile = readFileSync(envPath, 'utf-8');
        envFile.split('\n').forEach(line => {
            let [key, ...vals] = line.split('=');
            if (key && vals.length) {
                let val = vals.join('=').trim();
                if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
                    val = val.substring(1, val.length - 1);
                }
                process.env[key.trim()] = val;
            }
        });
    }
} catch (e) {}

async function run() {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    
    const { data: cuentas } = await supabase.from('cuentas').select('Título').limit(5);
    console.log('VALID_ACCOUNTS:', JSON.stringify(cuentas));
    
    const { data: ccs } = await supabase.from('Centro_costos').select('codigo').limit(5);
    console.log('VALID_CCS:', JSON.stringify(ccs));
}
run();
