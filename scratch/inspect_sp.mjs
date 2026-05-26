import fs from 'fs';
import path from 'path';

// Parse .env manually
const envPath = path.resolve('.env');
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, 'utf-8');
  for (const line of envConfig.split('\n')) {
    const parts = line.split('=');
    if (parts.length >= 2) {
      const key = parts[0].trim();
      const val = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
      if (key && !key.startsWith('#')) {
        process.env[key] = val;
      }
    }
  }
}

import { getSharePointInvoiceById } from '../src/lib/sharepoint.ts';

async function run() {
  try {
    const item = await getSharePointInvoiceById('49922');
    console.log("Invoice item:", JSON.stringify(item, null, 2));
  } catch(e) {
    console.error("Error:", e);
  }
}
run();
