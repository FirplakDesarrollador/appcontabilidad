
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

    // Get VatGroups to see what tax codes exist
    console.log("=== SAP VAT Groups (Purchase) ===");
    const res1 = await sapRequest(`${baseUrl}/VatGroups?$filter=Category eq 'bovcInputTax'&$select=Code,Name,Category`, { headers: authHeaders });
    if (res1.status === 200) {
        console.log(JSON.stringify(res1.data.value, null, 2));
    } else {
        console.log("Error:", JSON.stringify(res1.data));
    }
    
    // Get ALL VatGroups
    console.log("\n=== ALL SAP VAT Groups ===");
    const res2 = await sapRequest(`${baseUrl}/VatGroups?$select=Code,Name,Category,Inactive`, { headers: authHeaders });
    if (res2.status === 200) {
        for (const vg of res2.data.value) {
            if (vg.Inactive === 'tNO') {
                console.log(`  ${vg.Code} - ${vg.Name} (${vg.Category})`);
            }
        }
    }

    // Check an existing successful draft to see what fields it used
    console.log("\n=== Last created draft (DocEntry 26277) ===");
    const res3 = await sapRequest(`${baseUrl}/Drafts(26277)?$select=DocEntry,CardCode,NumAtCard,DocType,DocumentLines`, { headers: authHeaders });
    if (res3.status === 200) {
        console.log(JSON.stringify(res3.data, null, 2));
    }
    
    // And DocEntry 26275 (the first successful one)
    console.log("\n=== Draft 26275 ===");
    const res4 = await sapRequest(`${baseUrl}/Drafts(26275)?$select=DocEntry,CardCode,NumAtCard,DocType,DocumentLines`, { headers: authHeaders });
    if (res4.status === 200) {
        console.log(JSON.stringify(res4.data, null, 2));
    }

    await sapRequest(`${baseUrl}/Logout`, { method: 'POST', headers: authHeaders });
    console.log("\nDone.");
}

main().catch(console.error);
