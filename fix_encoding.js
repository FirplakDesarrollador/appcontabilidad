const fs = require('fs');
let content = fs.readFileSync('src/app/aprobacion-facturas/page.tsx', 'utf8');

// Replace corrupted unicode sequences
const replacements = {
    'ÃƒÂ³': 'ó',
    'ÃƒÂ¡': 'á',
    'ÃƒÂ': 'í',
    'ÃƒÂ©': 'é',
    'ÃƒÂ±': 'ñ',
    'ÃƒÂº': 'ú',
    'ÃƒÂ¼': 'ü',
    'Ãƒâ€': 'Á',
    'Ãƒâ€œ': 'Ó',
    'Ãƒâ€“': 'Ö',
    'Ãƒâ€š': 'Â',
    'HistÃ³rico': 'Histórico',
    'CreaciÃ³n': 'Creación',
    'AprobaciÃ³n': 'Aprobación',
    'GestiÃ³n': 'Gestión',
    'automÃ¡tica': 'automática',
    'bÃºsqueda': 'búsqueda',
    'PÃºblico': 'Público',
    'CachÃ©': 'Caché',
    'rÃ¡pido': 'rápido',
    'especÃ\xADfico': 'específico',
    'encontrarÃ¡': 'encontrará',
    'configurÃ³': 'configuró',
    'EstÃ¡s': 'Estás',
    'BÃ¡sica': 'Básica',
    'EstadÃ\xADsticas': 'Estadísticas',
    'InformaciÃ³n': 'Información',
    'conexiÃ³n': 'conexión',
    'aprobarÃ¡n': 'aprobarán',
    'TÃ\xADtulo': 'Título',
    'PaginaciÃ³n': 'Paginación',
    'Â¿Quitar': '¿Quitar',
    'Â¿EstÃ¡s': '¿Estás',
    'mÃ¡s': 'más',
    'Ã³': 'ó',
    'Ã¡': 'á',
    'Ã\xAD': 'í',
    'Ã©': 'é',
    'Ãº': 'ú',
    'Ã±': 'ñ'
};

for (const [bad, good] of Object.entries(replacements)) {
    content = content.split(bad).join(good);
}

fs.writeFileSync('src/app/aprobacion-facturas/page.tsx', content, 'utf8');
console.log('Fixed encoding in page.tsx');
