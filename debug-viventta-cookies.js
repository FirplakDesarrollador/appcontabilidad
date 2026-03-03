process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

async function testViventta() {
    const db = "DBViventta";
    const user = "cmrestre";
    const pass = "1234";
    const url = "https://200.7.96.194:50000/b1s/v1/Login";

    console.log(`\nTesting ${db}...`);
    try {
        const response = await fetch(url, {
            method: 'POST',
            body: JSON.stringify({ CompanyDB: db, Password: pass, UserName: user }),
            headers: { 'Content-Type': 'application/json' }
        });

        if (!response.ok) {
            console.log('Login failed:', response.status, await response.text());
            return;
        }

        const data = await response.json();
        const sid = data.SessionId;
        const setCookie = response.headers.get('set-cookie');
        console.log('Login OK. SID:', sid);
        console.log('Set-Cookie:', setCookie);

        const rateUrl = "https://200.7.96.194:50000/b1s/v1/SBOBobService_GetCurrencyRate";
        const rateResponse = await fetch(rateUrl, {
            method: 'POST',
            body: JSON.stringify({ Currency: "USD", Date: "20260303" }),
            headers: {
                'Content-Type': 'application/json',
                'Cookie': `B1SESSION=${sid}; ${setCookie || ''}`
            }
        });

        console.log('Rate Status:', rateResponse.status);
        if (rateResponse.ok) {
            console.log('Rate Data:', await rateResponse.json());
        } else {
            console.log('Rate Error:', await rateResponse.text());
        }
    } catch (err) {
        console.log('Fetch Error:', err.message);
    }
}

testViventta();
