const https = require('https');

const supabaseUrl = 'zohdtksgxhbheaftgmsi.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvaGR0a3NneGhiaGVhZnRnbXNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjI5NjExNTEsImV4cCI6MjAzODUzNzE1MX0.Euu6FTh11mbh4lUmhKFMTFYZ9hWgZ-RzECcUYKGRYQE';

const options = {
  hostname: supabaseUrl,
  path: '/rest/v1/Registro_Facturas?select=Nro_Factura,Prefijo,Folio&limit=20',
  headers: {
    'apikey': supabaseKey,
    'Authorization': `Bearer ${supabaseKey}`
  }
};

https.get(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      console.log('SAMPLE DATA FROM DB:');
      json.forEach(row => {
        console.log(`Nro_Factura: "${row.Nro_Factura}", Prefijo: "${row.Prefijo}", Folio: "${row.Folio}"`);
      });
    } catch (e) {
      console.log('Error parsing JSON:', e.message);
      console.log('Raw data:', data);
    }
  });
}).on('error', (e) => {
  console.error('Error:', e.message);
});

// Also search for one specific from the list
const searchOptions = {
  hostname: supabaseUrl,
  path: '/rest/v1/Registro_Facturas?select=Nro_Factura,Prefijo,Folio&Nro_Factura=ilike.*325284*',
  headers: {
    'apikey': supabaseKey,
    'Authorization': `Bearer ${supabaseKey}`
  }
};

https.get(searchOptions, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    console.log('\nSEARCH FOR 325284:');
    console.log(data);
  });
});
