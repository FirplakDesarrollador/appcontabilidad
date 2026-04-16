
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// Load env
try {
    const envPath = join(process.cwd(), '.env');
    if (existsSync(envPath)) {
        readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
            let [key, ...vals] = line.split('=');
            if (key && vals.length) {
                let val = vals.join('=').trim();
                if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
                    val = val.substring(1, val.length - 1);
                process.env[key.trim()] = val;
            }
        });
    }
} catch (e) {}

async function main() {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

    // Check sample data from Articulos
    const { data, error } = await supabase
        .from('Articulos')
        .select('*')
        .limit(10);

    if (error) {
        console.error('Error:', error);
        return;
    }

    console.log('Sample Articulos data:');
    console.log(JSON.stringify(data, null, 2));
    
    // Also check total count
    const { count } = await supabase.from('Articulos').select('*', { count: 'exact', head: true });
    console.log(`\nTotal rows: ${count}`);

    // Check a specific account code that we know exists
    const { data: byAccount } = await supabase
        .from('Articulos')
        .select('*')
        .eq('AcctCode', 51100505)
        .limit(3);
    console.log(`\nArticulos with AcctCode 51100505:`, JSON.stringify(byAccount, null, 2));

    const { data: byAccount2 } = await supabase
        .from('Articulos')
        .select('*')
        .eq('AcctCode', 51054505)
        .limit(3);
    console.log(`\nArticulos with AcctCode 51054505:`, JSON.stringify(byAccount2, null, 2));
}

main();
