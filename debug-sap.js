process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

async function testSAP(db) {
    const user = "cmrestre";
    const pass = "1234";
    const url = "https://200.7.96.194:50000/b1s/v1/Login";

    console.log(`\n>>> START TEST: ${db} <<<`);
    try {
        const response = await fetch(url, {
            method: 'POST',
            body: JSON.stringify({ CompanyDB: db, Password: pass, UserName: user }),
            headers: { 'Content-Type': 'application/json' }
        });

        if (!response.ok) {
            console.log(`Log in FAILED for ${db}: ${response.status}`);
            console.log('Response:', await response.text());
            return;
        }

        const data = await response.json();
        console.log(`Log in SUCCESS for ${db}. SessionId: ${data.SessionId}`);

        const rateUrl = "https://200.7.96.194:50000/b1s/v1/SBOBobService_GetCurrencyRate";
        const rateResponse = await fetch(rateUrl, {
            method: 'POST',
            body: JSON.stringify({ Currency: "USD", Date: "20260303" }),
            headers: { 'Content-Type': 'application/json', 'Cookie': `B1SESSION=${data.SessionId}` }
        });

        if (!rateResponse.ok) {
            console.log(`Rate fetching FAILED for ${db}: ${rateResponse.status}`);
            console.log('Response:', await rateResponse.text());
        } else {
            console.log(`Rate fetching SUCCESS for ${db}`);
            const rateData = await rateResponse.json();
            console.log('Rate Result:', rateData);
        }
    } catch (err) {
        console.log(`Fatal ERROR for ${db}: ${err.message}`);
    }
    console.log(`>>> END TEST: ${db} <<<\n`);
}

async function run() {
    await testSAP("Firplak_SA");
    await testSAP("DBViventta");
    await testSAP("Viventta_SAS");
    await testSAP("Viventta");
}

run();
