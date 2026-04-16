import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const envFile = readFileSync(join(dirname(__dirname), '.env.local'), 'utf-8');
envFile.split('\n').forEach(line => {
    const [key, ...vals] = line.split('=');
    if (key && vals.length) process.env[key.trim()] = vals.join('=').trim();
});

const { createClient } = await import('@supabase/supabase-js');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function aggressiveFlush() {
    console.log("🔥 INICIANDO PURGA AGRESIVA...");
    
    async function listAllFiles(path = '') {
        let allFiles = [];
        const { data, error } = await supabase.storage.from('facturas-documentos').list(path, { limit: 1000 });
        if (error) return [];
        
        for (const item of data) {
            const fullPath = path ? `${path}/${item.name}` : item.name;
            if (item.id === null) {
                // Carpeta
                const subFiles = await listAllFiles(fullPath);
                allFiles = allFiles.concat(subFiles);
            } else {
                // Archivo
                allFiles.push(fullPath);
            }
        }
        return allFiles;
    }

    const filesToDelete = await listAllFiles();
    console.log(`📋 Encontrados ${filesToDelete.length} archivos para borrar.`);
    
    if (filesToDelete.length > 0) {
        // Borrar en bloques de 100
        for (let i = 0; i < filesToDelete.length; i += 100) {
            const chunk = filesToDelete.slice(i, i + 100);
            console.log(`  🗑 Borrando bloque ${i/100 + 1}...`);
            const { error } = await supabase.storage.from('facturas-documentos').remove(chunk);
            if (error) console.error(`  ❌ Error: ${error.message}`);
        }
    }
    
    // Verificar si quedan carpetas vacías (en Supabase las carpetas desaparecen cuando no hay archivos)
    const { data: root } = await supabase.storage.from('facturas-documentos').list();
    console.log(`✨ Fin de purga. Items restantes en root: ${root?.length || 0}`);
}

aggressiveFlush();
