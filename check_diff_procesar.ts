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

async function getSharePointCount(filter: string) {
    const client = await getGraphClient();
    const siteSlug = 'FPKContabilidad';
    const siteResponse = await client.api(`/sites/firplaksa.sharepoint.com:/sites/${siteSlug}`).get();
    const siteId = siteResponse.id;
    
    const listsResponse = await client.api(`/sites/${siteId}/lists`).get();
    const listName = 'Registro_de_Facturas';
    const list = listsResponse.value.find((l: any) => l.name === listName || l.displayName === listName);
    const listId = list.id;

    let count = 0;
    let nextLink: string | null = `/sites/${siteId}/lists/${listId}/items?$filter=${filter}`;
    
    while (nextLink) {
        const response = await client.api(nextLink)
            .header('Prefer', 'HonorNonIndexedQueriesWarningMayFailRandomly')
            .get();
        count += response.value.length;
        nextLink = response['@odata.nextLink'] ? response['@odata.nextLink'].split('v1.0')[1] : null;
    }
    return count;
}

async function main() {
    try {
        console.log("=== POR PROCESAR ===");
        const { count: supabasePorProcesar, error: e1 } = await supabase
            .from('Registro_Facturas')
            .select('*', { count: 'exact', head: true })
            .ilike('Gestion_Contabilidad', '%POR PROCESAR%');
            
        if (e1) throw e1;
        
        // In SharePoint, it might be 'POR PROCESAR' or 'Por Procesar'. 
        // We'll use startswith or just eq if it's exact. It's usually exact or we can just fetch all and filter in memory to be safe, but let's try eq first
        const sharepointPorProcesar = await getSharePointCount("fields/Gestion_Contabilidad eq 'POR PROCESAR'");
        
        console.log(`Supabase 'POR PROCESAR': ${supabasePorProcesar}`);
        console.log(`SharePoint 'POR PROCESAR': ${sharepointPorProcesar}`);
        console.log(`Difference: ${Math.abs(sharepointPorProcesar - (supabasePorProcesar || 0))}`);


        console.log("\n=== PROCESADO ===");
        const { count: supabaseProcesado, error: e2 } = await supabase
            .from('Registro_Facturas')
            .select('*', { count: 'exact', head: true })
            .eq('Gestion_Contabilidad', 'Procesado');
            
        if (e2) throw e2;
        
        const sharepointProcesado = await getSharePointCount("fields/Gestion_Contabilidad eq 'Procesado'");
        
        console.log(`Supabase 'Procesado': ${supabaseProcesado}`);
        console.log(`SharePoint 'Procesado': ${sharepointProcesado}`);
        console.log(`Difference: ${Math.abs(sharepointProcesado - (supabaseProcesado || 0))}`);
        
    } catch (e) {
        console.error(e);
    }
}

main();
