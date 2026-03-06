const fetch = require('node-fetch');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

async function testViventta() {
    const db = "DBViventta"; // Using value from .env
    const user = "cmrestre";
    const pass = "1234";
    const url = "https://200.7.96.194:50000/b1s/v1/Login";

    console.log(`Testing Login for ${db}...`);
    try {
        const response = await fetch(url, {
            method: 'POST',
            body: JSON.stringify({ CompanyDB: db, Password: pass, UserName: user }),
            headers: { 'Content-Type': 'application/json' }
        });

        console.log('Status:', response.status);
        if (!response.ok) {
            console.log('Error:', await response.text());
            return;
        }

        const data = await response.json();
        const sessionId = data.SessionId;
        const cookies = response.headers.get('set-cookie');
        console.log('Login Success! SessionId:', sessionId);
        console.log('Cookies:', cookies);

        // Test Get Rate
        const rateUrl = "https://200.7.96.194:50000/b1s/v1/SBOBobService_GetCurrencyRate";
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const rateDate = `${year}${month}${day}`;

        console.log(`Testing Get Rate for ${rateDate}...`);
        const rateResponse = await fetch(rateUrl, {
            method: 'POST',
            body: JSON.stringify({ Currency: "USD", Date: rateDate }),
            headers: {
                'Content-Type': 'application/json',
                'Cookie': `B1SESSION=${sessionId}; ${cookies || ''}`
            }
        });

        console.log('Rate Status:', rateResponse.status);
        if (!rateResponse.ok) {
            console.log('Rate Error:', await rateResponse.text());
        } else {
            console.log('Rate Data:', await rateResponse.json());
        }

    } catch (err) {
        console.error('Fatal Error:', err);
    }
}

testViventta();
