
const { getGraphClient } = require('./src/lib/sharepoint');
const dotenv = require('dotenv');
dotenv.config();

async function test() {
    try {
        const client = await getGraphClient();
        const siteResponse = await client.api('/sites/firplaksa.sharepoint.com:/sites/FPKContabilidad').get();
        const siteId = siteResponse.id;
        const listsResponse = await client.api(`/sites/${siteId}/lists`).get();
        const list = listsResponse.value.find(l => l.name === 'Registro_de_Facturas' || l.displayName === 'Registro_de_Facturas');
        const listId = list.id;

        const columnsResponse = await client.api(`/sites/${siteId}/lists/${listId}/columns`).get();
        console.log('Columns:');
        columnsResponse.value.forEach(col => {
            console.log(`${col.displayName} (Internal: ${col.name}, Type: ${col.personOrGroup ? 'Person' : col.lookup ? 'Lookup' : 'Other'})`);
        });
    } catch (e) {
        console.error(e);
    }
}

test();
