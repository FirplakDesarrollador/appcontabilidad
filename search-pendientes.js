const https = require('https');

const supabaseUrl = 'zohdtksgxhbheaftgmsi.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvaGR0a3NneGhiaGVhZnRnbXNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjI5NjExNTEsImV4cCI6MjAzODUzNzE1MX0.Euu6FTh11mbh4lUmhKFMTFYZ9hWgZ-RzECcUYKGRYQE';

const options = {
  hostname: supabaseUrl,
  path: `/rest/v1/Facturas%20pendientes?select=Folio,Prefijo&Folio=ilike.*325284*`,
  headers: {
    'apikey': supabaseKey,
    'Authorization': `Bearer ${supabaseKey}`
  }
};

https.get(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    console.log('SEARCH RESULTS IN Facturas pendientes FOR 325284:', data);
  });
});

const options2 = {
  hostname: supabaseUrl,
  path: `/rest/v1/Facturas%20pendientes?select=Folio,Prefijo&Folio=ilike.*1264308*`,
  headers: {
    'apikey': supabaseKey,
    'Authorization': `Bearer ${supabaseKey}`
  }
};

https.get(options2, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    console.log('SEARCH RESULTS IN Facturas pendientes FOR 1264308:', data);
  });
});
