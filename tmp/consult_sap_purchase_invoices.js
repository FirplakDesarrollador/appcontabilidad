process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');

async function auth() {
    const user = "manager";
    const pass = "2023Fir#.*";
    const db = "Firplak_SA";
    const loginUrl = "https://200.7.96.194:50000/b1s/v1/Login";

    console.log(`Authenticating to SAP Service Layer...`);
    const loginRes = await fetch(loginUrl, {
        method: 'POST',
        body: JSON.stringify({ CompanyDB: db, Password: pass, UserName: user }),
        headers: { 'Content-Type': 'application/json' }
    });

    if (!loginRes.ok) throw new Error('Login failed: ' + await loginRes.text());
    console.log("Auth success");
    return await loginRes.json();
}

async function getPurchaseInvoices(SessionId) {
    const url = "https://200.7.96.194:50000/b1s/v1/PurchaseInvoices?$top=1&$orderby=DocEntry desc";
    console.log(`Fetching from: ${url}`);
    
    const res = await fetch(url, {
        headers: { 'Cookie': `B1SESSION=${SessionId}` }
    });

    if (!res.ok) throw new Error('Fetch failed: ' + await res.text());
    
    const data = await res.json();
    if(data.value && data.value.length > 0) {
        fs.writeFileSync('tmp/sap_invoice_sample.json', JSON.stringify(data.value[0], null, 2));
        console.log("Saved to tmp/sap_invoice_sample.json");
    } else {
        console.log("No invoices found");
    }
}

async function main() {
    try {
        const { SessionId } = await auth();
        await getPurchaseInvoices(SessionId);
    } catch (e) {
        console.error(e.message);
    }
}

main();
