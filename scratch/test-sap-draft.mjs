/**
 * Test script: Creates a SAP Draft using the Supabase Articulos table lookup
 * This simulates what happens when a user approves an invoice with account 51101005
 */
import https from 'https';
import { createClient } from '@supabase/supabase-js';

// --- Config from .env ---
const SAP_API_URL = "https://200.7.96.194:50000/b1s/v1/Login";
const SAP_BASE = SAP_API_URL.replace('/Login', '');
const SAP_COMPANY_DB = "Firplak_SA";
const SAP_USERNAME = "manager";
const SAP_PASSWORD = "2023Fir#.*";

const SUPABASE_URL = "https://zohdtksgxhbheaftgmsi.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvaGR0a3NneGhiaGVhZnRnbXNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjI5NjExNTEsImV4cCI6MjAzODUzNzE1MX0.Euu6FTh11mbh4lUmhKFMTFYZ9hWgZ-RzECcUYKGRYQE";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// --- Test data ---
const TEST_NIT = "22449174";  // DE LA ROSA MEDINA TATIANA PATRICIA (real supplier in SAP)
const TEST_ACCOUNT_CODE = "51101005"; // REVISORIA FISCAL
const TEST_COST_CENTER = "GA-FICOG";
const TEST_VALOR = "100000";
const TEST_NRO_FACTURA = "TEST-PRUEBA-001";

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
    console.log("=== TEST: SAP Draft con Artículo desde Supabase ===\n");

    // 1. LOOKUP ARTICULO EN SUPABASE
    console.log(`1. Buscando artículo para AcctCode=${TEST_ACCOUNT_CODE} en Supabase...`);
    const { data: articuloRows, error: artErr } = await supabase
        .from('Articulos')
        .select('ItemCode, Dscription, TaxCode')
        .eq('AcctCode', parseInt(TEST_ACCOUNT_CODE, 10))
        .limit(1);

    if (artErr || !articuloRows || articuloRows.length === 0) {
        console.error("❌ No se encontró artículo en Supabase:", artErr?.message || "sin resultados");
        process.exit(1);
    }

    const articulo = articuloRows[0];
    console.log(`   ✅ ItemCode: ${articulo.ItemCode}`);
    console.log(`   ✅ Dscription: ${articulo.Dscription}`);
    console.log(`   ✅ TaxCode: ${articulo.TaxCode}`);

    // 2. LOGIN SAP
    console.log("\n2. Login a SAP...");
    const loginRes = await sapRequest(SAP_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ CompanyDB: SAP_COMPANY_DB, Password: SAP_PASSWORD, UserName: SAP_USERNAME }),
    });

    if (loginRes.status !== 200) {
        console.error("❌ Login fallido:", loginRes.data);
        process.exit(1);
    }
    const sessionId = loginRes.data.SessionId;
    const rawCookies = loginRes.headers['set-cookie'];
    const cookieStr = Array.isArray(rawCookies) ? rawCookies.join('; ') : (rawCookies || '');
    const authHeaders = { 'Cookie': `B1SESSION=${sessionId}; ${cookieStr}` };
    console.log(`   ✅ Session: ${sessionId}`);

    try {
        // 3. BUSCAR BUSINESS PARTNER
        console.log(`\n3. Buscando proveedor con NIT=${TEST_NIT}...`);
        const bpRes = await sapRequest(`${SAP_BASE}/BusinessPartners?$filter=FederalTaxID eq '${TEST_NIT}'&$select=CardCode,CardName`, { headers: authHeaders });
        
        if (bpRes.status !== 200 || !bpRes.data.value || bpRes.data.value.length === 0) {
            console.error("❌ Proveedor no encontrado:", bpRes.data);
            process.exit(1);
        }
        const bp = bpRes.data.value[0];
        console.log(`   ✅ CardCode: ${bp.CardCode} - ${bp.CardName}`);

        // 4. CREAR DRAFT
        console.log("\n4. Creando Draft en SAP...");
        
        const draftBody = {
            DocObjectCode: "oPurchaseInvoices",
            DocType: "dDocument_Items",
            CardCode: bp.CardCode,
            NumAtCard: TEST_NRO_FACTURA,
            DocDate: new Date().toISOString().split('T')[0],
            Comments: `PRUEBA - Verificación artículo desde Supabase Articulos`,
            DocumentLines: [{
                ItemCode: articulo.ItemCode,                // ← DESDE SUPABASE
                ItemDescription: articulo.Dscription,       // ← DESDE SUPABASE
                AccountCode: TEST_ACCOUNT_CODE,
                CostingCode: TEST_COST_CENTER,
                UnitPrice: TEST_VALOR,
                LineTotal: TEST_VALOR,
                VatGroup: articulo.TaxCode,                 // ← DESDE SUPABASE
            }]
        };

        console.log("\n   Payload DocumentLines:");
        console.log(JSON.stringify(draftBody.DocumentLines, null, 2));

        const createRes = await sapRequest(`${SAP_BASE}/Drafts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders },
            body: JSON.stringify(draftBody),
        });

        if (createRes.status === 201 || createRes.status === 200) {
            console.log(`\n   ✅ DRAFT CREADO EXITOSAMENTE!`);
            console.log(`   DocEntry: ${createRes.data.DocEntry}`);
            console.log(`   DocNum: ${createRes.data.DocNum}`);
            console.log(`\n   Verifica en SAP que el artículo sea:`);
            console.log(`   → ItemCode: ${articulo.ItemCode}`);
            console.log(`   → Descripción: ${articulo.Dscription}`);
        } else {
            console.error("\n   ❌ Error creando draft:", JSON.stringify(createRes.data, null, 2));
        }

    } finally {
        // LOGOUT
        await sapRequest(`${SAP_BASE}/Logout`, { method: 'POST', headers: authHeaders }).catch(() => {});
        console.log("\n5. Sesión SAP cerrada.");
    }
}

main().catch(err => { console.error("Error fatal:", err); process.exit(1); });
