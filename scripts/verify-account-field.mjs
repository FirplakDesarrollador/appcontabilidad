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

async function verifyAccountField() {
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

        // Fetch 1 ZZCC01 item without $select to see exact property names
        const res = await fetch(`https://200.7.96.194:50000/b1s/v1/Items?$filter=startswith(ItemCode, 'ZZCC01-')&$top=1`, { headers });
        const data = await res.json();
        
        if (data.value && data.value[0]) {
            const item = data.value[0];
            const accountKeys = Object.keys(item).filter(k => k.toLowerCase().includes('account') || k.toLowerCase().includes('expense'));
            console.log('Account-related keys in SAP Item:', accountKeys);
            accountKeys.forEach(k => console.log(`${k}: ${item[k]}`));
        } else {
            console.log('No item found or error:', data);
        }

    } catch (error) {
        console.error('Verify failed:', error);
    }
}

verifyAccountField();
