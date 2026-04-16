/**
 * Verify if the item ZZCC01-0045-000-0000 exists in SAP
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
    const loginRes = await sapRequest(SAP_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ CompanyDB: "Firplak_SA", Password: "2023Fir#.*", UserName: "manager" }),
    });
    const sessionId = loginRes.data.SessionId;
    const rawCookies = loginRes.headers['set-cookie'];
    const cookieStr = Array.isArray(rawCookies) ? rawCookies.join('; ') : (rawCookies || '');
    const authHeaders = { 'Cookie': `B1SESSION=${sessionId}; ${cookieStr}` };

    // Check exact item
    console.log("Buscando ZZCC01-0045-000-0000 en SAP Items...");
    const res1 = await sapRequest(`${SAP_BASE}/Items('ZZCC01-0045-000-0000')?$select=ItemCode,ItemName,ItemType`, { headers: authHeaders });
    console.log("Status:", res1.status);
    if (res1.status === 200) {
        console.log("✅ Encontrado:", res1.data.ItemCode, "-", res1.data.ItemName, "| Type:", res1.data.ItemType);
    } else {
        console.log("❌ No encontrado. Intentando con variaciones...");
        
        // Try searching by partial match
        const res2 = await sapRequest(`${SAP_BASE}/Items?$filter=startswith(ItemCode,'ZZCC01-0045')&$select=ItemCode,ItemName&$top=5`, { headers: authHeaders });
        if (res2.data.value && res2.data.value.length > 0) {
            console.log("Artículos similares:");
            res2.data.value.forEach(i => console.log(`  ${i.ItemCode} - ${i.ItemName}`));
        } else {
            console.log("Ningún artículo ZZCC01-0045* encontrado.");
            
            // Try any ZZCC01 items
            const res3 = await sapRequest(`${SAP_BASE}/Items?$filter=startswith(ItemCode,'ZZCC01')&$select=ItemCode,ItemName&$top=5`, { headers: authHeaders });
            if (res3.data.value && res3.data.value.length > 0) {
                console.log("\nArtículos ZZCC01* que SÍ existen:");
                res3.data.value.forEach(i => console.log(`  ${i.ItemCode} - ${i.ItemName}`));
            }
        }
    }

    await sapRequest(`${SAP_BASE}/Logout`, { method: 'POST', headers: authHeaders }).catch(() => {});
}
main().catch(console.error);
