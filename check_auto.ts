import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const { data: docs } = await sb.from('Documento_Soporte').select('*').order('created_at', { ascending: false }).limit(2);
  console.log('Latest docs:', JSON.stringify(docs, null, 2));

  if (docs && docs.length > 0) {
      const baseNit = docs[0].nit.includes('-') ? docs[0].nit.split('-')[0] : docs[0].nit;
      const { data: prov } = await sb.from('proveedores').select('id, aprobacion_automatica, proveedor_aprobacion_reglas(*)').eq('numero_identificacion', baseNit).single();
      console.log('Provider for latest doc:', JSON.stringify(prov, null, 2));
  }
}
run();
