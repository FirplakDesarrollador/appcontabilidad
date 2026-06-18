const fs = require('fs');

function updatePage(filePath, stateVar, setterFunc, linkVar) {
    let c = fs.readFileSync(filePath, 'utf8');

    // 1. Add initialResponsable state
    const stateRegex = new RegExp(`const \\\[${stateVar}, ${setterFunc}\\\] = useState[^\n]+;`);
    if (c.match(stateRegex) && !c.includes('const [initialResponsable, setInitialResponsable]')) {
        c = c.replace(stateRegex, match => `${match}\n    const [initialResponsable, setInitialResponsable] = useState<string | null>(null);`);
    }

    // 2. Add setter in fetch
    const fetchSetterRegex = new RegExp(`${setterFunc}\\(data\\);`);
    if (c.match(fetchSetterRegex) && !c.includes('setInitialResponsable(prev =>')) {
        c = c.replace(fetchSetterRegex, match => `${match}\n            setInitialResponsable(prev => prev === null ? (data.responsableActual || "") : prev);`);
    }

    // 3. Update links
    const linkRegex = new RegExp(`responsable=\\\\\\$\\\{encodeURIComponent\\(${linkVar}\\\?\\.responsableActual \\|\\| ""\\)\\\}`, 'g');
    c = c.replace(linkRegex, `responsable=\\\${encodeURIComponent(initialResponsable || ${linkVar}?.responsableActual || "")}`);

    fs.writeFileSync(filePath, c);
}

try {
    updatePage('src/app/externo/factura/[id]/page.tsx', 'invoice', 'setInvoice', 'invoice');
    updatePage('src/app/externo/documento/[id]/page.tsx', 'document', 'setDocument', 'document');
    console.log("Success");
} catch(e) {
    console.error(e);
}
