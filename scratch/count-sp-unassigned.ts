import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

try {
    const envFile = readFileSync(join(__dirname, '../.env'), 'utf-8');
    envFile.split('\n').forEach(line => {
        const [key, ...vals] = line.split('=');
        if (key && vals.length) process.env[key.trim()] = vals.join('=').trim().replace(/['"\r]/g, '');
    });
} catch (e) {
    console.error('Error loading .env:', e.message);
}

import { fetchAllSharePointItems } from '../src/lib/sharepoint.ts';

async function run() {
    try {
        console.log("Fetching invoices from SharePoint (Registro_de_Facturas)...");
        const items = await fetchAllSharePointItems('Registro_de_Facturas', 0); // 0 means fetch all
        console.log(`Total invoices fetched: ${items.length}`);

        const unassigned = items.filter(i => 
            !i.ResponsabledeAutorizarLookupId && 
            !i.Responsable_de_AutorizarLookupId && 
            !i.ResponsableAprobarLookupId &&
            !i.Responsable_de_Autorizar // Check the mapped field as well
        );

        console.log(`\n=> FACTURAS SIN RESPONSABLE: ${unassigned.length}`);
        
        if (unassigned.length > 0) {
            console.log("\nPrimeras 20 facturas sin responsable:");
            unassigned.slice(0, 20).forEach((u, idx) => {
                const facturaId = u.fields?.Nro_Factura || u.Nro_Factura || 'Sin Numero';
                const proveedor = u.fields?.Proveedor || u.Proveedor || 'Desconocido';
                console.log(`${idx + 1}. Factura: ${facturaId} | Proveedor: ${proveedor}`);
            });
        }
    } catch (e) {
        console.error("Error:", e);
    }
}

run();
