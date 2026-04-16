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

async function findFallbackAccount() {
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

        // 1. Get an item and its group
        const itemRes = await fetch(`https://200.7.96.194:50000/b1s/v1/Items('ZZCC01-0137-000-0000')?$select=ItemCode,ItemsGroupCode,GLMethod`, { headers });
        const item = await itemRes.json();
        
        console.log('Item Info:', JSON.stringify(item, null, 2));

        if (item.ItemsGroupCode) {
            // 2. Get the group accounts
            const groupRes = await fetch(`https://200.7.96.194:50000/b1s/v1/ItemGroups(${item.ItemsGroupCode})`, { headers });
            const group = await groupRes.json();
            
            console.log('Group Info (Accounts):');
            const accounts = Object.keys(group).filter(k => k.toLowerCase().includes('account'));
            accounts.forEach(k => {
                if (group[k]) console.log(`${k}: ${group[k]}`);
            });
        }

    } catch (error) {
        console.error('Search failed:', error);
    }
}

findFallbackAccount();
