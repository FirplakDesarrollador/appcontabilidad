async function test() {
    try {
        const res = await fetch('http://localhost:3000/api/sharepoint/documentos/all?refresh=true');
        const data = await res.json();
        console.log('Success:', data.success);
        console.log('Total items fetched:', data.items.length);
        const item2648 = data.items.find(item => String(item.id) === '2648');
        if (item2648) {
            console.log('Found 2648 in returned items:', item2648);
        } else {
            console.log('Item 2648 NOT found in the returned items list!');
        }
    } catch (e) {
        console.error(e);
    }
}
test();
