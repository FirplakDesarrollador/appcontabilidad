const { createClient } = require('@supabase/supabase-client');

const supabaseUrl = 'https://zohdtksgxhbheaftgmsi.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvaGR0a3NneGhiaGVhZnRnbXNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjI5NjExNTEsImV4cCI6MjAzODUzNzE1MX0.Euu6FTh11mbh4lUmhKFMTFYZ9hWgZ-RzECcUYKGRYQE';

const supabase = createClient(supabaseUrl, supabaseKey);

async function debugData() {
  console.log('--- Checking Registro_Facturas ---');
  const { data, count, error } = await supabase
    .from('Registro_Facturas')
    .select('Nro_Factura, Prefijo, Folio', { count: 'exact' })
    .limit(10);
  
  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(`Total count in DB: ${count}`);
  console.log('Sample rows:');
  data.forEach(row => {
    console.log(`[Nro_Factura: ${row.Nro_Factura}] [Prefijo: ${row.Prefijo}] [Folio: ${row.Folio}]`);
  });

  // Specifically check for one from the screenshot: PR325284 or WF1264308
  console.log('\n--- Searching for specific invoices from screenshot ---');
  const searchTerms = ['325284', '1264308', '81851891091'];
  for (const term of searchTerms) {
    const { data: searchResult } = await supabase
      .from('Registro_Facturas')
      .select('Nro_Factura, Prefijo, Folio')
      .or(`Nro_Factura.ilike.%${term}%,Folio.ilike.%${term}%`);
    
    console.log(`Results for ${term}:`, searchResult);
  }
}

debugData();
