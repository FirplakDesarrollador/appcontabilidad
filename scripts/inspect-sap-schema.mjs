import fs from 'fs';

function loadEnv() {
    try {
        const envContent = fs.readFileSync('.env', 'utf8');
        envContent.split('\n').forEach(line => {
            const [key, ...valueParts] = line.split('=');
            if (key && valueParts.length > 0) {
                const value = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
                process.env[key.trim()] = value;
            }
        });
    } catch (e) {}
}

loadEnv();

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

async function queryItems() {
    try {
        const loginUrl = process.env.SAP_API_URL || "https://200.7.96.194:50000/b1s/v1/Login";
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

        // Query 1 item to see all properties
        const itemsUrl = `https://200.7.96.194:50000/b1s/v1/Items?$top=1`;
        
        console.log('Fetching 1 item to inspect schema...');
        const res = await fetch(itemsUrl, { headers });
        const data = await res.json();
        
        if (data.value && data.value[0]) {
            fs.writeFileSync('sap_item_schema.json', JSON.stringify(data.value[0], null, 2));
            console.log('Schema saved to sap_item_schema.json');
            
            // Log keys
            console.log('Available keys:', Object.keys(data.value[0]).join(', '));
        }

    } catch (error) {
        console.error('Error:', error);
    }
}

queryItems();
