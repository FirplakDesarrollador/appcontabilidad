
import { getSharePointInvoiceById } from './src/lib/sharepoint.js';

async function debug() {
    try {
        const item = await getSharePointInvoiceById('47701');
        console.log('Item 47701 fields:', Object.keys(item));
        console.log('Fields details:', JSON.stringify(item, null, 2));
    } catch (e) {
        console.error(e);
    }
}

debug();
