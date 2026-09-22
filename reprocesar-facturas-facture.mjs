/**
 * Script: reprocesar-facturas-facture.mjs
 * 
 * Envía manualmente los eventos RECEIVEGOODS (032) + ACCEPT (033) a Facture
 * para las facturas que se auto-aprobaron por el trigger SQL pero nunca
 * recibieron los eventos porque el cron no los llamaba.
 * 
 * Facturas a reprocesar:
 *   INTRAPLAS SAS  → ITP167570, ITP167572, ITP167571
 *   SOMOS MAYOR SAS → FSMR2932
 *   ANDERCOL        → ANNA8923
 *   FLEXCO          → 253270
 * 
 * Uso: node reprocesar-facturas-facture.mjs
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL  = 'https://zohdtksgxhbheaftgmsi.supabase.co';
const SUPABASE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvaGR0a3NneGhiaGVhZnRnbXNpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTcyMjk2MTE1MSwiZXhwIjoyMDM4NTM3MTUxfQ.Y-OdRzGTe0llD1VRPYxyUIo1man7MCeABlMrZVuAqus';

const FACTURE_USER  = '890927404';
const FACTURE_PASS  = '|uLuG&W@SDUdQ26';
const FACTURE_EMAIL = 'recepcionfacturas@firplak.com';
const INBOX_BASE    = 'https://fone-reception-inbox-pro.azurewebsites.net';
const CONSTANT_ID   = '0b409936-666f-4a61-8efd-a9c400d9fa7f';

// ── Facturas a reprocesar ─────────────────────────────────────────────────────
const NRO_FACTURAS = [
  'ITP167570',
  'ITP167572',
  'ITP167571',
  'FSMR2932',
  'ANNA8923',
  '253270',
];

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getToken() {
  const res = await fetch('https://api.facture.co/PLColab.Identity/Auth/Login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ u: FACTURE_USER, p: FACTURE_PASS, ft: 'issuer|Receiver' }),
  });
  if (!res.ok) throw new Error(`Auth failed (${res.status}): ${await res.text()}`);
  const d = await res.json();
  const token = d.accessToken || d.token || d.jwt;
  if (!token) throw new Error('No se obtuvo token de Facture');
  return token;
}

async function findLdfInInbox(token, nroFactura) {
  const now = new Date();
  const desde = new Date();
  desde.setDate(now.getDate() - 90);
  const fmt = d => d.toISOString().split('T')[0] + 'T00:00:00.00';

  const clean = nroFactura.replace(/^(FAC|FE)[-_]?/i, '').trim();

  for (let page = 1; page <= 10; page++) {
    const url = new URL(`${INBOX_BASE}/PLColab.Inbox/Notification/PRINCIPAL/With/RECEIVED;ACKNOWLEDGED;RECEIVEDGOODS/WithNot/ACCEPTED;REJECTED/${CONSTANT_ID}`);
    url.searchParams.set('receiverStartingDate', fmt(desde));
    url.searchParams.set('receiverEndingDate', fmt(now));
    url.searchParams.set('pageIndex', String(page));
    url.searchParams.set('pageSize', '100');

    const r = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) { console.warn(`  Inbox página ${page} falló (${r.status})`); break; }

    const data = await r.json();
    const items = data?.items || data || [];
    if (!items.length) break;

    console.log(`  Inbox pág ${page}: ${items.length} items`);
    const match = items.find(i => {
      const num = (i.number || i.documentCode || i.ldf || '').toUpperCase();
      return num.includes(clean.toUpperCase()) || num.includes(nroFactura.toUpperCase()) || nroFactura.toUpperCase().includes(num);
    });
    if (match?.ldf) return match.ldf;
  }
  return null;
}

async function buildLdfByProbe(token, nit, nroFactura, baseDate) {
  const clean = nroFactura.replace(/^(FAC|FE)[-_]?/i, '').trim();
  const cleanNit = nit.split('-')[0].trim().replace(/\D/g, '');
  const docTypes = ['FACTURA-UBL', 'NC-UBL', 'ND-UBL'];
  const promises = [];

  for (let offset = 0; offset <= 15; offset++) {
    for (const dt of docTypes) {
      const d = new Date(baseDate);
      d.setDate(baseDate.getDate() - offset);
      const dateStr = d.toISOString().split('T')[0];
      const ldf = `${dt}(${cleanNit};${clean};${dateStr};PRINCIPAL;PRINCIPAL)`;

      promises.push((async () => {
        const testToken = Buffer.from(ldf).toString('base64');
        const testUrl = `https://reception-domain-service.facture.co/PLColab.Documents/Document/RECEIVEGOODS/${encodeURIComponent(testToken)}`;
        const r = await fetch(testUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', reception: 'true', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            motive: 'Otro', sourceDelivery: 'INBOX', canal: 'INBOX',
            medio: FACTURE_EMAIL, receiverDocumentType: 'CC',
            receiverDocumentNumber: '123456789',
            receiverName: 'Verificación', receiverLastName: 'Contabilidad',
            receiveDateTime: new Date().toISOString(),
          }),
        });
        const j = await r.json().catch(() => null);
        const ok = j?.isSuccess === true;
        const desc = j?.eventItems?.[0]?.shortDescription || j?.message || '';
        if (ok || r.ok || desc.includes('recibido') || desc.includes('aceptado') || desc.includes('reclamar')) {
          console.log(`  ✅ LDF verificado (${dt}) con fecha ${dateStr}: ${ldf}`);
          return ldf;
        }
        throw new Error('no match');
      })());
    }
  }

  try { return await Promise.any(promises); } catch { return null; }
}

async function sendReceiveGoods(documentTokenBase64, token) {
  const url = `https://reception-domain-service.facture.co/PLColab.Documents/Document/RECEIVEGOODS/${encodeURIComponent(documentTokenBase64)}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://plataforma.facture.co', Referer: 'https://plataforma.facture.co/', reception: 'true', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      motive: 'Otro', sourceDelivery: 'INBOX', canal: 'INBOX',
      medio: FACTURE_EMAIL, receiverDocumentType: 'CC',
      receiverDocumentNumber: '123456789',
      receiverName: 'Contabilidad', receiverLastName: 'Firplak',
      receiverJobTitle: 'Responsable de Autorizar',
      receiverOrganizationDepartment: 'Contabilidad',
      receiveDateTime: new Date().toISOString(),
    }),
  });
  return { status: r.status, data: await r.json().catch(() => null) };
}

async function sendAccept(documentTokenBase64, token) {
  const url = `https://reception-domain-service.facture.co/PLColab.Documents/Document/ACCEPT/V2/${encodeURIComponent(documentTokenBase64)}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://plataforma.facture.co', Referer: 'https://plataforma.facture.co/', reception: 'true', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ motive: 'Aceptación', sourceDelivery: 'INBOX', canal: 'INBOX', medio: FACTURE_EMAIL }),
  });
  return { status: r.status, data: await r.json().catch(() => null) };
}

// ── Main ──────────────────────────────────────────────────────────────────────

console.log('🔐 Autenticando en Facture...');
const token = await getToken();
console.log('✅ Token obtenido\n');

const summary = [];

for (const nroFactura of NRO_FACTURAS) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`📄 Procesando: ${nroFactura}`);

  // 1. Buscar en Supabase
  const { data: inv, error } = await supabase
    .from('Registro_Facturas')
    .select('ID, Nro_Factura, Nit, Proveedor, Responsable_de_Autorizar, Creado, Aprobacion_Doliente')
    .ilike('Nro_Factura', `%${nroFactura}%`)
    .limit(1)
    .single();

  if (error || !inv) {
    console.error(`  ❌ No encontrada en Supabase: ${error?.message || 'sin resultado'}`);
    summary.push({ nroFactura, status: 'ERROR - no encontrada en BD' });
    continue;
  }

  console.log(`  ID: ${inv.ID} | Proveedor: ${inv.Proveedor} | NIT: ${inv.Nit} | Estado: ${inv.Aprobacion_Doliente}`);

  if (inv.Aprobacion_Doliente !== 'Aprobado') {
    console.warn(`  ⚠️  Factura NO está en estado Aprobado (${inv.Aprobacion_Doliente}). Saltando.`);
    summary.push({ nroFactura, status: `SALTADA - estado: ${inv.Aprobacion_Doliente}` });
    continue;
  }

  // 2. Buscar LDF en Inbox de Facture
  console.log('  🔍 Buscando LDF en Inbox de Facture...');
  let ldf = await findLdfInInbox(token, inv.Nro_Factura);

  if (ldf) {
    console.log(`  ✅ LDF encontrado en Inbox: ${ldf}`);
  } else {
    console.log('  🔍 No encontrado en Inbox. Probando construcción por fecha...');
    const baseDate = inv.Creado ? new Date(inv.Creado) : new Date();
    ldf = await buildLdfByProbe(token, inv.Nit || '', inv.Nro_Factura || nroFactura, baseDate);

    if (!ldf) {
      // Fallback final sin verificación
      const cleanNit = (inv.Nit || '').split('-')[0].trim().replace(/\D/g, '');
      const cleanNro = (inv.Nro_Factura || nroFactura).replace(/^(FAC|FE)[-_]?/i, '').trim();
      const dateStr = (inv.Creado || new Date().toISOString()).split('T')[0];
      ldf = `FACTURA-UBL(${cleanNit};${cleanNro};${dateStr};PRINCIPAL;PRINCIPAL)`;
      console.warn(`  ⚠️  Usando LDF de fallback (sin verificar): ${ldf}`);
    }
  }

  const docToken = Buffer.from(ldf).toString('base64');

  // 3. PASO 1: RECEIVEGOODS (032)
  console.log('  📦 Enviando RECEIVEGOODS (032)...');
  const rg = await sendReceiveGoods(docToken, token);
  const rgDesc = rg.data?.eventItems?.[0]?.shortDescription || rg.data?.message || JSON.stringify(rg.data);
  console.log(`     → Status: ${rg.status} | Respuesta: ${rgDesc}`);

  // 4. Pausa obligatoria 3s
  console.log('  ⏳ Pausa 3 segundos (sincronización DIAN)...');
  await new Promise(r => setTimeout(r, 3000));

  // 5. PASO 2: ACCEPT (033)
  console.log('  ✔️  Enviando ACCEPT/V2 (033)...');
  const ac = await sendAccept(docToken, token);
  const acDesc = ac.data?.eventItems?.[0]?.shortDescription || ac.data?.message || JSON.stringify(ac.data);
  console.log(`     → Status: ${ac.status} | Respuesta: ${acDesc}`);

  const rgOk = rg.status >= 200 && rg.status < 300;
  const acOk = ac.status >= 200 && ac.status < 300;
  const status = rgOk && acOk ? '✅ OK' : rgOk ? '⚠️ Solo RECEIVEGOODS OK' : `❌ Error (RG:${rg.status} AC:${ac.status})`;
  summary.push({ nroFactura, ldf, rgStatus: rg.status, acStatus: ac.status, status });
}

// ── Resumen ───────────────────────────────────────────────────────────────────
console.log(`\n${'═'.repeat(60)}`);
console.log('📊 RESUMEN FINAL:');
console.log('═'.repeat(60));
for (const s of summary) {
  console.log(`  ${s.status.padEnd(35)} ${s.nroFactura}`);
}
console.log('═'.repeat(60));
