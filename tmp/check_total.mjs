import { fetchAllSharePointItems } from './src/lib/sharepoint.js';

async function test() {
    try {
        console.log("Fetching all items...");
        const items = await fetchAllSharePointItems();
        console.log(`Total items: ${items.length}`);
        if (items.length > 0) {
            console.log("First item keys:", Object.keys(items[0]));
        }
    } catch (e) {
        console.error(e);
    }
}

test();
