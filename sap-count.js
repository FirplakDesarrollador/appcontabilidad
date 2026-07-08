const fs = require('fs');
const env = fs.readFileSync('.env', 'utf-8');
env.split('\n').forEach(l => {
    const p = l.split('=');
    if (p[0] && p.length > 1) process.env[p[0].trim()] = p.slice(1).join('=').trim();
});
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

async function check() {
    let baseUrl = (process.env.SAP_API_URL || 'https://200.7.96.194:50000/b1s/v1/').trim();
    baseUrl = baseUrl.replace(/\/Login\/?$/i, '/');
    const loginUrl = `${baseUrl.replace(/\/$/, '')}/Login`;
    const db = process.env.SAP_COMPANY_DB || 'Firplak_SA';
    let user = process.env.SAP_USERNAME?.trim() || 'manager';
    let pass = process.env.SAP_PASSWORD?.trim() || '2023Fir#.*';
    
    if (pass === '2023Fir') pass = '2023Fir#.*';
    
    const loginRes = await fetch(loginUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ CompanyDB: db, Password: pass, UserName: user }),
    });
    
    const { SessionId } = await loginRes.json();
    
    const purchaseInvoicesUrl = process.env.SAP_PURCHASE_INVOICES_URL || 'https://200.7.96.194:50000/b1s/v1/PurchaseInvoices';
    const queryUrl = `${purchaseInvoicesUrl}/$count`;
    
    const invoicesRes = await fetch(queryUrl, {
        headers: { 'Cookie': `B1SESSION=${SessionId}` }
    });
    
    const count = await invoicesRes.text();
    console.log('SAP Invoices Count:', count);
}
check().catch(console.error);
