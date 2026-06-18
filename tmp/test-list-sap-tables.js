
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

async function listTables() {
    const user = "cmrestre";
    const pass = "1234";
    const db = "Firplak_SA";
    const loginUrl = "https://200.7.96.194:50000/b1s/v1/Login";

    console.log(`Logging into ${db}...`);
    try {
        const loginRes = await fetch(loginUrl, {
            method: 'POST',
            body: JSON.stringify({ CompanyDB: db, Password: pass, UserName: user }),
            headers: { 'Content-Type': 'application/json' }
        });

        if (!loginRes.ok) {
            console.error('Login failed:', await loginRes.text());
            return;
        }

        const { SessionId } = await loginRes.json();
        console.log('Login success. Fetching User Tables (UDTs)...');

        const udtUrl = "https://200.7.96.194:50000/b1s/v1/UserTablesMD";
        const udtRes = await fetch(udtUrl, {
            headers: { 'Cookie': `B1SESSION=${SessionId}` }
        });

        if (!udtRes.ok) {
            console.error('Failed to fetch UDTs:', await udtRes.text());
        } else {
            const udtData = await udtRes.json();
            console.log('--- USER DEFINED TABLES (UDTs) ---');
            udtData.value.forEach(t => console.log(`- ${t.TableName}: ${t.TableDescription}`));
        }

        console.log('\nFetching Service Document (Standard entities)...');
        const svcUrl = "https://200.7.96.194:50000/b1s/v1/";
        const svcRes = await fetch(svcUrl, {
            headers: { 'Cookie': `B1SESSION=${SessionId}` }
        });

        if (!svcRes.ok) {
            console.error('Failed to fetch Service Document:', await svcRes.text());
        } else {
            const svcData = await svcRes.json();
            console.log('--- SOME STANDARD ENTITIES ---');
            svcData.value.slice(0, 10).forEach(e => console.log(`- ${e.name}`));
            console.log(`... and ${svcData.value.length - 10} more.`);
        }

    } catch (err) {
        console.error('Error:', err.message);
    }
}

listTables();
