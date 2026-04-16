const msal = require('@azure/msal-node');
const { Client } = require('@microsoft/microsoft-graph-client');
const fs = require('fs');
const path = require('path');

// Manually parse .env since dotenv is not in dependencies
function loadEnv() {
    const envPath = path.join(__dirname, '.env');
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        envContent.split('\n').forEach(line => {
            const match = line.match(/^([^=]+)=(.*)$/);
            if (match) {
                const key = match[1].trim();
                let value = match[2].trim();
                // Remove quotes if present
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
    console.log('Using Client ID:', process.env.AZURE_CLIENT_ID);
    
    if (!process.env.AZURE_CLIENT_ID || !process.env.AZURE_TENANT_ID || !process.env.AZURE_CLIENT_SECRET) {
        console.error('Missing Azure credentials in .env');
        return;
    }

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

        console.log('Searching for site "IT Power Apps"...');
        const sites = await client.api('/sites?search=IT Power Apps').get();
        
        if (sites.value && sites.value.length > 0) {
            console.log(`Found ${sites.value.length} sites:`);
            for (const site of sites.value) {
                console.log(`- ${site.displayName} (ID: ${site.id}, URL: ${site.webUrl})`);
                
                // Explore this site
                console.log(`\nExploring drives for site: ${site.displayName}`);
                try {
                const drives = await client.api(`/sites/${site.id}/drives`).get();
                for (const drive of drives.value) {
                    console.log(`  - Drive: ${drive.name} (Type: ${drive.driveType}, ID: ${drive.id})`);
                    
                    // Root content
                    try {
                        const items = await client.api(`/drives/${drive.id}/root/children`).get();
                        for (const item of items.value) {
                            console.log(`    - [${item.folder ? 'FOLDER' : 'FILE'}] ${item.name}`);
                            
                            // If it's renvio facture (case insensitive check)
                            if (item.name.toLowerCase().includes('renvio facture')) {
                                console.log(`\n>>> CONTENT OF FOLDER "${item.name}":`);
                                const children = await client.api(`/drives/${drive.id}/items/${item.id}/children`).get();
                                children.value.forEach(c => {
                                    console.log(`      - [${c.folder ? 'FOLDER' : 'FILE'}] ${c.name}`);
                                });
                            }
                        }
                    } catch (driveErr) {
                        console.error(`    Error listing items in drive ${drive.name}:`, driveErr.message);
                    }
                }
                } catch (sitesErr) {
                    console.error(`  Error listing drives for site ${site.displayName}:`, sitesErr.message);
                }
            }
        } else {
            console.log('No sites found with that name using site search.');
        }
    } catch (e) {
        console.error('Error during execution:', e.body || e.message);
    }
}
run();
