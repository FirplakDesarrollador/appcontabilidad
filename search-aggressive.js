const https = require('https');

const supabaseUrl = 'zohdtksgxhbheaftgmsi.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvaGR0a3NneGhiaGVhZnRnbXNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjI5NjExNTEsImV4cCI6MjAzODUzNzE1MX0.Euu6FTh11mbh4lUmhKFMTFYZ9hWgZ-RzECcUYKGRYQE';

const options = {
  hostname: supabaseUrl,
  path: `/rest/v1/Registro_Facturas?select=Nro_Factura&Nro_Factura=ilike.*325284*`,
  headers: {
    'apikey': supabaseKey,
    'Authorization': `Bearer ${supabaseKey}`
  }
};

https.get(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    console.log('RESULTS FOR *325284*:', data);
  });
});

https.get({
  hostname: supabaseUrl,
  path: `/rest/v1/Registro_Facturas?select=Nro_Factura&Nro_Factura=ilike.*PR*325*`,
  headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log('RESULTS FOR *PR*325*:', data));
});
