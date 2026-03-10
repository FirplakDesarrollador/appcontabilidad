import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Manual .env.local parsing
const projRoot = join(__dirname, '..');
const envFile = readFileSync(join(projRoot, '.env.local'), 'utf-8');
envFile.split('\n').forEach(line => {
    const [key, ...vals] = line.split('=');
    if (key && vals.length) process.env[key.trim()] = vals.join('=').trim();
});

// Force bypass of SSL certificate validation for SAP
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

async function testCronLogic() {
    console.log("--- SIMULATING CRON LOGIC ---");
    
    const databases = [
        process.env.SAP_COMPANY_DB,
        process.env.SAP_COMPANY_DB_VIVENTTA
    ].filter(Boolean);

    console.log("Databases to update:", databases);

    for (const db of databases) {
        console.log(`\nChecking DB: ${db}`);
        
        const isViventta = db === process.env.SAP_COMPANY_DB_VIVENTTA;
        const username = isViventta ? process.env.SAP_USERNAME_VIVENTTA : process.env.SAP_USERNAME;
        const password = isViventta ? process.env.SAP_PASSWORD_VIVENTTA : process.env.SAP_PASSWORD;

        console.log(`Using Credentials - User: ${username}`);

        if (!username || !password) {
            console.error(`ERROR: Missing credentials for ${db}`);
            continue;
        }

        const loginUrl = process.env.SAP_API_URL || "https://200.7.96.194:50000/b1s/v1/Login";
        try {
            const loginResponse = await fetch(loginUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    CompanyDB: db,
                    Password: password,
                    UserName: username,
                }),
            });

            if (loginResponse.ok) {
                console.log(`SUCCESS: Login to ${db} successful!`);
            } else {
                console.error(`FAILURE: Login to ${db} failed with status ${loginResponse.status}`);
                console.error(await loginResponse.text());
            }
        } catch (err) {
            console.error(`FATAL ERROR: Could not connect to SAP for ${db}:`, err.message);
        }
    }
}

testCronLogic();
