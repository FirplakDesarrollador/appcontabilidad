const fs = require('fs');
let buf = fs.readFileSync('src/app/aprobacion-facturas/page.tsx');
let str = buf.toString('utf8');
let match = str.match(/Hist(.)rico/);
if (match) {
    console.log("Character is:", match[1], "Hex:", match[1].charCodeAt(0).toString(16));
}
