const { getSharePointInvoiceById } = require('./src/lib/sharepoint');
const dotenv = require('dotenv');
dotenv.config();

async function check() {
    try {
        const id = '49037';
        console.log('Fetching invoice', id);
        const item = await getSharePointInvoiceById(id);
        console.log('Item:', JSON.stringify(item, null, 2));
    } catch (e) {
        console.error(e);
    }
}

check();
