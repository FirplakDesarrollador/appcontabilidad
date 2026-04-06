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

async function countItems() {
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

        const countUrl = `https://200.7.96.194:50000/b1s/v1/Items/$filter=startswith(ItemCode, 'ZZCC01-')&$count=true&$top=0`;
        const res = await fetch(countUrl, { headers });
        const data = await res.json();
        console.log('Total items found with prefix ZZCC01-:', data['@odata.count']);

    } catch (error) {
        console.error('Error:', error);
    }
}

countItems();
