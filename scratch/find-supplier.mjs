/**
 * Quick script to find a valid supplier NIT in SAP
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

    // Get 3 suppliers
    const bpRes = await sapRequest(`${SAP_BASE}/BusinessPartners?$filter=CardType eq 'S'&$select=CardCode,CardName,FederalTaxID&$top=3`, { headers: authHeaders });
    console.log("Proveedores encontrados:");
    for (const bp of bpRes.data.value) {
        console.log(`  ${bp.CardCode} | NIT: ${bp.FederalTaxID} | ${bp.CardName}`);
    }

    // Logout
    await sapRequest(`${SAP_BASE}/Logout`, { method: 'POST', headers: authHeaders }).catch(() => {});
}
main().catch(console.error);
