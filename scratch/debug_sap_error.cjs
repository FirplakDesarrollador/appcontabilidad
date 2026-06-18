const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Manually parse .env because we are in a scratch script
const envPath = path.join(process.cwd(), '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0) {
        env[key.trim()] = valueParts.join('=').trim().replace(/^"(.*)"$/, '$1');
    }
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function debugInvoice() {
    const invoiceId = '49037';
    console.log('--- DEBUG INVOICE', invoiceId, '---');

    // 1. Check logs
    const { data: logs, error: logErr } = await supabase
        .from('Log_Errores_SAP')
        .select('*')
        .eq('factura_id', invoiceId)
        .order('id', { ascending: false })
        .limit(1);

    if (logErr) console.error('Error fetching logs:', logErr);
    if (logs && logs.length > 0) {
        console.log('Last Log Error:', logs[0].error_mensaje);
        console.log('Details:', JSON.stringify(logs[0].detalles, null, 2));
    }

    // 2. Fetch from SharePoint (Simulation of the mapping)
    // We can't easily fetch SharePoint without the full MSAL setup here, 
    // but we can check the accounts mentioned in the error details if they are there.
}

debugInvoice();
