import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Caracteres especiales o puertos
const API_URL = 'http://localhost:3006';

// Cargando variables de entorno
try {
    const envFile = readFileSync(join(__dirname, '../.env'), 'utf-8');
    envFile.split('\n').forEach(line => {
        const [key, ...vals] = line.split('=');
        if (key && vals.length) process.env[key.trim()] = vals.join('=').trim().replace(/['"]/g, '');
    });
} catch (e) {
    console.error('Error loading .env:', e.message);
}

const { createClient } = await import('@supabase/supabase-js');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Mapeo manual de las 10 facturas
const assignments = [
    { Nro_Factura: 'NCE101802', responsibleNameQuery: 'Daniela Castro' },
    { Nro_Factura: 'FEGM13637', responsibleNameQuery: 'Maria Elena Perez' },
    { Nro_Factura: '8764', responsibleNameQuery: 'Daniela Patiño' },
    { Nro_Factura: 'NC228', responsibleNameQuery: 'Daniela Patiño' },
    { Nro_Factura: 'AM98', responsibleNameQuery: 'Daniela Patiño' },
    { Nro_Factura: 'FE11837', responsibleNameQuery: 'Daniela Patiño' },
    { Nro_Factura: '9903151361901', responsibleNameQuery: 'Mateo Benavides' },
    { Nro_Factura: 'FPP493293', responsibleNameQuery: 'Renata Lainez' },
    { Nro_Factura: 'FPP493296', responsibleNameQuery: 'Renata Lainez' },
    { Nro_Factura: 'MAS215914', responsibleNameQuery: 'Mateo Benavides' },
];

async function main() {
    console.log("Esperando un poco a que el servidor levante...");
    await new Promise(r => setTimeout(r, 2000));

    // 1. Obtener los IDs de las facturas
    console.log("Obteniendo facturas...");
    const { data: facturas, error } = await supabase
        .from('Registro_Facturas')
        .select('ID, Nro_Factura, Proveedor')
        .in('Nro_Factura', assignments.map(a => a.Nro_Factura));
    
    if (error) {
        console.error("Error obteniendo facturas de Supabase:", error);
        return;
    }

    // 2. Por cada asignacion
    for (const assignment of assignments) {
        const factura = facturas.find(f => f.Nro_Factura === assignment.Nro_Factura);
        if (!factura) {
            console.warn(`Factura no encontrada en BD: ${assignment.Nro_Factura}`);
            continue;
        }

        console.log(`Buscando usuario para asignar: ${assignment.responsibleNameQuery}`);
        let user;
        try {
            const searchRes = await fetch(`${API_URL}/api/users/search?q=${encodeURIComponent(assignment.responsibleNameQuery)}`);
            if (!searchRes.ok) throw new Error(`HTTP ${searchRes.status}`);
            const searchData = await searchRes.json();
            
            user = searchData.users?.[0]; // tomamos el primer match
            if (!user) {
                throw new Error(`No se encontro usuario`);
            }
            console.log(`Encontrado: ${user.name} (${user.email})`);
        } catch (e) {
            console.error(`Error buscando usuario ${assignment.responsibleNameQuery}:`, e.message);
            continue;
        }

        console.log(`Asignando factura ${factura.Nro_Factura} a ${user.name}...`);
        try {
            const body = {
                itemId: factura.ID,
                userEmail: user.email,
                userName: user.name,
                assignedByName: "Sistema/Asistente",
                invoiceNumber: factura.Nro_Factura,
                providerName: factura.Proveedor
            };
            const res = await fetch(`${API_URL}/api/sharepoint/update-responsible`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body)
            });
            const data = await res.json();
            if (data.success) {
                console.log(`✅ Success for ${factura.Nro_Factura}`);
            } else {
                console.error(`❌ Failed for ${factura.Nro_Factura}:`, data.error);
            }
        } catch (e) {
            console.error(`❌ Error assigning ${factura.Nro_Factura}:`, e.message);
        }
    }

    console.log("Finalizado.");
}

main();
