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

async function listAccountFieldsProperly() {
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

        const res = await fetch(`https://200.7.96.194:50000/b1s/v1/ItemGroups(121)`, { headers });
        const group = await res.json();
        
        console.log('Account fields for Group 121:');
        const searchValues = ['51209505', '25250505']; // Looking for these
        
        Object.keys(group).forEach(k => {
            if (k.toLowerCase().includes('account')) {
                console.log(`${k}: ${group[k]}`);
            }
        });
        
        console.log('\n--- Searching for values 51209505 or 25250505 ---');
        Object.keys(group).forEach(k => {
            if (group[k] && (String(group[k]).includes('51209505') || String(group[k]).includes('25250505'))) {
                console.log(`MATCH FOUND -> ${k}: ${group[k]}`);
            }
        });

    } catch (error) {
        console.error('Failed:', error);
    }
}

listAccountFieldsProperly();
