import { createClient } from '@supabase/supabase-js';
import * as msal from "@azure/msal-node";
import { Client } from "@microsoft/microsoft-graph-client";
import * as dotenv from 'dotenv';
import * as path from 'path';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const msalConfig = {
    auth: {
        clientId: process.env.AZURE_CLIENT_ID!,
        authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
        clientSecret: process.env.AZURE_CLIENT_SECRET!,
    }
};

const cca = new msal.ConfidentialClientApplication(msalConfig);

async function getAccessToken() {
    const tokenRequest = { scopes: ["https://graph.microsoft.com/.default"] };
    const response = await cca.acquireTokenByClientCredential(tokenRequest);
    return response?.accessToken;
}

const getGraphClient = async () => {
    const token = await getAccessToken();
    return Client.init({
        authProvider: (done) => { done(null, token!); },
        fetchOptions: { cache: 'no-store' }
    });
};

async function main() {
    try {
        console.log("Fetching 'POR PROCESAR' from Supabase...");
        const { data: supabaseItems, error } = await supabase
            .from('Registro_Facturas')
            .select('ID, Aprobacion_Doliente, Gestion_Contabilidad')
            .ilike('Gestion_Contabilidad', '%POR PROCESAR%');
            
        if (error) throw error;
        console.log(`Found ${supabaseItems.length} items to check.`);

        const client = await getGraphClient();
        const siteSlug = 'FPKContabilidad';
        const siteResponse = await client.api(`/sites/firplaksa.sharepoint.com:/sites/${siteSlug}`).get();
        const siteId = siteResponse.id;
        
        const listsResponse = await client.api(`/sites/${siteId}/lists`).get();
        const listName = 'Registro_de_Facturas';
        const list = listsResponse.value.find((l: any) => l.name === listName || l.displayName === listName);
        const listId = list.id;

        const updates = [];

        // Check each in SharePoint
        for (const item of supabaseItems) {
            try {
                const spResponse = await client.api(`/sites/${siteId}/lists/${listId}/items/${item.ID}?expand=fields($select=Aprobacion_Doliente,Gestion_Contabilidad)`).get();
                const spFields = spResponse.fields;
                
                if (spFields.Gestion_Contabilidad !== item.Gestion_Contabilidad || spFields.Aprobacion_Doliente !== item.Aprobacion_Doliente) {
                    console.log(`Mismatch found for ID ${item.ID}:`);
                    console.log(`  Supabase: [Aprobacion: ${item.Aprobacion_Doliente}, Gestion: ${item.Gestion_Contabilidad}]`);
                    console.log(`  SharePoint: [Aprobacion: ${spFields.Aprobacion_Doliente}, Gestion: ${spFields.Gestion_Contabilidad}]`);
                    
                    updates.push({
                        ID: item.ID,
                        Aprobacion_Doliente: spFields.Aprobacion_Doliente,
                        Gestion_Contabilidad: spFields.Gestion_Contabilidad
                    });
                }
            } catch (err: any) {
                // If 404, it might have been deleted in SP, ignore for now
                if (err.statusCode !== 404) {
                    console.error(`Error fetching ID ${item.ID} from SharePoint:`, err.message);
                }
            }
        }

        console.log(`Found ${updates.length} items to update in Supabase.`);
        
        if (updates.length > 0) {
            // Updating in batches of 50
            const batchSize = 50;
            for (let i = 0; i < updates.length; i += batchSize) {
                const batch = updates.slice(i, i + batchSize);
                const { error: upsertError } = await supabase
                    .from('Registro_Facturas')
                    .upsert(batch, { onConflict: 'ID' });
                
                if (upsertError) {
                    console.error("Error updating batch:", upsertError);
                } else {
                    console.log(`Updated batch ${Math.floor(i / batchSize) + 1}`);
                }
            }
            console.log("All updates completed successfully.");
        }

    } catch (e) {
        console.error(e);
    }
}

main();
