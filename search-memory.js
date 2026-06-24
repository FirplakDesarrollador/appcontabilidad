const https = require('https');

const supabaseUrl = 'zohdtksgxhbheaftgmsi.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvaGR0a3NneGhiaGVhZnRnbXNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjI5NjExNTEsImV4cCI6MjAzODUzNzE1MX0.Euu6FTh11mbh4lUmhKFMTFYZ9hWgZ-RzECcUYKGRYQE';

async function searchMemory() {
  const options = {
    hostname: supabaseUrl,
    path: `/rest/v1/Registro_Facturas?select=Nro_Factura&limit=10000`,
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`
    }
  };

  https.get(options, (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
      try {
        const data = JSON.parse(body);
        console.log(`Fetched ${data.length} records.`);
        const found = data.filter(d => String(d.Nro_Factura).toLowerCase().includes('325284'));
        console.log('Results containing 325284:', found);
        
        const found2 = data.filter(d => String(d.Nro_Factura).toLowerCase().includes('1264308'));
        console.log('Results containing 1264308:', found2);
      } catch (e) {
        console.log('Error:', e.message);
        console.log('Body:', body);
      }
    });
  });
}

searchMemory();
