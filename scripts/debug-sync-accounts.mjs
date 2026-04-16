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

async function debugSync() {
    try {
        console.log('Authenticating with SAP...');
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

        const loginData = await loginRes.json();
        if (!loginData.SessionId) {
            console.error('Login Error:', loginData);
            return;
        }
        
        const sapHeaders = { 'Cookie': `B1SESSION=${loginData.SessionId}` };

        // 1. Fetch Item Groups
        console.log('Fetching Item Groups...');
        const groupRes = await fetch(`https://200.7.96.194:50000/b1s/v1/ItemGroups?$select=Number,ExpanseAccount`, { headers: sapHeaders });
        const groupData = await groupRes.json();
        
        if (groupData.error) {
            console.error('Groups Fetch Error:', groupData.error);
            return;
        }

        const groupAccounts = {};
        (groupData.value || []).forEach(g => {
            groupAccounts[g.Number] = g.ExpanseAccount;
        });
        
        console.log(`Mapped ${Object.keys(groupAccounts).length} item groups.`);
        console.log('Group 121 Account:', groupAccounts[121] || 'NOT FOUND');

        // 2. Fetch one item
        console.log('Fetching sample ZZCC01 item...');
        const itemRes = await fetch(`https://200.7.96.194:50000/b1s/v1/Items?$filter=startswith(ItemCode, 'ZZCC01-')&$select=ItemCode,ItemsGroupCode,ExpanseAccount&$top=1`, { headers: sapHeaders });
        const itemData = await itemRes.json();
        
        if (itemData.error) {
            console.error('Item Fetch Error:', itemData.error);
            return;
        }
        
        if (!itemData.value || itemData.value.length === 0) {
            console.log('No item found.');
            return;
        }

        const item = itemData.value[0];
        console.log('Item Detail:', {
            ItemCode: item.ItemCode,
            ItemsGroupCode: item.ItemsGroupCode,
            ExpanseAccount: item.ExpanseAccount
        });
        
        console.log('Lookup Result (Direct):', groupAccounts[item.ItemsGroupCode]);
        console.log('Lookup Result (Stringified Key):', groupAccounts[String(item.ItemsGroupCode)]);

    } catch (error) {
        console.error('Debug crashed:', error.message);
        console.error(error.stack);
    }
}

debugSync();
