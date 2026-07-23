// Script one-shot: asigna responsable a facturas sin él
// Uso: node patch-responsible.mjs
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

// Leer .env.local
const env = Object.fromEntries(
    readFileSync('.env.local', 'utf-8')
        .split('\n')
        .filter(l => l.includes('=') && !l.startsWith('#'))
        .map(l => {
            const idx = l.indexOf('=');
            return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
        })
);

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey  = env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey     = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const key = (serviceKey && serviceKey !== 'REEMPLAZAR_CON_TU_SERVICE_ROLE_KEY') ? serviceKey : anonKey;

if (!supabaseUrl || !key) {
    console.error('❌ No se encontraron las variables NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, key);

function baseNit(nit) {
    if (!nit) return '';
    const s = String(nit).trim();
    return s.includes('-') ? s.split('-')[0].trim() : s;
}

console.log('🔍 Cargando proveedores con responsable...');
const { data: providers, error: pErr } = await supabase
    .from('Proveedores_con_Responsable')
    .select('"Nit", "Responsable", "Autorizador"');

if (pErr) { console.error('❌ Error cargando proveedores:', pErr.message); process.exit(1); }

// Construir mapa baseNit → nombre
const provMap = new Map();
for (const p of providers) {
    const key = baseNit(p.Nit);
    if (key && !provMap.has(key)) {
        const name = p.Responsable || p.Autorizador;
        if (name) provMap.set(key, name);
    }
}
console.log(`✅ ${provMap.size} proveedores con responsable cargados.`);

console.log('\n🔍 Cargando facturas sin responsable...');

// Paginar para traer TODAS (la API de Supabase pagina a 1000 por defecto)
let allInvoices = [];
let offset = 0;
const PAGE = 1000;
while (true) {
    const { data, error } = await supabase
        .from('Registro_Facturas')
        .select('ID, Nit, Nro_Factura')
        .or('Responsable_de_Autorizar.is.null,Responsable_de_Autorizar.eq.""')
        .order('ID', { ascending: false })
        .range(offset, offset + PAGE - 1);

    if (error) { console.error('❌ Error consultando facturas:', error.message); break; }
    if (!data || data.length === 0) break;
    allInvoices = allInvoices.concat(data);
    if (data.length < PAGE) break;
    offset += PAGE;
}

console.log(`📋 Facturas sin responsable: ${allInvoices.length}\n`);

let fixed = 0, skipped = 0, failed = 0;
const skippedNits = new Set();

for (const inv of allInvoices) {
    const key = baseNit(inv.Nit);
    const responsable = provMap.get(key) || null;

    if (!responsable) {
        skipped++;
        skippedNits.add(inv.Nit);
        continue;
    }

    const { error: upErr } = await supabase
        .from('Registro_Facturas')
        .update({ Responsable_de_Autorizar: responsable })
        .eq('ID', inv.ID);

    if (upErr) {
        console.error(`  ❌ ID ${inv.ID} (${inv.Nro_Factura}): ${upErr.message}`);
        failed++;
    } else {
        console.log(`  ✓ ID ${inv.ID} (${inv.Nro_Factura}) → ${responsable}`);
        fixed++;
    }
}

console.log('\n──────────────────────────────────');
console.log(`✅ Corregidos : ${fixed}`);
console.log(`⚠️  Sin info   : ${skipped}  (NIT sin responsable conocido)`);
console.log(`❌ Con error  : ${failed}`);

if (skippedNits.size > 0) {
    console.log('\nNITs sin responsable conocido:');
    for (const n of [...skippedNits].sort()) console.log(`  ${n}`);
}
