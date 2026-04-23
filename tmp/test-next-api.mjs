import fetch from 'node-fetch';
import https from 'https';

async function test() {
    try {
        const body = JSON.stringify({ nroFactura: 'MED11192', nit: 'PN900337062-01', companyDB: 'Firplak_SA' });
        const res = await fetch('http://localhost:3000/api/sap/validate-invoice', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body
        });
        const text = await res.text();
        console.log(res.status, text);
    } catch(e) {
        console.error(e);
    }
}
test();
