const https = require('https');
const fs = require('fs');

const supabaseUrl = 'zohdtksgxhbheaftgmsi.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvaGR0a3NneGhiaGVhZnRnbXNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjI5NjExNTEsImV4cCI6MjAzODUzNzE1MX0.Euu6FTh11mbh4lUmhKFMTFYZ9hWgZ-RzECcUYKGRYQE';

async function fetchAllInvoices() {
  let allNros = [];
  let from = 0;
  const step = 1000;
  let moreData = true;

  while (moreData) {
    console.log(`Fetching from ${from}...`);
    const options = {
      hostname: supabaseUrl,
      path: `/rest/v1/Registro_Facturas?select=Nro_Factura&order=ID.asc&range=${from}-${from + step - 1}`,
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      }
    };

    const data = await new Promise((resolve, reject) => {
      https.get(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => resolve(JSON.parse(body)));
      }).on('error', reject);
    });

    if (data && data.length > 0) {
      allNros = allNros.concat(data.map(d => d.Nro_Factura));
      from += step;
    } else {
      moreData = false;
    }
    if (from > 20000) break;
  }

  console.log(`Total fetched: ${allNros.length}`);
  fs.writeFileSync('all_invoice_numbers.txt', allNros.join('\n'));
}

fetchAllInvoices();
