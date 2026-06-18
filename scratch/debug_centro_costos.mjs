const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));

async function checkInvoice() {
    // Get SharePoint data via the existing API
    const res = await fetch('http://localhost:3000/api/externo/factura/49925');
    const data = await res.json();
    console.log('centro_costos raw:', JSON.stringify(data.distribuciones));
    console.log('tablaCostos:', JSON.stringify(data.tablaCostos));
    console.log('full keys:', Object.keys(data));
}

checkInvoice().catch(console.error);
