
const { fetchAllSharePointItems } = require('./src/lib/sharepoint');
const dotenv = require('dotenv');
dotenv.config();

async function test() {
    try {
        const items = await fetchAllSharePointItems();
        if (items.length > 0) {
            const allKeys = new Set();
            items.forEach(item => Object.keys(item).forEach(k => allKeys.add(k)));
            console.log('All unique field names:', Array.from(allKeys).sort());
            
            const searchTerms = ['responsable', 'doliente', 'autorizar', 'asignado', 'user', 'person'];
            const foundKeys = Array.from(allKeys).filter(k => 
                searchTerms.some(term => k.toLowerCase().includes(term))
            );
            console.log('Potentially relevant keys:', foundKeys);
            
            if (foundKeys.length > 0) {
                console.log('Values for potentially relevant keys (first 20 items):');
                items.slice(0, 20).forEach((item, i) => {
                    const rowData = {};
                    foundKeys.forEach(k => {
                        if (item[k]) rowData[k] = item[k];
                    });
                    if (Object.keys(rowData).length > 0) {
                        console.log(`Item ${i}:`, rowData);
                    }
                });
            }
        } else {
            console.log('No items found in SharePoint');
        }
    } catch (e) {
        console.error(e);
    }
}

test();
