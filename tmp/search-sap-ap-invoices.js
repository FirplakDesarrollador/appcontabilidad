
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

async function findPurchaseInvoices() {
    const user = "cmrestre";
    const pass = "1234";
    const db = "Firplak_SA";
    const loginUrl = "https://200.7.96.194:50000/b1s/v1/Login";

    console.log(`Searching for AP Invoices in SAP Service Layer...`);
    try {
        const loginRes = await fetch(loginUrl, {
            method: 'POST',
            body: JSON.stringify({ CompanyDB: db, Password: pass, UserName: user }),
            headers: { 'Content-Type': 'application/json' }
        });

        if (!loginRes.ok) return console.error('Login failed');

        const { SessionId } = await loginRes.json();
        
        // Fetch all entities
        const svcRes = await fetch("https://200.7.96.194:50000/b1s/v1/", {
            headers: { 'Cookie': `B1SESSION=${SessionId}` }
        });

        if (!svcRes.ok) return console.error('Failed to fetch Service Document');

        const svcData = await svcRes.json();
        const keywords = ['Purchase', 'Invoice', 'PurchaseInvoice'];
        
        const matches = svcData.value.filter(e => 
            keywords.some(k => e.name.toLowerCase().includes(k.toLowerCase()))
        );

        console.log('--- RELEVANT ENTITIES FOUND ---');
        matches.forEach(e => console.log(`- Entity: ${e.name} (Url: ${e.url})`));

    } catch (err) {
        console.error('Error:', err.message);
    }
}

findPurchaseInvoices();
