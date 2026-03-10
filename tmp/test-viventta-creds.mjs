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

async function testCredentials(db, user, pass) {
    const url = process.env.SAP_API_URL || "https://200.7.96.194:50000/b1s/v1/Login";
    console.log(`Testing Login for ${db} with user ${user}...`);
    try {
        const response = await fetch(url, {
            method: 'POST',
            body: JSON.stringify({ CompanyDB: db, Password: pass, UserName: user }),
            headers: { 'Content-Type': 'application/json' }
        });

        console.log('Status:', response.status);
        if (response.ok) {
            console.log('Login Success!');
            return true;
        } else {
            console.log('Error:', await response.text());
            return false;
        }
    } catch (err) {
        console.error('Fatal Error:', err);
        return false;
    }
}

async function run() {
    const managerUser = process.env.SAP_USERNAME;
    const managerPass = process.env.SAP_PASSWORD;
    const viventtaDb = process.env.SAP_COMPANY_DB_VIVENTTA;

    if (!viventtaDb) {
        console.error("SAP_COMPANY_DB_VIVENTTA not set in process.env");
        return;
    }

    console.log("--- Testing Manager Credentials on Viventta ---");
    const successManager = await testCredentials(viventtaDb, managerUser, managerPass);

    if (!successManager) {
        console.log("\n--- Testing Debug Credentials (cmrestre) on Viventta ---");
        await testCredentials(viventtaDb, "cmrestre", "1234");
    }
}

run();
