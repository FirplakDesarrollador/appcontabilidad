import { readFileSync } from 'fs';
import { ConfidentialClientApplication } from '@azure/msal-node';
import { Client } from '@microsoft/microsoft-graph-client';

const envFile = readFileSync('.env', 'utf-8');
envFile.split('\n').forEach(line => {
    const [key, ...vals] = line.split('=');
    if (key && vals.length) process.env[key.trim()] = vals.join('=').trim();
});
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

async function updateSharePoint() {
    console.log('1. Fetching items from SharePoint...');
    const cca = new ConfidentialClientApplication({
        auth: {
            clientId: process.env.AZURE_CLIENT_ID,
            authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
            clientSecret: process.env.AZURE_CLIENT_SECRET,
        },
    });
    const response = await cca.acquireTokenByClientCredential({ scopes: ['https://graph.microsoft.com/.default'] });
    const spClient = Client.init({ authProvider: (done) => done(null, response.accessToken) });
    const site = await spClient.api('/sites/firplaksa.sharepoint.com:/sites/FPKContabilidad').get();
    const lists = await spClient.api(`/sites/${site.id}/lists`).get();
    const list = lists.value.find(l => l.name === 'Registro_de_Facturas' || l.displayName === 'Registro_de_Facturas');

    let spItems = [];
    let spNextLink = `/sites/${site.id}/lists/${list.id}/items?expand=fields&$top=500`;
    while (spNextLink) {
        const res = await spClient.api(spNextLink).header('Prefer', 'HonorNonIndexedQueriesWarningMayFailRandomly').get();
        spItems = spItems.concat(res.value || []);
        const nextOdata = res['@odata.nextLink'];
        if (nextOdata) {
            const skiptokenMatch = nextOdata.match(/skiptoken=([^&]+)/);
            if (skiptokenMatch) {
                spNextLink = `/sites/${site.id}/lists/${list.id}/items?expand=fields&$top=500&$skiptoken=${skiptokenMatch[1]}`;
            } else {
                spNextLink = nextOdata.split('v1.0')[1];
            }
        } else {
            spNextLink = null;
        }
    }
    
    // Map of invoice number to SharePoint Item ID
    const spInvoicesMap = new Map();
    for (const item of spItems) {
        if(item.fields && item.fields.Nro_Factura && item.fields.Gestion_Contabilidad === 'Por Procesar') {
            const nro = item.fields.Nro_Factura.trim();
            if (nro) {
                if (!spInvoicesMap.has(nro)) {
                    spInvoicesMap.set(nro, []);
                }
                spInvoicesMap.get(nro).push(item.id);
            }
        }
    }
    const uniqueInvoices = Array.from(spInvoicesMap.keys());
    console.log(`Found ${uniqueInvoices.length} unique 'Por Procesar' invoice numbers in SP.`);

    console.log('2. Querying SAP to find intersection...');
    let baseUrl = (process.env.SAP_API_URL || 'https://200.7.96.194:50000/b1s/v1/').trim();
    baseUrl = baseUrl.replace(/\/Login\/?$/i, '/');
    const loginUrl = `${baseUrl.replace(/\/$/, '')}/Login`;
    const db = process.env.SAP_COMPANY_DB || 'Firplak_SA';
    let user = process.env.SAP_USERNAME?.trim() || 'manager';
    let pass = process.env.SAP_PASSWORD?.trim() || '2023Fir#.*';
    if (pass === '2023Fir') pass = '2023Fir#.*';
    
    const loginRes = await fetch(loginUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ CompanyDB: db, Password: pass, UserName: user }),
    });
    const { SessionId } = await loginRes.json();
    
    const purchaseInvoicesUrl = process.env.SAP_PURCHASE_INVOICES_URL || 'https://200.7.96.194:50000/b1s/v1/PurchaseInvoices';
    
    const sapFoundInvoices = new Set();
    const chunkSize = 20; 
    
    for (let i = 0; i < uniqueInvoices.length; i += chunkSize) {
        const chunk = uniqueInvoices.slice(i, i + chunkSize);
        const filterStr = chunk.map(inv => `NumAtCard eq '${inv.replace(/'/g, "''")}'`).join(' or ');
        const queryUrl = `${purchaseInvoicesUrl}?$filter=${encodeURIComponent(filterStr)}&$select=NumAtCard`;
        
        try {
            const invoicesRes = await fetch(queryUrl, { headers: { 'Cookie': `B1SESSION=${SessionId}` } });
            if (invoicesRes.ok) {
                const data = await invoicesRes.json();
                if (data.value && data.value.length > 0) {
                    for (const v of data.value) {
                        sapFoundInvoices.add(v.NumAtCard);
                    }
                }
            }
        } catch (e) {}
    }
    
    // Build list of SP IDs to update
    const spIdsToUpdate = [];
    for (const nroFactura of sapFoundInvoices) {
        let ids = spInvoicesMap.get(nroFactura);
        if (!ids) {
            const matchingKey = Array.from(spInvoicesMap.keys()).find(k => k.trim() === nroFactura.trim());
            if (matchingKey) {
                ids = spInvoicesMap.get(matchingKey);
            }
        }
        if (ids) {
            spIdsToUpdate.push(...ids);
        }
    }
    
    console.log(`3. Found ${spIdsToUpdate.length} records to update to "Procesado". Starting update...`);
    
    let updated = 0;
    let errors = 0;
    
    for (let i = 0; i < spIdsToUpdate.length; i++) {
        const itemId = spIdsToUpdate[i];
        try {
            const payload = { Gestion_Contabilidad: 'Procesado' };
            await spClient.api(`/sites/${site.id}/lists/${list.id}/items/${itemId}/fields`).patch(payload);
            updated++;
        } catch (e) {
            errors++;
            console.error(`Failed to update item ${itemId}:`, e.message);
        }
        if ((i + 1) % 100 === 0) console.log(`Processed ${i + 1}/${spIdsToUpdate.length}...`);
    }
    
    console.log(`\n¡PROCESO COMPLETADO!`);
    console.log(`Exitosos: ${updated}`);
    console.log(`Errores: ${errors}`);
}

updateSharePoint().catch(console.error);
