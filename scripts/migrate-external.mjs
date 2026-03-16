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

async function runMigration() {
    try {
        const response = await cca.acquireTokenByClientCredential({
            scopes: ['https://graph.microsoft.com/.default'],
        });
        const client = Client.init({
            authProvider: (done) => done(null, response.accessToken),
        });

        const BUCKET = 'facturas-documentos';
        const site = await client.api('/sites/firplaksa.sharepoint.com:/sites/ITPowerApps').get();
        const siteId = site.id;

        console.log("Fetching pending invoices from Supabase...");
        const { data: invoices, error: dbError } = await supabaseAdmin
            .from('Registro_Facturas')
            .select('ID, Nit, Proveedor, Nro_Factura')
            .is('documentos', null)
            .order('ID', { ascending: false })
            .limit(200);

        if (dbError) throw dbError;
        console.log(`Processing ${invoices.length} invoices...`);

        for (const inv of invoices) {
            let nit = inv.Nit;
            const nro = inv.Nro_Factura;

            if (!nit) {
                try {
                    const spItem = await client.api(`/sites/firplaksa.sharepoint.com:/sites/FPKContabilidad:/lists/Registro_de_Facturas/items/${inv.ID}?expand=fields`).get();
                    nit = spItem.fields.Title;
                } catch (e) {
                    continue;
                }
            }
            
            if (!nit || !nro) continue;
            const nitClean = String(nit).replace(/[^0-9]/g, '');

            console.log(`\nChecking Invoice ${inv.ID} (NIT: ${nit}, Nro: ${nro})...`);
            
            // Buscar por el número de factura
            const searchRes = await client.api(`/sites/${siteId}/drive/root/search(q='${nro}')`).get();
            const matches = searchRes.value.filter(item => 
                item.name.includes(nro) && 
                (item.name.replace(/[^0-9]/g, '').includes(nitClean) || item.name.includes(nitClean))
            );

            if (matches.length === 0) {
                console.log(`  - No matches found.`);
                continue;
            }

            const uploadedUrls = [];

            for (const match of matches) {
                if (match.folder) {
                    console.log(`  - Found folder: ${match.name}`);
                    const children = await client.api(`/drives/${match.parentReference.driveId}/items/${match.id}/children`).get();
                    for (const child of children.value) {
                        if (child.file && (child.name.toLowerCase().endsWith('.pdf') || child.name.toLowerCase().endsWith('.xml'))) {
                            const url = await migrateFile(child, inv.ID, client, BUCKET);
                            if (url) uploadedUrls.push(url);
                        }
                    }
                } else if (match.file && (match.name.toLowerCase().endsWith('.pdf') || match.name.toLowerCase().endsWith('.xml'))) {
                    console.log(`  - Found file: ${match.name}`);
                    const url = await migrateFile(match, inv.ID, client, BUCKET);
                    if (url) uploadedUrls.push(url);
                }
            }

            if (uploadedUrls.length > 0) {
                const uniqueUrls = [...new Set(uploadedUrls)];
                const docValue = uniqueUrls.length === 1 ? uniqueUrls[0] : JSON.stringify(uniqueUrls);
                
                await supabaseAdmin
                    .from('Registro_Facturas')
                    .update({ documentos: docValue })
                    .eq('ID', inv.ID);
                
                console.log(`  - SUCCESS: Migrated ${uniqueUrls.length} documents.`);
            }
        }

    } catch (e) {
        console.error('Migration fatal error:', e.message);
    }
}

async function migrateFile(file, invoiceId, client, bucket) {
    try {
        console.log(`    - Downloading ${file.name}...`);
        const fileStream = await client.api(`/drives/${file.parentReference.driveId}/items/${file.id}/content`).get();
        
        const chunks = [];
        for await (const chunk of fileStream) {
            chunks.push(chunk);
        }
        const buffer = Buffer.concat(chunks);

        const safeName = `${invoiceId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        // Usar application/pdf para PDFs, y text/xml o octet-stream para XML
        const contentType = file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'text/xml';

        const { error: uploadError } = await supabaseAdmin.storage
            .from(bucket)
            .upload(safeName, buffer, { contentType, upsert: true });

        if (uploadError) {
             // Re-intentar con octet-stream si falla
             const { error: secondTry } = await supabaseAdmin.storage
                .from(bucket)
                .upload(safeName, buffer, { contentType: 'application/octet-stream', upsert: true });
             if (secondTry) throw secondTry;
        }

        const { data: publicUrlData } = supabaseAdmin.storage.from(bucket).getPublicUrl(safeName);
        return publicUrlData.publicUrl;
    } catch (e) {
        console.error(`      - Error migrating file ${file.name}:`, e.message);
        return null;
    }
}

runMigration();
