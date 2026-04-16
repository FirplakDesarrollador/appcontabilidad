import fs from 'fs';

function loadEnv() {
    try {
        if (fs.existsSync('.env')) {
            const envContent = fs.readFileSync('.env', 'utf8');
            envContent.split('\n').forEach(line => {
                const [key, ...valueParts] = line.split('=');
                if (key && valueParts.length > 0) {
                    const value = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
                    process.env[key.trim()] = value;
                }
            });
        }
    } catch (e) {}
}

loadEnv();

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

async function verifyGroupStructure() {
    try {
        const loginUrl = process.env.SAP_API_URL;
        const loginRes = await fetch(loginUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                CompanyDB: process.env.SAP_COMPANY_DB,
                Password: process.env.SAP_PASSWORD,
                UserName: process.env.SAP_USERNAME,
            }),
        });

        const { SessionId } = await loginRes.json();
        const headers = { 'Cookie': `B1SESSION=${SessionId}` };

        // Fetch 1 group without $select
        const res = await fetch(`https://200.7.96.194:50000/b1s/v1/ItemGroups(121)`, { headers });
        const group = await res.json();
        
        console.log('Keys in Group 121:', Object.keys(group).filter(k => k.toLowerCase().includes('account')));
        console.log('Value of ExpensesAccount:', group.ExpensesAccount);
        console.log('Value of ExpenseAccount:', group.ExpenseAccount);
        console.log('Value of ExpanseAccount:', group.ExpanseAccount);

    } catch (error) {
        console.error('Verify failed:', error);
    }
}

verifyGroupStructure();
