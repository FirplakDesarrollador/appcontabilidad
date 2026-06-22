const https = require('https');

const supabaseUrl = 'zohdtksgxhbheaftgmsi.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvaGR0a3NneGhiaGVhZnRnbXNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjI5NjExNTEsImV4cCI6MjAzODUzNzE1MX0.Euu6FTh11mbh4lUmhKFMTFYZ9hWgZ-RzECcUYKGRYQE';

// Search for the specific SODIMAC number from screenshot in any text column
const query = `select=*&or=(Nro_Factura.eq.4403100392698,Consecutivo.eq.4403100392698,CUFE.ilike.%4403100392698%)`;

const options = {
  hostname: supabaseUrl,
  path: `/rest/v1/Registro_Facturas?${query}`,
  headers: {
    'apikey': supabaseKey,
    'Authorization': `Bearer ${supabaseKey}`
  }
};

https.get(options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log('Global search for 4403100392698:', data));
});
