import { sapRequestWithRetry } from "./src/lib/sap";
import https from 'https';

const insecureAgent = new https.Agent({ rejectUnauthorized: false });

async function sapRequest(url: string, options: any) {
    const parsedUrl = new URL(url);
    const reqOptions = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || 443,
        path: parsedUrl.pathname + parsedUrl.search,
        method: options.method || 'GET',
        headers: options.headers || {},
        agent: insecureAgent,
    };
    return new Promise((resolve, reject) => {
        const req = https.request(reqOptions, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
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
    const loginUrl = "https://200.7.96.194:50000/b1s/v1/Login";
    const loginRes: any = await sapRequest(loginUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            CompanyDB: process.env.SAP_COMPANY_DB?.trim() || "Firplak_SA",
            Password: process.env.SAP_PASSWORD?.trim() || "2023Fir#.*",
            UserName: process.env.SAP_USERNAME?.trim() || "manager",
            Language: 23
        }),
    });
    console.log("Login:", loginRes.status);
    const sessionId = loginRes.data.SessionId;
    const rawCookies = loginRes.headers['set-cookie'];
    const cookieStr = Array.isArray(rawCookies) ? rawCookies.join('; ') : (rawCookies || '');
    const authHeaders = { 'Cookie': `B1SESSION=${sessionId}; ${cookieStr}` };

    const nitFilter = `FederalTaxID eq '444444496' or substringof('UNITED', CardName)`;
    const bpUrl = `https://200.7.96.194:50000/b1s/v1/BusinessPartners?$filter=${nitFilter}&$select=CardCode,CardName,FederalTaxID,CardType`;
    const bpRes: any = await sapRequest(bpUrl, { headers: authHeaders });
    console.log("BP:", bpRes.data.value);
}

main();
