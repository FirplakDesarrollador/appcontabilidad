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

const siteIdCache: Record<string, string> = {};
const listIdCache: Record<string, string> = {};     // key: `${siteId}::${listName}`
let globalUserMap: Map<string, string> | null = null;
let lastUserFetch: number = 0;
const USER_CACHE_TTL = 1000 * 60 * 30; // 30 minutos

async function getCachedSiteId(client: Client, siteSlug: string = 'FPKContabilidad'): Promise<string> {
    if (siteIdCache[siteSlug]) return siteIdCache[siteSlug];
    const siteResponse = await client.api(`/sites/firplaksa.sharepoint.com:/sites/${siteSlug}`).get();
    siteIdCache[siteSlug] = siteResponse.id;
    return siteResponse.id;
}

async function getCachedListId(client: Client, siteId: string, listName: string): Promise<string> {
    const cacheKey = `${siteId}::${listName}`;
    if (listIdCache[cacheKey]) return listIdCache[cacheKey];

    const listsResponse = await client.api(`/sites/${siteId}/lists`).get();
    const list = listsResponse.value.find((l: any) => l.name === listName || l.displayName === listName);
    if (!list) throw new Error(`SharePoint list "${listName}" not found`);

    listIdCache[cacheKey] = list.id;
    return list.id;
}

async function getCachedUserMap(client: Client, siteId: string): Promise<Map<string, string>> {
    const now = Date.now();
    if (globalUserMap && (now - lastUserFetch < USER_CACHE_TTL)) return globalUserMap;

    const userMap = new Map<string, string>();
    try {
        console.log("[SharePoint] Fetching User Information List...");
        let userNextLink: string | null = `/sites/${siteId}/lists('User Information List')/items?$select=id,fields&$expand=fields($select=Title)&$top=500`;
        while (userNextLink) {
            const userResponse = await client.api(userNextLink).get();
            for (const u of userResponse.value) {
                if (u.fields?.Title) userMap.set(String(u.id), u.fields.Title);
            }
            userNextLink = userResponse['@odata.nextLink']
                ? userResponse['@odata.nextLink'].split('v1.0')[1]
                : null;
        }
        globalUserMap = userMap;
        lastUserFetch = now;
        console.log(`[SharePoint] Loaded ${userMap.size} users into cache`);
    } catch (e: any) {
        console.warn('[SharePoint] Could not load User Information List:', e.message);
        if (!globalUserMap) globalUserMap = new Map();
    }
    return globalUserMap!;
}

async function fetchSharePointItemsToSync() {
    const client = await getGraphClient();
    const listName = 'Registro_de_Facturas';
    const siteId = await getCachedSiteId(client);
    const [listId, userMap] = await Promise.all([
        getCachedListId(client, siteId, listName),
        getCachedUserMap(client, siteId),
    ]);

    let firstUrl = `/sites/${siteId}/lists/${listId}/items?expand=fields&top=500&$filter=fields/Aprobacion_Doliente eq 'Por Aprobar'`;

    const firstResponse = await client.api(firstUrl)
        .header('Prefer', 'HonorNonIndexedQueriesWarningMayFailRandomly')
        .get();

    const mapItem = (item: any) => {
        const fields = item.fields || {};
        const lookupId = fields.ResponsabledeAutorizarLookupId
            || fields.ResponsableAprobarLookupId
            || fields.Responsable_de_AutorizarLookupId;
        return {
            id: item.id,
            ...fields,
            Responsable_de_Autorizar: lookupId ? (userMap.get(String(lookupId)) || null) : null,
        };
    };

    let allItems: any[] = firstResponse.value.map(mapItem);

    let nextLink: string | null = firstResponse['@odata.nextLink'] ? firstResponse['@odata.nextLink'].split('v1.0')[1] : null;

    while (nextLink) {
        const response = await client.api(nextLink)
            .header('Prefer', 'HonorNonIndexedQueriesWarningMayFailRandomly')
            .get();

        const pageItems = response.value.map(mapItem);
        allItems = [...allItems, ...pageItems];
        nextLink = response['@odata.nextLink'] ? response['@odata.nextLink'].split('v1.0')[1] : null;
    }
    return allItems;
}

function mapSharePointInvoiceToSupabase(item: any) {
    const hasAttachmentsFlag = item.Attachments === true || Number(item.Datos_adjuntos) > 0 || !!item.fp || !!item.documentos;

    return {
        ID: Number(item.id),
        sharepoint_id: String(item.id),
        Nit: item.Nit ?? item.Title ?? item.LinkTitle ?? null,
        Proveedor: item.Proveedor ?? null,
        Nro_Factura: item.Nro_Factura ?? null,
        Aprobacion_Doliente: item.Aprobacion_Doliente ?? null,
        Gestion_Contabilidad: item.Gestion_Contabilidad ?? null,
        Observaciones: item.Observaciones ?? null,
        Consecutivo: item.Consecutivo ?? null,
        Responsable_de_Autorizar: item.Responsable_de_Autorizar ?? null,
        FechaAprobacion: item.FechaAprobacion ?? null,
        centro_costos: item.centro_costos ?? null,
        Valor_total: item.Valortotal ?? item.Valor_x0020_total ?? item["Valor total"] ?? item.Valor_total ?? null,
        tiene_anticipo: item.tiene_anticipo ?? null,
        Creado: item.Created ?? item.Creado ?? null,
        Creado_por: item.AuthorLookupId ? String(item.AuthorLookupId) : (item["Creado por"] ?? item.Creado_por ?? null),
        CUFE: item.CUFE ?? null,
        InformeRecepcion: item.InformeRecepcion ?? null,
        FechaProcesado: item.FechaProcesado ?? null,
        DigitadoPor: item.DigitadoPor ?? null,
        Datos_adjuntos: hasAttachmentsFlag ? 1 : 0,
        tablaCostos: item.tablaCostos ?? null,
        Procesado: item.Procesado != null ? String(item.Procesado) : null,
        Modificado: item.Modified ?? item.Modificado ?? null,
        Modificado_por: item.EditorLookupId ? String(item.EditorLookupId) : (item["Modificado por"] ?? item.Modificado_por ?? null),
        fp: item.fp ?? null,
        documentos: item.fp ?? item.documentos ?? null,
        updated_at: new Date().toISOString()
    };
}


async function main() {
    try {
        console.log("Fetching SharePoint items with status 'Por Aprobar'...");
        const items = await fetchSharePointItemsToSync();
        console.log(`Found ${items.length} items in SharePoint.`);

        const mappedItems = items.map(mapSharePointInvoiceToSupabase);

        const { error } = await supabase
            .from('Registro_Facturas')
            .upsert(mappedItems, { onConflict: 'ID' });
            
        if (error) throw error;
        
        console.log(`Successfully synced ${mappedItems.length} items to Supabase.`);
    } catch (e) {
        console.error(e);
    }
}

main();
