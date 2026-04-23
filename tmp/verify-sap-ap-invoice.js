
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

async function verifyInvoiceEntity() {
    const user = "cmrestre";
    const pass = "1234";
    const db = "Firplak_SA";
    const loginUrl = "https://200.7.96.194:50000/b1s/v1/Login";

    try {
        const loginRes = await fetch(loginUrl, {
            method: 'POST',
            body: JSON.stringify({ CompanyDB: db, Password: pass, UserName: user }),
            headers: { 'Content-Type': 'application/json' }
        });

        const { SessionId } = await loginRes.json();
        
        // Try to get a sample of PurchaseInvoices to confirm it exists and work
        const invUrl = "https://200.7.96.194:50000/b1s/v1/PurchaseInvoices?$top=1";
        const invRes = await fetch(invUrl, {
            headers: { 'Cookie': `B1SESSION=${SessionId}` }
        });

        if (invRes.ok) {
            console.log('SUCCESS: PurchaseInvoices entity found.');
            const data = await invRes.json();
            if(data.value && data.value.length > 0) {
                console.log('Sample DocEntry:', data.value[0].DocEntry);
                console.log('Sample CardCode:', data.value[0].CardCode);
            }
        } else {
            console.log('FAILED to find PurchaseInvoices:', await invRes.text());
        }

    } catch (err) {
        console.error('Error:', err.message);
    }
}

verifyInvoiceEntity();
