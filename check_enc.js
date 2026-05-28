const fs = require('fs');

// Read as raw bytes, maybe it was saved as ISO-8859-1 / Windows-1252
const buf = fs.readFileSync('src/app/aprobacion-facturas/page.tsx');

// Convert to string assuming it is latin1
let latin1Str = buf.toString('latin1');
// Does it contain proper accents if read as latin1?
const hasLatinAccents = latin1Str.includes('Histórico') || latin1Str.includes('Aprobación');

// Read as utf8
let utf8Str = buf.toString('utf8');
const hasUtf8Accents = utf8Str.includes('Histórico') || utf8Str.includes('Aprobación');

// Check for mangled
const hasMangled = utf8Str.includes('Histrico') || utf8Str.includes('Aprobacin');
const hasDoubleMangled = utf8Str.includes('HistÃ³rico') || utf8Str.includes('AprobaciÃ³n');

console.log({ hasLatinAccents, hasUtf8Accents, hasMangled, hasDoubleMangled });

