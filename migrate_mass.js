const msal = require('@azure/msal-node');
const { Client } = require('@microsoft/microsoft-graph-client');
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const azureClientId = process.env.AZURE_CLIENT_ID;
const azureTenantId = process.env.AZURE_TENANT_ID;
const azureClientSecret = process.env.AZURE_CLIENT_SECRET;

const supabase = createClient(supabaseUrl, supabaseKey);

const cca = new msal.ConfidentialClientApplication({
    auth: {
        clientId: azureClientId,
        authority: 'https://login.microsoftonline.com/' + azureTenantId,
        clientSecret: azureClientSecret,
    },
});

async function getGraphClient() {
    const tokenResponse = await cca.acquireTokenByClientCredential({
        scopes: ['https://graph.microsoft.com/.default'],
    });
    return Client.init({
        authProvider: (done) => done(null, tokenResponse.accessToken),
    });
}

async function run() {
    console.log('--- RESUMING MASS MIGRATION: SharePoint -> Supabase "Facturas" ---');
    
    try {
        let client = await getGraphClient();
        const driveId = 'b!rnmyBvDZJkK247bamM_WHalzDksPlgZBhqwuMJl31KweDlOzKQCTSYwL_HwOYFM_';
        const reenvioFolderId = '01OC7VECOWIA74FRRR45G3BCZQ3WVLBRXV';
        const bucketName = 'Facturas';

        console.log('Listing all folders in "Reenvio facture"...');
        let allFolders = [];
        let url = `/drives/${driveId}/items/${reenvioFolderId}/children`;
        
        while (url) {
            const res = await client.api(url).get();
            allFolders = allFolders.concat(res.value.filter(i => i.folder));
            url = res['@odata.nextLink'] ? res['@odata.nextLink'].replace('https://graph.microsoft.com/v1.0', '') : null;
        }

        console.log(`Found ${allFolders.length} folders in SharePoint.`);

        let successCount = 0;
        let fileCount = 0;
        let skipCount = 0;

        for (let i = 0; i < allFolders.length; i++) {
            const folder = allFolders[i];
            const rawFolderName = folder.name;
            const sanitizedFolderName = rawFolderName.replace(/;/g, '_');
            
            // Refresh token every 50 folders to avoid expiration
            if (i > 0 && i % 50 === 0) {
                console.log('Refreshing Graph token...');
                client = await getGraphClient();
            }

            // Check if folder exists in Supabase (simplified check: list folder)
            const { data: existingFiles } = await supabase.storage.from(bucketName).list(sanitizedFolderName);
            if (existingFiles && existingFiles.length > 0) {
                skipCount++;
                if (skipCount % 100 === 0) console.log(`Skipped ${skipCount} folders already migrated...`);
                continue;
            }

            console.log(`\n[${i + 1}/${allFolders.length}] Processing folder: ${rawFolderName}`);
            
            try {
                const files = await client.api(`/drives/${driveId}/items/${folder.id}/children`).get();
                
                for (const file of files.value) {
                    if (file.folder) continue;

                    const sanitizedFileName = file.name.replace(/;/g, '_');
                    const storagePath = `${sanitizedFolderName}/${sanitizedFileName}`;
                    
                    const downloadUrl = file['@microsoft.graph.downloadUrl'];
                    if (!downloadUrl) continue;

                    const fileRes = await fetch(downloadUrl);
                    if (!fileRes.ok) throw new Error(`Failed to download ${file.name}`);
                    
                    const buffer = await fileRes.arrayBuffer();
                    
                    const { error: uploadError } = await supabase.storage
                        .from(bucketName)
                        .upload(storagePath, Buffer.from(buffer), { upsert: true });

                    if (uploadError) {
                        console.error(`  - Error uploading ${file.name}:`, uploadError.message);
                    } else {
                        console.log(`  - Migrated: ${file.name}`);
                        fileCount++;
                    }
                }
                successCount++;
            } catch (err) {
                console.error(`  - Error processing folder ${rawFolderName}:`, err.message);
            }
        }

        console.log('\n--- MASS MIGRATION FINISHED ---');
        console.log(`Folders processed (new): ${successCount}`);
        console.log(`Folders skipped (existing): ${skipCount}`);
        console.log(`Total folders in SP: ${allFolders.length}`);
        console.log(`Total new files migrated: ${fileCount}`);

    } catch (e) {
        console.error('\nCRITICAL ERROR DURING MASS MIGRATION:', e.message);
    }
}

run();
