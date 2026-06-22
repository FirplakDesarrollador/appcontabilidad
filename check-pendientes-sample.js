const https = require('https');

const supabaseUrl = 'zohdtksgxhbheaftgmsi.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvaGR0a3NneGhiaGVhZnRnbXNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjI5NjExNTEsImV4cCI6MjAzODUzNzE1MX0.Euu6FTh11mbh4lUmhKFMTFYZ9hWgZ-RzECcUYKGRYQE';

const options = {
  hostname: supabaseUrl,
  path: `/rest/v1/Facturas%20pendientes?select=Folio,Prefijo,Nombre_Emisor&limit=10`,
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
      console.log('SAMPLE DATA FROM Facturas pendientes:');
      json.forEach(row => {
        console.log(`Prefijo: "${row.Prefijo}", Folio: "${row.Folio}", Emisor: "${row.Nombre_Emisor}"`);
      });
    } catch (e) {
      console.log('Raw data:', data);
    }
  });
});
