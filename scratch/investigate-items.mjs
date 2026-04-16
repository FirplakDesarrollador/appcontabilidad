
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
    console.log("Logged in.\n");

    // 1. Check what ExpanseAccount looks like on any items
    console.log("=== Items with non-null ExpanseAccount (top 10) ===");
    const res1 = await sapRequest(`${baseUrl}/Items?$filter=ExpanseAccount ne null&$select=ItemCode,ItemName,ExpanseAccount,IncomeAccount,PurchaseVATGroup&$top=10`, { headers: authHeaders });
    if (res1.status === 200) {
        console.log(JSON.stringify(res1.data.value, null, 2));
    } else {
        console.log("Error:", JSON.stringify(res1.data));
    }

    // 2. Try SQL query to find items with account 51054505
    console.log("\n=== SQL: Items linked to account 51054505 ===");
    const sqlQuery = encodeURIComponent("SELECT T0.\"ItemCode\", T0.\"ItemName\", T0.\"ExpnsAcct\", T0.\"PrchsTax\" FROM OITM T0 WHERE T0.\"ExpnsAcct\" = '51054505'");
    const res2 = await sapRequest(`${baseUrl}/SQLQueries('test')/List?query=${sqlQuery}`, { headers: authHeaders });
    // SQLQueries might not work like this, but let's try another approach

    // 3. Direct OITM access - check what the ExpanseAccount field is actually called
    console.log("\n=== Check raw item with account fields ===");
    const res3 = await sapRequest(`${baseUrl}/Items?$select=ItemCode,ItemName,ExpanseAccount,IncomeAccount&$filter=ItemsGroupCode eq 121&$top=5`, { headers: authHeaders });
    if (res3.status === 200) {
        console.log(JSON.stringify(res3.data.value, null, 2));
    } else {
        console.log("Error:", JSON.stringify(res3.data));
    }

    // 4. Ask: what groups have items?
    console.log("\n=== Items in group 100 (first group from earlier) ===");
    const res4 = await sapRequest(`${baseUrl}/Items?$filter=ItemsGroupCode eq 100&$select=ItemCode,ItemName,ExpanseAccount&$top=5`, { headers: authHeaders });
    if (res4.status === 200) {
        console.log(JSON.stringify(res4.data.value, null, 2));
    }

    // 5. Check: are there service-type items?
    console.log("\n=== Service Items (ItemType = itService) ===");
    const res5 = await sapRequest(`${baseUrl}/Items?$filter=ItemType eq 'itService'&$select=ItemCode,ItemName,ExpanseAccount,PurchaseVATGroup&$top=10`, { headers: authHeaders });
    if (res5.status === 200) {
        console.log(JSON.stringify(res5.data.value, null, 2));
    } else {
        console.log("Error:", JSON.stringify(res5.data));
    }

    // 6. Try: ChartOfAccounts to find the account
    console.log("\n=== Chart of Accounts: 51054505 ===");
    const res6 = await sapRequest(`${baseUrl}/ChartOfAccounts('51054505')`, { headers: authHeaders });
    if (res6.status === 200) {
        console.log(JSON.stringify({ Code: res6.data.Code, Name: res6.data.Name, AcctCurrency: res6.data.AcctCurrency }, null, 2));
    } else {
        console.log("Not found or error:", res6.status);
    }

    // 7. Search all items - look for ones with ExpanseAccount containing '5105'
    console.log("\n=== Items with ExpanseAccount starting with 5105 ===");
    const res7 = await sapRequest(`${baseUrl}/Items?$filter=startswith(ExpanseAccount,'5105')&$select=ItemCode,ItemName,ExpanseAccount,PurchaseVATGroup&$top=10`, { headers: authHeaders });
    if (res7.status === 200) {
        console.log(JSON.stringify(res7.data.value, null, 2));
    } else {
        console.log("Error:", JSON.stringify(res7.data));
    }
    
    // 8. Search items with ExpanseAccount starting with '51'
    console.log("\n=== Items with ExpanseAccount starting with 51 ===");
    const res8 = await sapRequest(`${baseUrl}/Items?$filter=startswith(ExpanseAccount,'51')&$select=ItemCode,ItemName,ExpanseAccount,PurchaseVATGroup&$top=20`, { headers: authHeaders });
    if (res8.status === 200) {
        console.log(JSON.stringify(res8.data.value, null, 2));
    } else {
        console.log("Error:", JSON.stringify(res8.data));
    }

    await sapRequest(`${baseUrl}/Logout`, { method: 'POST', headers: authHeaders });
    console.log("\nDone.");
}

main().catch(console.error);
