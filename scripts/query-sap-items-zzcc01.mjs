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

        // Query items starting with ZZCC01
        // Removed LastPurchasePrice as it was invalid in previous attempt
        const itemsUrl = `https://200.7.96.194:50000/b1s/v1/Items?$filter=startswith(ItemCode, 'ZZCC01-')&$select=ItemCode,ItemName,QuantityOnStock,PurchaseUnit,LeadTime,Mainsupplier,U_TypeOC&$top=50`;
        
        console.log('Querying items starting with ZZCC01-...');
        const res = await fetch(itemsUrl, { headers });
        const data = await res.json();
        
        if (data.value) {
            const formatted = data.value.map((item, index) => ({
                '#': index + 121,
                'Número de artículo': item.ItemCode,
                'Descripción del artículo': item.ItemName,
                'En stock': item.QuantityOnStock,
                'TypeOC': item.U_TypeOC,
                'U.M. Compras': item.PurchaseUnit,
                'Lead Time': item.LeadTime,
                'Proveedor': item.Mainsupplier
            }));
            
            console.table(formatted);
            fs.writeFileSync('sap_items_zzcc01.json', JSON.stringify(data.value, null, 2));
        } else {
            console.error('Error or no items found:', data);
        }

    } catch (error) {
        console.error('Error:', error);
    }
}

queryItems();
