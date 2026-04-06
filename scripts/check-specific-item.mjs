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

async function checkItem() {
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
        const cookies = loginRes.headers.get('set-cookie') || '';
        const headers = {
            'Content-Type': 'application/json',
            'Cookie': `B1SESSION=${SessionId}; ${cookies}`
        };

        const itemCode = 'ZZCC01-0137-000-0000';
        const itemUrl = `https://200.7.96.194:50000/b1s/v1/Items('${itemCode}')`;
        const res = await fetch(itemUrl, { headers });
        const data = await res.json();
        
        if (data.ItemCode) {
            console.log('Item found:', data.ItemCode, data.ItemName);
        } else {
            console.log('Item not found:', itemCode, data);
        }

    } catch (error) {
        console.error('Error:', error);
    }
}

checkItem();
