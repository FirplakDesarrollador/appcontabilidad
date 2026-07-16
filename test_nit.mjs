// Fetch directly from API
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
import dotenv from 'dotenv';
dotenv.config({ path: 'C:/Users/analista2.desarrollo/Desktop/apps/appcontabilidad/.env' });

const baseUrl = process.env.SAP_BASE_URL;
const sessionId = process.env.SAP_SESSION_ID;

async function test() {
    try {
        const nit = '444444568';
        const rawNit = nit;
        const cleanNit = nit.replace(/[^0-9]/g, '');
        const baseNit = nit.split('-')[0].replace(/[^0-9]/g, '');
        let nitWithDash = rawNit;
        if (!rawNit.includes('-') && cleanNit.length === 9) {
            nitWithDash = `${cleanNit.substring(0, 8)}-${cleanNit.substring(8)}`;
        }
        
        const nitFilter = `(FederalTaxID eq '${rawNit}' or FederalTaxID eq '${nitWithDash}' or FederalTaxID eq '${cleanNit}' or FederalTaxID eq '${baseNit}' or CardCode eq '${baseNit}' or CardCode eq 'P${baseNit}' or CardCode eq 'AC${baseNit}' or CardCode eq 'PN${baseNit}' or CardCode eq 'AC${baseNit}-01' or CardCode eq 'PN${baseNit}-01')`;
        
        const bpUrl = `${baseUrl}/BusinessPartners?$filter=${nitFilter}&$select=CardCode,CardName,FederalTaxID,CardType`;
        
        console.log("Querying:", bpUrl);
        const res = await fetch(bpUrl, {
            headers: {
                'Cookie': `B1SESSION=${sessionId}`,
                'Accept': 'application/json'
            },
            // disable ssl verification if needed
        });
        
        if (!res.ok) {
            console.log("HTTP Error:", res.status);
            console.log(await res.text());
            return;
        }

        const data = await res.json();
        console.log("Result:");
        console.dir(data, { depth: null });
    } catch (e) {
        console.error("Error:", e.message || e);
    }
}

test();
