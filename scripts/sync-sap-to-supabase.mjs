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

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function syncItems() {
    try {
        console.log('Authenticating with SAP Business One...');
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

        if (!loginRes.ok) throw new Error('SAP Login failed');

        const { SessionId } = await loginRes.json();
        const cookies = loginRes.headers.get('set-cookie') || '';
        const sapHeaders = {
            'Content-Type': 'application/json',
            'Cookie': `B1SESSION=${SessionId}; ${cookies}`
        };

        // 1. Fetch Item Groups (ALL pages, NO select to avoid errors)
        console.log('Fetching ALL Item Groups for accounts...');
        const groupAccounts = {};
        let groupSkip = 0;
        let moreGroups = true;
        while (moreGroups) {
            const gUrl = `https://200.7.96.194:50000/b1s/v1/ItemGroups?$skip=${groupSkip}&$top=100`;
            const gRes = await fetch(gUrl, { headers: sapHeaders });
            const gData = await gRes.json();
            const batch = gData.value || [];
            if (batch.length === 0) break;

            batch.forEach(g => {
                // We'll take any found account key that matches "expense" or "expanse"
                const acc = g.ExpanseAccount || g.ExpenseAccount || g.Expanse || g.Expense;
                if (acc) groupAccounts[g.Number] = acc;
            });

            console.log(`Mapped ${batch.length} groups in this batch (Total: ${Object.keys(groupAccounts).length})`);
            if (batch.length < 100) moreGroups = false;
            groupSkip += 100;
        }

        // 2. Fetch items (ALL pages)
        let skip = 0;
        const pageSize = 100;
        let totalInserted = 0;
        let hasMore = true;

        console.log('Starting synchronization of items starting with ZZCC01-...');

        while (hasMore) {
            const itemsUrl = `https://200.7.96.194:50000/b1s/v1/Items?$filter=startswith(ItemCode, 'ZZCC01-')&$select=ItemCode,ItemName,QuantityOnStock,PurchaseUnit,LeadTime,Mainsupplier,U_TypeOC,ExpanseAccount,ItemsGroupCode&$skip=${skip}&$top=${pageSize}`;
            
            const res = await fetch(itemsUrl, { headers: sapHeaders });
            const data = await res.json();
            const items = data.value || [];

            if (items.length === 0) {
                hasMore = false;
                break;
            }

            console.log(`Processing ${items.length} items from SAP...`);

            const recordsToInsert = items.map(item => {
                // Priority: Item account -> Group account -> fallback null
                const account = item.ExpanseAccount || groupAccounts[item.ItemsGroupCode] || null;
                return {
                    item_code: item.ItemCode,
                    item_name: item.ItemName || 'N/A',
                    on_stock: item.QuantityOnStock || 0,
                    type_oc: item.U_TypeOC,
                    purchase_unit: item.PurchaseUnit,
                    lead_time: item.LeadTime || 0,
                    main_supplier: item.Mainsupplier,
                    associated_account: account,
                    raw_data: item,
                    updated_at: new Date().toISOString()
                };
            });

            const restRes = await fetch(`${supabaseUrl}/rest/v1/sap_articulos`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': supabaseKey,
                    'Authorization': `Bearer ${supabaseKey}`,
                    'Prefer': 'resolution=merge-duplicates,return=representation'
                },
                body: JSON.stringify(recordsToInsert)
            });

            if (restRes.ok) {
                const inserted = await restRes.json();
                totalInserted += inserted.length;
                console.log(`Successfully synced ${totalInserted} items total.`);
            } else {
                console.error('Supabase error:', await restRes.text());
                throw new Error('Supabase sync failed');
            }

            skip += items.length;
            if (items.length < pageSize) {
                // Final check to see if there's really nothing left
                const checkRes = await fetch(itemsUrl.replace(`$skip=${skip}`, `$skip=${skip}`).replace(`$top=${pageSize}`, '$top=1'), { headers: sapHeaders });
                const checkData = await checkRes.json();
                if (!checkData.value || checkData.value.length === 0) hasMore = false;
            }
        }

        console.log('Synchronization complete! Total items:', totalInserted);
        
        // Final sanity check
        console.log('Final check: one item sample:', totalInserted > 0 ? 'Found items' : 'NO ITEMS');

    } catch (error) {
        console.error('Sync error:', error);
    }
}

syncItems();
