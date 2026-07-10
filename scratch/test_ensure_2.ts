import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load env
try {
    const envFile = readFileSync(join(__dirname, '../.env'), 'utf-8');
    envFile.split('\n').forEach(line => {
        const [key, ...vals] = line.split('=');
        if (key && vals.length) process.env[key.trim()] = vals.join('=').trim().replace(/['"\r]/g, '');
    });
} catch (e) {
    console.error('Error loading .env:', e.message);
}

import { ensureSharePointUserByEmail } from '../src/lib/sharepoint.ts';

async function run() {
    const result = await ensureSharePointUserByEmail("mateo.benavides@firplak.com");
    console.log("Result for mateo.benavides@firplak.com:", result);
}

run();
