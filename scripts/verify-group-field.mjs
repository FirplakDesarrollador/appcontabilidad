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

async function verifyGroupField() {
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
        const res = await fetch(`https://200.7.96.194:50000/b1s/v1/ItemGroups?$top=1`, { headers });
        const data = await res.json();
        
        if (data.value && data.value[0]) {
            const group = data.value[0];
            const accountKeys = Object.keys(group).filter(k => k.toLowerCase().includes('account') || k.toLowerCase().includes('expense'));
            console.log('Account-related keys in SAP ItemGroup:', accountKeys);
            accountKeys.forEach(k => console.log(`${k}: ${group[k]}`));
        } else {
            console.log('No group found or error:', data);
        }

    } catch (error) {
        console.error('Verify failed:', error);
    }
}

verifyGroupField();
