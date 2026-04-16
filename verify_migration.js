const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

function loadEnv() {
    const envPath = path.join(__dirname, '.env');
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        envContent.split('\n').forEach(line => {
            const match = line.match(/^([^=]+)=(.*)$/);
            if (match) {
                const key = match[1].trim();
                let value = match[2].trim();
                if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
                    value = value.substring(1, value.length - 1);
                }
                process.env[key] = value;
            }
        });
    }
}

loadEnv();

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function listAll() {
    const bucket = 'facturas-documentos';
    console.log(`Listing root content of bucket: ${bucket}...`);
    try {
        const { data, error } = await supabase.storage.from(bucket).list('', { limit: 100 });
        if (error) throw error;
        
        console.log('\n--- ROOT CONTENT ---');
        for (const item of data) {
            console.log(`- [${item.id === null ? 'FOLDER' : 'FILE'}] ${item.name}`);
            if (item.id === null) {
                const { data: subData } = await supabase.storage.from(bucket).list(item.name);
                subData.forEach(sub => console.log(`    - [FILE] ${sub.name}`));
            }
        }
    } catch (err) {
        console.error('List error:', err.message);
    }
}

listAll();
