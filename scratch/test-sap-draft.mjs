
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load env vars manually
try {
    const envPath = join(process.cwd(), '.env');
    if (existsSync(envPath)) {
        const envFile = readFileSync(envPath, 'utf-8');
        envFile.split('\n').forEach(line => {
            let [key, ...vals] = line.split('=');
            if (key && vals.length) {
                let val = vals.join('=').trim();
                // Remove surrounding quotes if present
                if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
                    val = val.substring(1, val.length - 1);
                }
                process.env[key.trim()] = val;
            }
        });
    }
} catch (e) {
    console.error('Error loading .env:', e.message);
}

// Force bypass of SSL certificate validation
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

async function testDraft() {
    const loginUrl = process.env.SAP_API_URL || "https://200.7.96.194:50000/b1s/v1/Login";
    
    console.log("Logging in to SAP...");
    const loginRes = await fetch(loginUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            CompanyDB: process.env.SAP_COMPANY_DB,
            Password: process.env.SAP_PASSWORD,
            UserName: process.env.SAP_USERNAME,
        }),
    });

    if (!loginRes.ok) {
        console.error("Login failed:", await loginRes.text());
        return;
    }

    const { SessionId } = await loginRes.json();
    const cookies = loginRes.headers.get('set-cookie');

    console.log("Login successful. Searching for a Business Partner...");

    const bpRes = await fetch(`${loginUrl.replace('/Login', '')}/BusinessPartners?$top=1&$select=CardCode,FederalTaxID`, {
        headers: { 'Cookie': `B1SESSION=${SessionId}; ${cookies}` }
    });

    const bpData = await bpRes.json();
    if (!bpData.value || bpData.value.length === 0) {
        console.error("No Business Partners found.");
        return;
    }

    const bp = bpData.value[0];
    console.log(`Found Business Partner: ${bp.CardCode} (NIT: ${bp.FederalTaxID})`);

    const accountCode = "51100505";
    const costCenter = "GA-FICOG";

    console.log(`Using valid Account: ${accountCode} and CC: ${costCenter}`);

    console.log("Creating test draft...");

    const draftUrl = process.env.SAP_DRAFTS_URL || `${loginUrl.replace('/Login', '')}/Drafts`;
    
    const draftBody = {
        DocObjectCode: "oPurchaseInvoices",
        DocType: "dDocument_Service",
        CardCode: bp.CardCode,
        NumAtCard: "TEST-" + Date.now(),
        DocDate: new Date().toISOString().split('T')[0],
        Comments: "Prueba técnica de integración - Antigravity AI",
        DocumentLines: [
            {
                ItemDescription: "SERVICIO DE PRUEBA TECNICA",
                AccountCode: accountCode, 
                CostingCode: costCenter,   
                LineTotal: "1000",
                VatGroup: "IVADEX"
            }
        ]
    };

    const createRes = await fetch(draftUrl, {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'Cookie': `B1SESSION=${SessionId}; ${cookies}`
        },
        body: JSON.stringify(draftBody),
    });

    if (createRes.ok) {
        const result = await createRes.json();
        console.log("SUCCESS! Draft created with DocEntry:", result.DocEntry);
    } else {
        const error = await createRes.json();
        console.error("Error creating draft:", JSON.stringify(error, null, 2));
    }

    // Logout
    await fetch(loginUrl.replace('/Login', '/Logout'), {
        method: 'POST',
        headers: { 'Cookie': `B1SESSION=${SessionId}; ${cookies}` }
    });
}

testDraft();
