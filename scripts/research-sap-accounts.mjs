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

async function researchAccounts() {
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

        const { SessionId } = await loginRes.json();
        const cookies = loginRes.headers.get('set-cookie') || '';
        const sapHeaders = {
            'Content-Type': 'application/json',
            'Cookie': `B1SESSION=${SessionId}; ${cookies}`
        };

        // 1. Fetch a few ZZCC01 items with group and account info
        console.log('Fetching sample items with account info...');
        const itemsUrl = `https://200.7.96.194:50000/b1s/v1/Items?$filter=startswith(ItemCode, 'ZZCC01-')&$select=ItemCode,ItemName,ItemsGroupCode,ExpanseAccount,IncomeAccount,InventoryAccount,GLMethod&$top=1`;
        const itemsRes = await fetch(itemsUrl, { headers: sapHeaders });
        const itemsData = await itemsRes.json();
        
        if (itemsData.error) {
            console.error('SAP Error:', JSON.stringify(itemsData.error, null, 2));
            return;
        }

        console.log('Sample Items Data:');
        console.log(JSON.stringify(itemsData.value, null, 2));

        if (itemsData.value && itemsData.value.length > 0) {
            const groupCode = itemsData.value[0].ItemsGroupCode;
            console.log(`Checking Item Group: ${groupCode}...`);
            
            // 2. Fetch Item Group details (specifically accounts)
            const groupUrl = `https://200.7.96.194:50000/b1s/v1/ItemGroups(${groupCode})`;
            const groupRes = await fetch(groupUrl, { headers: sapHeaders });
            const groupData = await groupRes.json();
            
            console.log('Item Group Data (Accounts):');
            const accountFields = Object.keys(groupData).filter(k => k.toLowerCase().includes('account'));
            const filteredGroup = {};
            accountFields.forEach(f => filteredGroup[f] = groupData[f]);
            console.log(JSON.stringify(filteredGroup, null, 2));
        }

    } catch (error) {
        console.error('Research failed:', error);
    }
}

researchAccounts();
