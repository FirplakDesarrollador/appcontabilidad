/**
 * Fetch last 5 invoices to see which fields are populated in lines
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
    const authHeaders = { 'Cookie': `B1SESSION=${loginRes.data.SessionId}` };

    console.log("Checking last 5 invoices...");
    const res = await sapRequest(`${SAP_BASE}/PurchaseInvoices?$top=5&$orderby=DocEntry desc`, { headers: authHeaders });
    
    if (res.data.value) {
        for (let inv of res.data.value) {
            console.log(`\nInvoice DocNum: ${inv.DocNum}`);
            const line = inv.DocumentLines[0];
            for (let key of Object.keys(line)) {
                if (line[key] && (key.includes('Costing') || key.includes('Profit') || key.includes('Project') || key.startsWith('U_'))) {
                    console.log(`  ${key}: ${line[key]}`);
                }
            }
        }
    }

    await sapRequest(`${SAP_BASE}/Logout`, { method: 'POST', headers: authHeaders }).catch(() => {});
}
main().catch(console.error);
