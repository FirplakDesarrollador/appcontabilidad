import fs from 'fs';
import https from 'https';

const env = fs.readFileSync('.env', 'utf8');
const lines = env.split('\n');
const process_env = {};
lines.forEach(line => {
    const parts = line.split('=');
    if (parts.length >= 2) {
        process_env[parts[0].trim()] = parts.slice(1).join('=').trim().replace(/^"(.*)"$/, '$1');
    }
});

async function run() {
    try {
        const loginUrl = process_env.SAP_API_URL || "https://200.7.96.194:50000/b1s/v1/Login";
        const res = await fetch(loginUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                CompanyDB: process_env.SAP_COMPANY_DB,
                Password: process_env.SAP_PASSWORD,
                UserName: process_env.SAP_USERNAME,
            })
        });
        const loginData = await res.json();
        const cookies = res.headers.get('set-cookie');

        const query = `$filter=CenterCode eq 'IP-PMUEB'`;
        const url = loginUrl.replace('/Login', `/ProfitCenters?${query}`);
        
        const spRes = await fetch(url, {
            headers: { 'Cookie': cookies }
        });
        const spData = await spRes.json();
        console.log("Profit Center Data:", JSON.stringify(spData, null, 2));
    } catch (e) {
        console.error(e);
    }
}

run();
