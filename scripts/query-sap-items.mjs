import fs from 'fs';

// Node.js 18+ has native fetch. Let's use it.
// We'll manually parse .env if it exists to avoid dependency issues.
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
    } catch (e) {
        console.warn('Could not load .env file:', e.message);
    }
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
                CompanyDB: process.env.SAP_COMPANY_DB || "Firplak_SA",
                Password: process.env.SAP_PASSWORD || "2023Fir#.*",
                UserName: process.env.SAP_USERNAME || "manager",
            }),
        });

        if (!loginRes.ok) {
            console.error('Login failed:', await loginRes.text());
            return;
        }

        const { SessionId } = await loginRes.json();
        const cookies = loginRes.headers.get('set-cookie') || '';
        const headers = {
            'Content-Type': 'application/json',
            'Cookie': `B1SESSION=${SessionId}; ${cookies}`
        };

        // Query items starting with ZZCC01
        // We'll also select U_TypeOC if it exists (guessing common UDF names)
        const itemsUrl = `https://200.7.96.194:50000/b1s/v1/Items?$filter=startswith(ItemCode, 'ZZCC01-')&$select=ItemCode,ItemName,QuantityOnStock,PurchaseUnit,LastPurchasePrice,LeadTime,DefaultSupplier&$top=50`;
        
        console.log('Querying items from SAP Business One...');
        const res = await fetch(itemsUrl, { headers });
        
        if (!res.ok) {
            console.error('Query failed:', await res.text());
            return;
        }

        const data = await res.json();
        console.log(`Found ${data.value?.length || 0} items matching the criteria.`);
        
        if (data.value && data.value.length > 0) {
            const formatted = data.value.map((item, index) => ({
                '#': index + 121, // Start at 121 to match screenshot
                'Número de artículo': item.ItemCode,
                'Descripción del artículo': item.ItemName,
                'En stock': item.QuantityOnStock,
                'U.M. Compras': item.PurchaseUnit,
                'Último precio': item.LastPurchasePrice,
                'Lead Time': item.LeadTime,
                'Proveedor': item.DefaultSupplier
            }));
            
            console.table(formatted);
            
            // Write to a JSON file for the user to see full data
            fs.writeFileSync('sap_items_result.json', JSON.stringify(data.value, null, 2));
            console.log('Full results saved to sap_items_result.json');
        }

    } catch (error) {
        console.error('Error:', error);
    }
}

queryItems();
