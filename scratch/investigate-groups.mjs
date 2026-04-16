
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import https from 'https';

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
    const loginUrl = process.env.SAP_API_URL;
    const baseUrl = loginUrl.replace('/Login', '');

    const loginRes = await sapRequest(loginUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            CompanyDB: process.env.SAP_COMPANY_DB,
            Password: process.env.SAP_PASSWORD,
            UserName: process.env.SAP_USERNAME,
        }),
    });
    const sessionId = loginRes.data.SessionId;
    const cookies = loginRes.headers['set-cookie'];
    const cookieStr = Array.isArray(cookies) ? cookies.join('; ') : (cookies || '');
    const authHeaders = { 'Cookie': `B1SESSION=${sessionId}; ${cookieStr}` };

    // 1. Get ALL Item Groups with their default accounts
    console.log("=== Item Groups ===");
    const res1 = await sapRequest(`${baseUrl}/ItemGroups?$top=200`, { headers: authHeaders });
    if (res1.status === 200) {
        const groups = res1.data.value;
        console.log(`Found ${groups.length} groups.\n`);
        
        // Show groups that have PurchaseAccount or ExpensAccount set
        for (const g of groups) {
            const hasAccount = g.PurchaseAccount || g.ExpensAccount || g.RevenuesAccount;
            if (hasAccount) {
                console.log(`Group ${g.Number}: ${g.GroupName}`);
                console.log(`  PurchaseAccount: ${g.PurchaseAccount || 'null'}`);
                console.log(`  ExpensAccount: ${g.ExpensAccount || 'null'}`);
                console.log(`  RevenuesAccount: ${g.RevenuesAccount || 'null'}`);
                console.log('');
            }
        }
        
        // Check if any group has account 51054505
        const matching = groups.filter(g => 
            g.PurchaseAccount === '51054505' || 
            g.ExpensAccount === '51054505' || 
            g.RevenuesAccount === '51054505'
        );
        console.log(`\nGroups matching account 51054505:`, matching.map(g => `${g.Number}: ${g.GroupName}`));

        // Check for 51100505
        const matching2 = groups.filter(g => 
            g.PurchaseAccount === '51100505' || 
            g.ExpensAccount === '51100505' || 
            g.RevenuesAccount === '51100505'
        );
        console.log(`Groups matching account 51100505:`, matching2.map(g => `${g.Number}: ${g.GroupName}`));
    }

    // 2. Now check: what does the Supabase "cuentas" catalog look like?
    // Actually let's check: is there a direct item that has account in its ItemCode?
    console.log("\n=== Items containing '51054505' in ItemCode ===");
    const res2 = await sapRequest(`${baseUrl}/Items?$filter=startswith(ItemCode,'51054505')&$select=ItemCode,ItemName,ItemsGroupCode,PurchaseVATGroup&$top=5`, { headers: authHeaders });
    if (res2.status === 200) {
        console.log(JSON.stringify(res2.data.value, null, 2));
    }

    console.log("\n=== Items containing '51100505' in ItemCode ===");
    const res3 = await sapRequest(`${baseUrl}/Items?$filter=startswith(ItemCode,'51100505')&$select=ItemCode,ItemName,ItemsGroupCode,PurchaseVATGroup&$top=5`, { headers: authHeaders });
    if (res3.status === 200) {
        console.log(JSON.stringify(res3.data.value, null, 2));
    }

    // 3. Show a few item groups with ALL their account fields
    console.log("\n=== First Item Group full schema ===");
    const res4 = await sapRequest(`${baseUrl}/ItemGroups(100)`, { headers: authHeaders });
    if (res4.status === 200) {
        const g = res4.data;
        const keys = Object.keys(g).filter(k => k.toLowerCase().includes('account') || k.toLowerCase().includes('acct') || k.toLowerCase().includes('tax') || k.toLowerCase().includes('vat'));
        const relevant = {};
        keys.forEach(k => relevant[k] = g[k]);
        relevant['Number'] = g.Number;
        relevant['GroupName'] = g.GroupName;
        console.log(JSON.stringify(relevant, null, 2));
    }

    await sapRequest(`${baseUrl}/Logout`, { method: 'POST', headers: authHeaders });
    console.log("\nDone.");
}

main().catch(console.error);
