
const db = "Firplak_SA";
const user = "manager";
const pass = "2023Fir#.*";
const url = "https://200.7.96.194:50000/b1s/v1/Login";

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

console.log('Testing SAP Login outside Next.js...');
fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ CompanyDB: db, Password: pass, UserName: user })
})
    .then(res => {
        console.log('Status:', res.status);
        return res.text();
    })
    .then(text => {
        console.log('Response:', text);
    })
    .catch(err => {
        console.error('Error:', err.message);
    });
