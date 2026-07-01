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



async function run() {
    try {
        console.log("Fetching invoices from SharePoint (Registro_de_Facturas)...");
        const { fetchAllSharePointItems } = await import('../src/lib/sharepoint.ts');
        const items = await fetchAllSharePointItems('Registro_de_Facturas', 0); // 0 means fetch all
        console.log(`Total invoices fetched: ${items.length}`);

        const unassigned = items.filter(i => 
            !i.ResponsabledeAutorizarLookupId && 
            !i.Responsable_de_AutorizarLookupId && 
            !i.ResponsableAprobarLookupId &&
            !i.Responsable_de_Autorizar // Check the mapped field as well
        );

        const targetInvoices = items.filter(i => {
            const aprobacion = i.fields?.Aprobacion_Doliente || i.Aprobacion_Doliente || '';
            const gestion = i.fields?.Gestion_Contabilidad || i.Gestion_Contabilidad || '';
            return aprobacion.toLowerCase() === 'aprobado' && gestion.toLowerCase() === 'por procesar';
        });

        console.log(`\n=> FACTURAS APROBADAS (Aprobacion_Doliente) Y POR PROCESAR (Gestion_Contabilidad): ${targetInvoices.length}`);
        
        if (targetInvoices.length > 0) {
            console.log("\nPrimeras 20 facturas con esta condición en SharePoint:");
            targetInvoices.slice(0, 20).forEach((inv, idx) => {
                const facturaId = inv.fields?.Nro_Factura || inv.Nro_Factura || 'Sin Numero';
                const proveedor = inv.fields?.Proveedor || inv.Proveedor || 'Desconocido';
                console.log(`${idx + 1}. Factura: ${facturaId} | Proveedor: ${proveedor}`);
            });
        }
        
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
