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

const { ConfidentialClientApplication } = await import('@azure/msal-node');
const { Client } = await import('@microsoft/microsoft-graph-client');
const { createClient } = await import('@supabase/supabase-js');

const cca = new ConfidentialClientApplication({
    auth: {
        clientId: process.env.AZURE_CLIENT_ID,
        authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
        clientSecret: process.env.AZURE_CLIENT_SECRET,
    },
});

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function getClient() {
    const response = await cca.acquireTokenByClientCredential({
        scopes: ['https://graph.microsoft.com/.default'],
    });
    return Client.init({
        authProvider: (done) => done(null, response.accessToken),
    });
}

async function bulkMigration() {
    try {
        let client = await getClient();
        const BUCKET = 'facturas-documentos';
        const site = await client.api('/sites/firplaksa.sharepoint.com:/sites/ITPowerApps').get();
        const siteId = site.id;

        console.log("🚀 Iniciando Migración Masiva Definitiva...");

        // Caché de base de datos para mapeo rápido
        const { data: dbRecords } = await supabaseAdmin
            .from('Registro_Facturas')
            .select('ID, Nit, Nro_Factura');
        
        const dbCache = (dbRecords || []).map(inv => ({
            id: inv.ID,
            nitClean: (inv.Nit || '').toString().replace(/[^0-9]/g, ''),
            factura: (inv.Nro_Factura || '').toString().trim()
        }));

        console.log(`📊 Cargadas ${dbCache.length} facturas de la base de datos para mapeo.`);

        let nextLink = `/sites/${siteId}/drive/root:/Reenvio facture:/children?$top=100`;
        let folderCount = 0;
        let lastAuthTime = Date.now();

        while (nextLink) {
            if (Date.now() - lastAuthTime > 30 * 60 * 1000) {
                client = await getClient();
                lastAuthTime = Date.now();
            }

            const res = await client.api(nextLink).get();
            const folders = res.value || [];
            
            for (const spFolder of folders) {
                if (!spFolder.folder) continue;
                folderCount++;
                
                const folderName = spFolder.name;
                console.log(`\n📂 [${folderCount}] Carpeta: ${folderName}`);

                const children = await client.api(`/drives/${spFolder.parentReference.driveId}/items/${spFolder.id}/children`).get();
                
                for (const file of children.value) {
                    if (!file.file) continue;
                    const fileName = file.name;
                    if (!fileName.toLowerCase().endsWith('.pdf') && !fileName.toLowerCase().endsWith('.xml')) continue;

                    console.log(`  📄 Subiendo: ${fileName}...`);
                    try {
                        const content = await client.api(`/drives/${spFolder.parentReference.driveId}/items/${file.id}/content`).get();
                        const chunks = [];
                        for await (const chunk of content) chunks.push(chunk);
                        const buffer = Buffer.concat(chunks);

                        const storagePath = `${folderName}/${fileName}`;
                        const contentType = fileName.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream';

                        const { error: uploadError } = await supabaseAdmin.storage
                            .from(BUCKET)
                            .upload(storagePath, buffer, { contentType, upsert: true });

                        if (uploadError) {
                            console.error(`    ❌ Error Supabase Storage: ${uploadError.message}`);
                        } else {
                            const { data: { publicUrl } } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(storagePath);
                            console.log(`    ✅ Subido: ${storagePath}`);

                            const match = folderName.match(/\(([^)]+)\)/);
                            if (match) {
                                const parts = match[1].split(';');
                                if (parts.length >= 2) {
                                    const nitBase = parts[0].trim().split('-')[0].replace(/[^0-9]/g, '');
                                    const factura = parts[1].trim();

                                    const found = dbCache.find(inv => {
                                        const dbNitBase = inv.nitClean.substring(0, nitBase.length);
                                        return dbNitBase === nitBase && inv.factura === factura;
                                    });

                                    if (found) {
                                        const { error: updateErr } = await supabaseAdmin
                                            .from('Registro_Facturas')
                                            .update({ documentos: publicUrl })
                                            .eq('ID', found.id);
                                        
                                        if (!updateErr) {
                                            console.log(`      🔗 Mapeado a factura ID: ${found.id}`);
                                        } else {
                                            console.error(`      ❌ Error al actualizar DB: ${updateErr.message}`);
                                        }
                                    } else {
                                        console.log(`      ❓ No match for NIT: ${nitClean}, Factura: ${factura}`);
                                    }
                                }
                            }
                        }
                    } catch (e) {
                        console.error(`    ❌ Error descarga SP: ${e.message}`);
                    }
                }
            }
            nextLink = res['@odata.nextLink'] ? res['@odata.nextLink'].split('v1.0')[1] : null;
        }
    } catch (e) {
        console.error('❌ Error fatal:', e.message);
    }
}

bulkMigration();
