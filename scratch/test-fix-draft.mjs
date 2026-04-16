
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

    // Login
    console.log("1. Logging in to SAP...");
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
    console.log("   ✅ Login OK");

    // Find BP for known NIT
    const nit = '70878442-5';
    console.log(`2. Finding BP for NIT ${nit}...`);
    const bpRes = await sapRequest(`${baseUrl}/BusinessPartners?$filter=FederalTaxID eq '${nit}'&$select=CardCode`, { headers: authHeaders });
    const cardCode = bpRes.data.value[0].CardCode;
    console.log(`   ✅ Found: ${cardCode}`);

    // Look up item by account code
    const accountCode = '51054505';
    console.log(`3. Looking up item for account ${accountCode}...`);
    const itemRes = await sapRequest(`${baseUrl}/Items?$filter=ExpanseAccount eq '${accountCode}'&$select=ItemCode,PurchaseVATGroup&$top=1`, { headers: authHeaders });
    let itemCode = '', taxCode = 'IVADEX';
    if (itemRes.data.value && itemRes.data.value.length > 0) {
        itemCode = itemRes.data.value[0].ItemCode;
        taxCode = itemRes.data.value[0].PurchaseVATGroup || taxCode;
        console.log(`   ✅ Found: ItemCode=${itemCode}, TaxCode=${taxCode}`);
    } else {
        console.log(`   ⚠️  No item found for account ${accountCode}, using defaults`);
    }

    // Create Draft - WITHOUT CostingCode2
    console.log("4. Creating SAP Draft (WITHOUT CostingCode2)...");
    const draftBody = {
        DocObjectCode: "oPurchaseInvoices",
        DocType: "dDocument_Service",
        CardCode: cardCode,
        NumAtCard: "TEST-FIX-CC2",
        DocDate: new Date().toISOString().split('T')[0],
        Comments: "Prueba fix CostingCode2 removido",
        DocumentLines: [{
            ItemCode: itemCode || undefined,
            ItemDescription: "PRUEBA FIX TEST-FIX-CC2",
            AccountCode: accountCode,
            CostingCode: "GA-CEFI1",           // Solo Dimensión 1
            // NO CostingCode2
            UnitPrice: "1000",
            LineTotal: "1000",
            VatGroup: taxCode,
        }]
    };

    console.log("   Draft body:", JSON.stringify(draftBody, null, 2));

    const createRes = await sapRequest(`${baseUrl}/Drafts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify(draftBody),
    });

    if (createRes.status === 201 || createRes.status === 200) {
        console.log(`   ✅ Draft created! DocEntry: ${createRes.data.DocEntry}`);
    } else {
        console.log(`   ❌ Error: ${JSON.stringify(createRes.data)}`);
    }

    // Logout
    await sapRequest(`${baseUrl}/Logout`, { method: 'POST', headers: authHeaders });
    console.log("5. Done, session closed.");
}

main().catch(console.error);
