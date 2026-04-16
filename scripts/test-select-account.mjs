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

async function testSelect() {
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

        // Test ExpenseAccount (with e)
        console.log('Testing ExpenseAccount (with e) in select...');
        const resE = await fetch(`https://200.7.96.194:50000/b1s/v1/Items?$filter=startswith(ItemCode, 'ZZCC01-')&$select=ItemCode,ExpenseAccount&$top=1`, { headers });
        const dataE = await resE.json();
        console.log('Result with ExpenseAccount:', dataE.error ? 'ERROR' : 'SUCCESS');
        if (dataE.value) console.log(dataE.value[0]);

        // Test ExpanseAccount (with a)
        console.log('\nTesting ExpanseAccount (with a) in select...');
        const resA = await fetch(`https://200.7.96.194:50000/b1s/v1/Items?$filter=startswith(ItemCode, 'ZZCC01-')&$select=ItemCode,ExpanseAccount&$top=1`, { headers });
        const dataA = await resA.json();
        console.log('Result with ExpanseAccount:', dataA.error ? 'ERROR' : 'SUCCESS');
        if (dataA.value) console.log(dataA.value[0]);

    } catch (error) {
        console.error('Test failed:', error);
    }
}

testSelect();
