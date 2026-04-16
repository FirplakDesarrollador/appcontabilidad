/**
 * Inspect PurchaseInvoices document lines schema
 */
import https from 'https';

const SAP_API_URL = "https://200.7.96.194:50000/b1s/v1/Login";
const SAP_BASE = SAP_API_URL.replace('/Login', '');
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
                let parsed;
                try { parsed = JSON.parse(data); } catch { parsed = data; }
                resolve({ status: res.statusCode, data: parsed, headers: res.headers });
            });
        });
        req.on('error', reject);
        if (options.body) req.write(options.body);
        req.end();
    });
}

async function main() {
    // Login
    const loginRes = await sapRequest(SAP_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ CompanyDB: "Firplak_SA", Password: "2023Fir#.*", UserName: "manager" }),
    });
    const sessionId = loginRes.data.SessionId;
    const rawCookies = loginRes.headers['set-cookie'];
    const cookieStr = Array.isArray(rawCookies) ? rawCookies.join('; ') : (rawCookies || '');
    const authHeaders = { 'Cookie': `B1SESSION=${sessionId}; ${cookieStr}` };

    // Get metadata for PurchaseInvoices lines
    console.log("Fetching a PurchaseInvoice to check line properties...");
    const res = await sapRequest(`${SAP_BASE}/PurchaseInvoices?$top=1`, { headers: authHeaders });
    
    if (res.data.value && res.data.value.length > 0) {
        const line = res.data.value[0].DocumentLines[0];
        console.log("Line keys:", Object.keys(line).sort());
        console.log("\nValues for Costing fields:");
        for (let key of Object.keys(line).sort()) {
            if (key.startsWith('Costing') || key.includes('Profit') || key.includes('Project')) {
                console.log(`  ${key}: ${line[key]}`);
            }
        }
    }

    await sapRequest(`${SAP_BASE}/Logout`, { method: 'POST', headers: authHeaders }).catch(() => {});
}
main().catch(console.error);
