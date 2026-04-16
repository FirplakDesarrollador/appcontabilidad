
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
    console.log("Logged in to SAP.");

    // 1. Check Dimensions
    console.log("\n=== SAP Dimensions ===");
    const dimRes = await sapRequest(`${baseUrl}/Dimensions`, { headers: authHeaders });
    if (dimRes.status === 200) {
        console.log(JSON.stringify(dimRes.data.value, null, 2));
    }

    // 2. Check Cost Centers (OOCR - Distribution Rules)
    console.log("\n=== SAP Cost Centers (first 20) ===");
    const ccRes = await sapRequest(`${baseUrl}/DistributionRules?$top=20&$select=FactorCode,FactorDescription,InWhichDimension,Active`, { headers: authHeaders });
    if (ccRes.status === 200) {
        console.log(JSON.stringify(ccRes.data.value, null, 2));
    }

    // 3. Search for GA-FICOG specifically
    console.log("\n=== Search for GA-FICOG ===");
    const ficogRes = await sapRequest(`${baseUrl}/DistributionRules?$filter=startswith(FactorCode,'GA-FICOG')&$select=FactorCode,FactorDescription,InWhichDimension`, { headers: authHeaders });
    if (ficogRes.status === 200) {
        console.log(JSON.stringify(ficogRes.data.value, null, 2));
    }

    // 4. Search for GA-CEFI1
    console.log("\n=== Search for GA-CEFI1 ===");
    const cefi1Res = await sapRequest(`${baseUrl}/DistributionRules?$filter=startswith(FactorCode,'GA-CEFI')&$select=FactorCode,FactorDescription,InWhichDimension`, { headers: authHeaders });
    if (cefi1Res.status === 200) {
        console.log(JSON.stringify(cefi1Res.data.value, null, 2));
    }

    // 5. Search for all GA- prefixed cost centers
    console.log("\n=== All GA- cost centers ===");
    const gaRes = await sapRequest(`${baseUrl}/DistributionRules?$filter=startswith(FactorCode,'GA-')&$select=FactorCode,FactorDescription,InWhichDimension&$top=50`, { headers: authHeaders });
    if (gaRes.status === 200) {
        console.log(JSON.stringify(gaRes.data.value, null, 2));
    }

    await sapRequest(`${baseUrl}/Logout`, { method: 'POST', headers: authHeaders });
    console.log("\nDone.");
}

main().catch(console.error);
