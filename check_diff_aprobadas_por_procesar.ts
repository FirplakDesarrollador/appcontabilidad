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
        console.log("=== APROBADAS Y POR PROCESAR ===");
        const { count: supabaseCount, error } = await supabase
            .from('Registro_Facturas')
            .select('*', { count: 'exact', head: true })
            .eq('Aprobacion_Doliente', 'Aprobado')
            .ilike('Gestion_Contabilidad', '%POR PROCESAR%');
            
        if (error) throw error;
        
        const sharepointCount = await getSharePointCount("fields/Aprobacion_Doliente eq 'Aprobado' and fields/Gestion_Contabilidad eq 'POR PROCESAR'");
        
        console.log(`Supabase 'Aprobado' & 'POR PROCESAR': ${supabaseCount}`);
        console.log(`SharePoint 'Aprobado' & 'POR PROCESAR': ${sharepointCount}`);
        console.log(`Difference: ${Math.abs(sharepointCount - (supabaseCount || 0))}`);
        
    } catch (e) {
        console.error(e);
    }
}

main();
