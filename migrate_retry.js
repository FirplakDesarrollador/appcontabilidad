const msal = require('@azure/msal-node');
const { Client } = require('@microsoft/microsoft-graph-client');
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const azureClientId = process.env.AZURE_CLIENT_ID;
const azureTenantId = process.env.AZURE_TENANT_ID;
const azureClientSecret = process.env.AZURE_CLIENT_SECRET;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    console.log('--- MIGRATION RETRY: BUCKET "Facturas" ---');
    
    const cca = new msal.ConfidentialClientApplication({
        auth: {
            clientId: azureClientId,
            authority: 'https://login.microsoftonline.com/' + azureTenantId,
            clientSecret: azureClientSecret,
        },
    });

    try {
        const tokenResponse = await cca.acquireTokenByClientCredential({
            scopes: ['https://graph.microsoft.com/.default'],
        });

        const client = Client.init({
            authProvider: (done) => done(null, tokenResponse.accessToken),
        });

        const driveId = 'b!rnmyBvDZJkK247bamM_WHalzDksPlgZBhqwuMJl31KweDlOzKQCTSYwL_HwOYFM_';
        const folderName = 'FACTURA-UBL(1013584354;FE117;2025-03-24;PRINCIPAL;PRINCIPAL)';
        const bucketName = 'Facturas'; // CORRECTED BUCKET NAME

        const reenvioFolderId = '01OC7VECOWIA74FRRR45G3BCZQ3WVLBRXV';
        const children = await client.api(`/drives/${driveId}/items/${reenvioFolderId}/children`).get();
        const targetFolder = children.value.find(i => i.name === folderName);

        if (!targetFolder) throw new Error('Folder not found in SharePoint');

        const files = await client.api(`/drives/${driveId}/items/${targetFolder.id}/children`).get();

        for (const file of files.value) {
            if (file.folder) continue; 
            console.log(`Migrating: ${file.name}...`);
            
            const downloadUrl = file['@microsoft.graph.downloadUrl'];
            const fileRes = await fetch(downloadUrl);
            const buffer = await fileRes.arrayBuffer();
            const storagePath = `${folderName}/${file.name}`;
            
            const { error: uploadError } = await supabase.storage
                .from(bucketName)
                .upload(storagePath, Buffer.from(buffer), { upsert: true });

            if (uploadError) {
                console.error(`Upload error for ${file.name}:`, uploadError.message);
            } else {
                console.log(`SUCCESS: ${file.name} migrated to "${bucketName}/${storagePath}"`);
            }
        }
    } catch (e) {
        console.error('Migration error:', e.message);
    }
}
run();
