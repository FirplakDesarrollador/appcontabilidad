const http = require('http');

const body = JSON.stringify({ nroFactura: '123', nit: '123', companyDB: 'Firplak_SA' });

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/sap/validate-invoice',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body)
  }
};

const req = http.request(options, (res) => {
  let chunks = [];
  res.on('data', (d) => chunks.push(d));
  res.on('end', () => console.log(res.statusCode, Buffer.concat(chunks).toString()));
});

req.on('error', (e) => console.error(e));
req.write(body);
req.end();
