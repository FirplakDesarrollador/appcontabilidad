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

async function getSharePointPendingIds() {
    const client = await getGraphClient();
    const siteSlug = 'FPKContabilidad';
    const siteResponse = await client.api(`/sites/firplaksa.sharepoint.com:/sites/${siteSlug}`).get();
    const siteId = siteResponse.id;
    
    const listsResponse = await client.api(`/sites/${siteId}/lists`).get();
    const listName = 'Registro_de_Facturas';
    const list = listsResponse.value.find((l: any) => l.name === listName || l.displayName === listName);
    const listId = list.id;

    let ids: number[] = [];
    let nextLink: string | null = `/sites/${siteId}/lists/${listId}/items?$filter=fields/Aprobacion_Doliente eq 'Por Aprobar'`;
    
    while (nextLink) {
        const response = await client.api(nextLink)
            .header('Prefer', 'HonorNonIndexedQueriesWarningMayFailRandomly')
            .get();
        response.value.forEach((v: any) => ids.push(Number(v.id)));
        nextLink = response['@odata.nextLink'] ? response['@odata.nextLink'].split('v1.0')[1] : null;
    }
    return ids;
}

async function main() {
    try {
        const { data: supabaseItems, error } = await supabase
            .from('Registro_Facturas')
            .select('ID')
            .eq('Aprobacion_Doliente', 'Por Aprobar');
            
        if (error) throw error;
        const supabaseIds = supabaseItems.map((i: any) => i.ID);

        const sharepointIds = await getSharePointPendingIds();

        console.log(`SharePoint IDs count: ${sharepointIds.length}`);
        console.log(`Supabase IDs count: ${supabaseIds.length}`);

        const missingInSupabase = sharepointIds.filter(id => !supabaseIds.includes(id));
        const extraInSupabase = supabaseIds.filter(id => !sharepointIds.includes(id));

        console.log(`IDs in SP but missing/not 'Por Aprobar' in Supabase:`, missingInSupabase);
        console.log(`IDs in Supabase 'Por Aprobar' but not in SP:`, extraInSupabase);
        
        if (missingInSupabase.length > 0) {
            console.log("Checking status in Supabase for these missing IDs...");
            const { data } = await supabase.from('Registro_Facturas').select('ID, Aprobacion_Doliente').in('ID', missingInSupabase);
            console.log(data);
        }

    } catch (e) {
        console.error(e);
    }
}

main();
