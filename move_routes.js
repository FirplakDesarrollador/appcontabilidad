const fs = require('fs');
const dirs = ['factura', 'factura-viventta', 'documento'];
dirs.forEach(d => {
    const baseDir = `src/app/api/externo/${d}/[id]/download`;
    const oldPath = `${baseDir}/route.ts`;
    const newDir = `${baseDir}/[[...filename]]`;
    const newPath = `${newDir}/route.ts`;
    if (fs.existsSync(oldPath)) {
        fs.mkdirSync(newDir, { recursive: true });
        fs.renameSync(oldPath, newPath);
        console.log('Moved', oldPath);
    }
});
