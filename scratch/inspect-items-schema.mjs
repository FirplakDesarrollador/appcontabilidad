
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

    // Get just 1 item to see all available fields
    const url = `${baseUrl}/Items?$top=1`;
    const res = await sapRequest(url, { headers: authHeaders });
    
    if (res.status === 200 && res.data.value && res.data.value.length > 0) {
        const item = res.data.value[0];
        console.log("Available fields on Items entity:");
        console.log(Object.keys(item).join('\n'));
        console.log("\n--- Sample item ---");
        // Just print key fields
        const relevant = {};
        for (const key of Object.keys(item)) {
            if (key.toLowerCase().includes('code') || 
                key.toLowerCase().includes('acct') || 
                key.toLowerCase().includes('account') ||
                key.toLowerCase().includes('tax') ||
                key.toLowerCase().includes('vat') ||
                key.toLowerCase().includes('name') ||
                key.toLowerCase().includes('desc')) {
                relevant[key] = item[key];
            }
        }
        console.log(JSON.stringify(relevant, null, 2));
    } else {
        console.error("Error:", res.data);
    }

    await sapRequest(`${baseUrl}/Logout`, { method: 'POST', headers: authHeaders });
}

main().catch(console.error);
