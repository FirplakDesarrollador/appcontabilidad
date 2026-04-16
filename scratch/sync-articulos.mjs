
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import https from 'https';

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

const agent = new https.Agent({ rejectUnauthorized: false });

function sapRequest(url, options = {}) {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        const req = https.request({
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || 443,
            path: parsedUrl.pathname + parsedUrl.search,
            method: options.method || 'GET',
            headers: options.headers || {},
            agent,
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, data: JSON.parse(data), headers: res.headers }); }
                catch { resolve({ status: res.statusCode, data, headers: res.headers }); }
            });
        });
        req.on('error', reject);
        if (options.body) req.write(options.body);
        req.end();
    });
}

async function main() {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

    const loginUrl = process.env.SAP_API_URL || "https://200.7.96.194:50000/b1s/v1/Login";
    const baseUrl = loginUrl.replace('/Login', '');

    // 1. Login
    console.log("Logging in to SAP...");
    const loginRes = await sapRequest(loginUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            CompanyDB: process.env.SAP_COMPANY_DB,
            Password: process.env.SAP_PASSWORD,
            UserName: process.env.SAP_USERNAME,
        }),
    });

    if (loginRes.status !== 200) {
        console.error("Login failed:", loginRes.data);
        return;
    }

    const sessionId = loginRes.data.SessionId;
    const cookies = loginRes.headers['set-cookie'];
    const cookieStr = Array.isArray(cookies) ? cookies.join('; ') : (cookies || '');
    const authHeaders = { 'Cookie': `B1SESSION=${sessionId}; ${cookieStr}` };
    console.log("Login successful!");

    // 2. Fetch Items from SAP (service items that have account codes)
    let allItems = [];
    let skip = 0;
    const top = 100;

    console.log("Fetching items from SAP...");
    while (true) {
        const url = `${baseUrl}/Items?$select=ItemCode,ItemName,ExpanseAccount,PurchaseVATGroup&$top=${top}&$skip=${skip}`;
        const res = await sapRequest(url, { headers: authHeaders });

        if (res.status !== 200) {
            console.error("Error fetching items:", res.data);
            break;
        }

        const items = res.data.value || [];
        if (items.length === 0) break;

        allItems.push(...items);
        console.log(`Fetched ${allItems.length} items so far...`);
        skip += top;

        if (allItems.length > 10000) {
            console.log("Reached 10000 items limit, stopping.");
            break;
        }
    }

    console.log(`Total items fetched from SAP: ${allItems.length}`);

    // 3. Map to Articulos format
    const articulos = allItems
        .filter(item => item.ExpanseAccount) // Only items with an expense account
        .map(item => ({
            ItemCode: item.ItemCode || null,
            Dscription: item.ItemName || null,
            AcctCode: item.ExpanseAccount ? parseInt(item.ExpanseAccount) || null : null,
            TaxCode: item.PurchaseVATGroup || null,
        }));

    // Show sample
    console.log("\nSample mapped data:");
    console.log(JSON.stringify(articulos.slice(0, 5), null, 2));

    // 4. Upsert to Supabase in batches
    console.log(`\nInserting ${articulos.length} items into Supabase Articulos table...`);
    
    const batchSize = 500;
    for (let i = 0; i < articulos.length; i += batchSize) {
        const batch = articulos.slice(i, i + batchSize);
        const { error } = await supabase.from('Articulos').upsert(batch, { onConflict: 'ItemCode' });
        if (error) {
            console.error(`Error inserting batch ${i}:`, error.message);
            // Try insert instead
            const { error: insertError } = await supabase.from('Articulos').insert(batch);
            if (insertError) {
                console.error(`Insert also failed:`, insertError.message);
            }
        }
        console.log(`Inserted batch ${i + 1} to ${Math.min(i + batchSize, articulos.length)}`);
    }

    // 5. Logout
    await sapRequest(`${baseUrl}/Logout`, { method: 'POST', headers: authHeaders });
    console.log("\nDone! SAP session closed.");
}

main().catch(console.error);
