const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function testQuery() {
    const numericCodes = [72055110];
    const { data, error } = await supabase
        .from('Articulos')
        .select('ItemCode, Dscription, TaxCode, AcctCode')
        .in('AcctCode', numericCodes);
    console.log("Error:", error);
    console.log("Data:", data);
}

testQuery();
