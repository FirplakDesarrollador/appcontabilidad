const msal = require('@azure/msal-node');
const { Client } = require('@microsoft/microsoft-graph-client');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Manually parse .env
function loadEnv() {
    const envPath = path.join(__dirname, '.env');
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        envContent.split('\n').forEach(line => {
            const match = line.match(/^([^=]+)=(.*)$/);
            if (match) {
                const key = match[1].trim();
                let value = match[2].trim();
                if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
                    value = value.substring(1, value.length - 1);
                }
                process.env[key] = value;
            }
        });
    }
}

loadEnv();

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function run() {
    const cca = new msal.ConfidentialClientApplication({
        auth: {
            clientId: process.env.AZURE_CLIENT_ID,
            authority: 'https://login.microsoftonline.com/' + process.env.AZURE_TENANT_ID,
            clientSecret: process.env.AZURE_CLIENT_SECRET,
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
        const bucketName = 'facturas-documentos';

        // 1. Ensure Bucket Exists
        console.log(`Checking bucket: ${bucketName}...`);
        const { data: buckets } = await supabase.storage.listBuckets();
        const bucketExists = buckets?.find(b => b.name === bucketName);

        if (!bucketExists) {
            console.log(`Bucket ${bucketName} not found. Creating it...`);
            const { error: bucketError } = await supabase.storage.createBucket(bucketName, {
                public: true
            });
            if (bucketError) throw new Error(`Could not create bucket: ${bucketError.message}`);
            console.log(`Bucket ${bucketName} created successfully.`);
        } else {
            console.log(`Bucket ${bucketName} already exists.`);
        }

        // 2. Locate folder in SharePoint
        console.log(`Searching for SharePoint folder: ${folderName}...`);
        const reenvioFolderId = '01OC7VECOWIA74FRRR45G3BCZQ3WVLBRXV';
        const children = await client.api(`/drives/${driveId}/items/${reenvioFolderId}/children`).get();
        const targetFolder = children.value.find(i => i.name === folderName);

        if (!targetFolder) {
            throw new Error(`Target folder "${folderName}" not found in SharePoint!`);
        }

        console.log(`Found folder ID: ${targetFolder.id}. Listing files...`);
        const files = await client.api(`/drives/${driveId}/items/${targetFolder.id}/children`).get();

        // 3. Migrate Files
        for (const file of files.value) {
            if (file.folder) continue; 

            console.log(`Migrating: ${file.name}...`);
            
            const downloadUrl = file['@microsoft.graph.downloadUrl'];
            const fileRes = await fetch(downloadUrl);
            if (!fileRes.ok) throw new Error(`Failed to download ${file.name} from SharePoint`);
            
            const buffer = await fileRes.arrayBuffer();
            const contentType = fileRes.headers.get('content-type') || 'application/octet-stream';

            const storagePath = `${folderName}/${file.name}`;
            const { error: uploadError } = await supabase.storage
                .from(bucketName)
                .upload(storagePath, Buffer.from(buffer), {
                    contentType,
                    upsert: true
                });

            if (uploadError) {
                console.error(`Error uploading ${file.name} to Supabase:`, uploadError.message);
            } else {
                console.log(`Successfully migrated to: ${bucketName}/${storagePath}`);
            }
        }

        console.log('\nMigration execution finished successfully!');

    } catch (e) {
        console.error('\nCRITICAL ERROR:', e.message);
    }
}

run();
