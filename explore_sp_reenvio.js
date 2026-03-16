const msal = require('@azure/msal-node');
const { Client } = require('@microsoft/microsoft-graph-client');
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

        const siteId = 'firplaksa.sharepoint.com,06b279ae-d9f0-4226-b6e3-b6da98cfd61d,4b0e73a9-960f-4106-86ac-2e309977d4ac';
        const driveId = 'b!rnmyBvDZJkK247bamM_WHalzDksPlgZBhqwuMJl31KweDlOzKQCTSYwL_HwOYFM_';
        
        console.log('Listing content of "Documentos/Reenvio facture"...');
        
        // Find the folder first to be sure
        const items = await client.api(`/drives/${driveId}/root/children`).get();
        const reenvioFolder = items.value.find(i => i.name.toLowerCase().includes('envio') && i.name.toLowerCase().includes('factur'));
        
        if (reenvioFolder) {
            console.log(`Found folder: ${reenvioFolder.name} (ID: ${reenvioFolder.id})`);
            const children = await client.api(`/drives/${driveId}/items/${reenvioFolder.id}/children`).get();
            
            console.log('\n--- CONTENT ---');
            for (const child of children.value) {
                console.log(`- [${child.folder ? 'FOLDER' : 'FILE'}] ${child.name}`);
                
                // If it's a folder, list one level deeper (as requested "ver las carpetas con sus archivos")
                if (child.folder) {
                    const subChildren = await client.api(`/drives/${driveId}/items/${child.id}/children`).get();
                    subChildren.value.forEach(sc => {
                        console.log(`    - [${sc.folder ? 'FOLDER' : 'FILE'}] ${sc.name}`);
                    });
                }
            }
        } else {
            console.log('Folder "Reenvio facture" not found accurately.');
        }

    } catch (e) {
        console.error('Error:', e.body || e.message);
    }
}
run();
