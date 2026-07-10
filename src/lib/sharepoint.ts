import * as msal from "@azure/msal-node";
import { Client } from "@microsoft/microsoft-graph-client";

const msalConfig = {
    auth: {
        clientId: process.env.AZURE_CLIENT_ID!,
        authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
        clientSecret: process.env.AZURE_CLIENT_SECRET!,
    }
};

const cca = new msal.ConfidentialClientApplication(msalConfig);

// ─── Caches en memoria del servidor ──────────────────────────────────────────
// Estos duran mientras el proceso Node corra. Se invalidan al reiniciar.
const siteIdCache: Record<string, string> = {};
const listIdCache: Record<string, string> = {};     // key: `${siteId}::${listName}`
let globalUserMap: Map<string, string> | null = null;
let lastUserFetch: number = 0;
const USER_CACHE_TTL = 1000 * 60 * 30; // 30 minutos

// ─── Auth ─────────────────────────────────────────────────────────────────────
async function getAccessToken() {
    const tokenRequest = { scopes: ["https://graph.microsoft.com/.default"] };
    const response = await cca.acquireTokenByClientCredential(tokenRequest);
    return response?.accessToken;
}

export async function getSharePointRESTToken() {
    const response = await cca.acquireTokenByClientCredential({
        scopes: ["https://firplaksa.sharepoint.com/.default"],
    });
    return response?.accessToken;
}

export const getGraphClient = async () => {
    const token = await getAccessToken();
    return Client.init({
        authProvider: (done) => { done(null, token!); },
        fetchOptions: {
            cache: 'no-store'
        }
    });
};

// ─── Helpers cacheados ────────────────────────────────────────────────────────
/** Obtiene el siteId con caché de memoria. Sólo hace la llamada Graph la primera vez. */
async function getCachedSiteId(client: Client, siteSlug: string = 'FPKContabilidad'): Promise<string> {
    if (siteIdCache[siteSlug]) return siteIdCache[siteSlug];
    const siteResponse = await client.api(`/sites/firplaksa.sharepoint.com:/sites/${siteSlug}`).get();
    siteIdCache[siteSlug] = siteResponse.id;
    return siteResponse.id;
}

/** Obtiene el listId con caché de memoria. */
async function getCachedListId(client: Client, siteId: string, listName: string): Promise<string> {
    const cacheKey = `${siteId}::${listName}`;
    if (listIdCache[cacheKey]) return listIdCache[cacheKey];

    const listsResponse = await client.api(`/sites/${siteId}/lists`).get();
    const list = listsResponse.value.find((l: any) => l.name === listName || l.displayName === listName);
    if (!list) throw new Error(`SharePoint list "${listName}" not found`);

    listIdCache[cacheKey] = list.id;
    return list.id;
}

/** Obtiene el mapa de usuarios con caché de 30 minutos. */
export async function getCachedUserMap(client: Client, siteId: string): Promise<Map<string, string>> {
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

/** 
 * Resuelve y asegura un usuario en SharePoint por correo electrónico.
 * Si el usuario no existe en la lista de información del sitio, lo agrega.
 */
export async function ensureSharePointUserByEmail(email: string): Promise<{ id: number, title: string } | null> {
    try {
        const client = await getGraphClient();
        const siteSlug = 'FPKContabilidad';
        
        // Obtenemos el siteId
        const siteResponse = await client.api(`/sites/firplaksa.sharepoint.com:/sites/${siteSlug}`).get();
        const siteId = siteResponse.id;

        // 1. Intentar buscar en la User Information List usando Microsoft Graph
        const cleanEmail = email.trim();
        try {
            const userInfoRes = await client.api(`/sites/${siteId}/lists('User Information List')/items`)
                .header('Prefer', 'HonorNonIndexedQueriesWarningMayFailRandomly')
                .expand('fields($select=id,EMail,Title)')
                .filter(`fields/EMail eq '${cleanEmail}'`)
                .get();

            if (userInfoRes && userInfoRes.value && userInfoRes.value.length > 0) {
                const user = userInfoRes.value[0];
                return {
                    id: user.fields.id || user.id,
                    title: user.fields.Title
                };
            }
        } catch (graphErr: any) {
            console.warn('[SharePoint] Graph filtered search failed, trying full list search:', graphErr.message);
        }

        // Búsqueda completa iterando por las páginas (porque puede haber miles de usuarios)
        try {
            let nextLink: string | null = `/sites/${siteId}/lists('User Information List')/items?$expand=fields($select=id,EMail,Title)&$top=500`;
            while (nextLink) {
                const allUsers = await client.api(nextLink).get();
                const foundUser = allUsers.value.find((u: any) =>
                    u.fields?.EMail?.toLowerCase() === cleanEmail.toLowerCase()
                );
                
                if (foundUser) {
                    return {
                        id: foundUser.fields.id || foundUser.id,
                        title: foundUser.fields.Title
                    };
                }
                nextLink = allUsers['@odata.nextLink'] ? allUsers['@odata.nextLink'].split('v1.0')[1] : null;
            }
        } catch (fullSearchErr: any) {
            console.warn('[SharePoint] Graph pagination search failed:', fullSearchErr.message);
        }

        // Si el usuario no está en la lista de información del sitio, no podemos asegurar el usuario usando un token de App-Only 
        // porque _api/web/ensureuser retorna "Unsupported app only token". 
        // Tendremos que pedir que el usuario acceda a la lista al menos una vez, o usar otra estrategia si es necesario.
        console.warn(`[SharePoint] El usuario ${cleanEmail} no se encuentra en la User Information List y ensureuser no es compatible con tokens App-Only.`);

    } catch (e) {
        console.error('[SharePoint] Exception in ensureUser:', e);
    }
    return null;
}

// ─── fetchAllSharePointItems (optimizado) ─────────────────────────────────────
export async function fetchAllSharePointItems(
    listName: string = 'Registro_de_Facturas',
    limit: number = 0,
    filter: string = ''
) {
    try {
        const client = await getGraphClient();

        // Resuelve siteId y listId con caché (0 round-trips extra si ya están cacheados)
        const siteId = await getCachedSiteId(client);
        const [listId, userMap] = await Promise.all([
            getCachedListId(client, siteId, listName),
            getCachedUserMap(client, siteId),
        ]);

        const pageSize = 500;
        const top = limit > 0 ? Math.min(limit, pageSize) : pageSize;

        // Primera página
        let firstUrl = `/sites/${siteId}/lists/${listId}/items?expand=fields&top=${top}`;
        if (filter) firstUrl += `&filter=${encodeURIComponent(filter)}`;

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
        console.log(`[SharePoint] First page: ${allItems.length} items`);

        // Si no hay más páginas o ya llegamos al límite, retornar
        if (!firstResponse['@odata.nextLink'] || (limit > 0 && allItems.length >= limit)) {
            return limit > 0 ? allItems.slice(0, limit) : allItems;
        }

        // Recopilar todos los nextLinks para hacer las páginas en paralelo (donde sea posible)
        // Primero recorrer todos los nextLinks secuencialmente para descubrirlos,
        // o bien hacer fetch en streaming — aquí usamos la estrategia de pipeline de 3 páginas en paralelo
        const PARALLEL_PAGES = 3;
        let nextLink: string | null = firstResponse['@odata.nextLink'].split('v1.0')[1];

        while (nextLink) {
            // Preparar hasta PARALLEL_PAGES páginas en paralelo
            const batch: Promise<any>[] = [];
            let tempLink: string | null = nextLink;

            // Lanzar PARALLEL_PAGES requests simultáneos (requiere conocer los nextLinks)
            // Como Graph no provee todos los nextLinks de antemano, hacemos streaming de a 1 pero
            // aceleramos con timeout y sin esperar el loop serial.
            // Estrategia: 1 página a la vez pero reutilizando la conexión ya autenticada
            const response = await client.api(tempLink)
                .header('Prefer', 'HonorNonIndexedQueriesWarningMayFailRandomly')
                .get();

            const pageItems = response.value.map(mapItem);
            allItems = [...allItems, ...pageItems];
            console.log(`[SharePoint] Fetched ${allItems.length} items total`);

            if (limit > 0 && allItems.length >= limit) {
                allItems = allItems.slice(0, limit);
                break;
            }

            nextLink = response['@odata.nextLink'] ? response['@odata.nextLink'].split('v1.0')[1] : null;
        }

        return allItems;
    } catch (error) {
        console.error(`SharePoint full fetch error for ${listName}:`, error);
        throw error;
    }
}

// ─── Resto de funciones (sin cambios, sólo optimizadas para usar helpers) ─────

export async function updateSharePointInvoiceStatus(invoiceNumber: string, action: 'Aprobado' | 'Rechazado') {
    try {
        const client = await getGraphClient();
        const siteId = await getCachedSiteId(client);
        const listId = await getCachedListId(client, siteId, 'Registro_de_Facturas');

        const itemsResponse = await client.api(`/sites/${siteId}/lists/${listId}/items`)
            .expand('fields')
            .filter(`fields/Nro_Factura eq '${invoiceNumber}'`)
            .get();

        if (itemsResponse.value.length === 0) {
            console.warn(`No SharePoint item found with Nro_Factura: ${invoiceNumber}`);
            return false;
        }

        const itemId = itemsResponse.value[0].id;
        await client.api(`/sites/${siteId}/lists/${listId}/items/${itemId}/fields`).patch({
            Aprobacion_Doliente: action
        });

        console.log(`SharePoint item ${invoiceNumber} updated to ${action}`);
        return true;
    } catch (error) {
        console.error('SharePoint update error:', error);
        throw error;
    }
}

export async function getSharePointInvoices(page: number = 1, pageSize: number = 50) {
    try {
        const client = await getGraphClient();
        const skip = (page - 1) * pageSize;
        const top = page * pageSize;

        const siteId = await getCachedSiteId(client);
        const listId = await getCachedListId(client, siteId, 'Registro_de_Facturas');

        const itemsResponse = await client.api(`/sites/${siteId}/lists/${listId}/items`)
            .expand('fields')
            .top(top)
            .get();

        const allItems = itemsResponse.value || [];
        const pageItems = allItems.slice(skip, skip + pageSize);

        return {
            items: pageItems.map((item: any) => ({ id: item.id, ...item.fields })),
            hasMore: !!itemsResponse['@odata.nextLink'] || allItems.length >= top
        };
    } catch (error) {
        console.error('SharePoint fetch error:', error);
        throw error;
    }
}

export async function getSharePointItemById(itemId: string, listName: string = 'Registro_de_Facturas') {
    try {
        const client = await getGraphClient();
        const siteId = await getCachedSiteId(client);
        const listId = await getCachedListId(client, siteId, listName);

        const item = await client.api(`/sites/${siteId}/lists/${listId}/items/${itemId}`)
            .expand('fields')
            .get();

        let attachments: any[] = [];
        try {
            const restToken = await getSharePointRESTToken();
            const restUrl = `https://firplaksa.sharepoint.com/sites/FPKContabilidad/_api/web/lists(guid'${listId}')/items(${itemId})/AttachmentFiles`;
            const restRes = await fetch(restUrl, {
                headers: {
                    'Authorization': `Bearer ${restToken}`,
                    'Accept': 'application/json;odata=nometadata'
                }
            });
            if (restRes.ok) {
                const restData = await restRes.json();
                attachments = (restData.value || []).map((a: any) => ({
                    name: a.FileName,
                    serverRelativeUrl: a.ServerRelativeUrl
                }));
            }
        } catch (restErr) {
            console.error("Error fetching attachments via REST for item " + itemId, restErr);
        }

        if (attachments.length === 0 && item.fields.Attachments === true) {
            attachments.push({
                name: 'Ver en SharePoint',
                serverRelativeUrl: `/Lists/${listName}/DispForm.aspx?ID=${itemId}`,
                isNative: true
            });
        }

        const fields = item.fields || {};
        const lookupId = fields.ResponsabledeAutorizarLookupId
            || fields.ResponsableAprobarLookupId
            || fields.Responsable_de_AutorizarLookupId;
        let responsableName = null;

        if (lookupId) {
            try {
                const userRes = await client.api(`/sites/${siteId}/lists('User Information List')/items/${lookupId}`)
                    .expand('fields($select=Title)')
                    .get();
                responsableName = userRes.fields?.Title || null;
            } catch (e) {
                console.warn(`Could not resolve responsable for ID ${lookupId}`);
            }
        }

        return {
            id: item.id,
            ...fields,
            Responsable_de_Autorizar: responsableName || fields.Responsable_de_Autorizar || null,
            rawAttachments: attachments
        };
    } catch (error) {
        console.error(`Error fetching SharePoint item ${itemId} from ${listName}:`, error);
        throw error;
    }
}

export async function getSharePointInvoiceById(itemId: string) {
    return getSharePointItemById(itemId, 'Registro_de_Facturas');
}

export async function findExternalInvoiceDocument(nit: string, nroFactura: string, dateStr: string) {
    try {
        const caGraph = await cca.acquireTokenByClientCredential({
            scopes: ['https://graph.microsoft.com/.default'],
        });
        const client = Client.init({
            authProvider: (done) => done(null, caGraph!.accessToken),
        });

        let siteId = siteIdCache['ITPowerApps'];
        if (!siteId) {
            const site = await client.api('/sites/firplaksa.sharepoint.com:/sites/ITPowerApps').get();
            siteId = site.id;
            siteIdCache['ITPowerApps'] = siteId;
        }

        const cleanNitFull = nit.replace(/[^0-9]/g, '');
        const nitParts = nit.split('-');
        const nitWithoutDV = nitParts[0].replace(/[^0-9]/g, '');

        const query = `${nroFactura}`;
        console.log(`[SharePoint Search] Searching for "${query}" in ITPowerApps (NIT: ${nitWithoutDV})...`);
        const searchRes = await client.api(`/sites/${siteId}/drive/root/search(q='${query}')`).get();

        const items = searchRes.value || [];
        const matches = items.filter((item: any) => {
            if (!item.folder) return false;
            const folderName = item.name;
            if (!folderName.includes('FACTURA-UBL(')) return false;
            const contentMatch = folderName.match(/\(([^)]+)\)/);
            if (!contentMatch) return false;
            const parts = contentMatch[1].split(';');
            if (parts.length < 2) return false;
            const folderNit = parts[0].trim().replace(/[^0-9]/g, '');
            const folderNro = parts[1].trim();
            const nroMatches = folderNro === nroFactura;
            if (nroMatches) {
                console.log(`[SharePoint Search] Potential match by NRO: ${folderName}`);
                const nitMatches = folderNit === cleanNitFull || folderNit === nitWithoutDV;
                if (nitMatches) item.isPerfectMatch = true;
                return true;
            }
            return false;
        });

        const bestMatch = (matches as any[]).sort((a, b) => (b.isPerfectMatch ? 1 : 0) - (a.isPerfectMatch ? 1 : 0))[0];

        if (bestMatch) {
            console.log(`[SharePoint Search] Selected match: ${bestMatch.name}`);
            const children = await client.api(`/drives/${bestMatch.parentReference.driveId}/items/${bestMatch.id}/children`).get();
            const pdf = children.value.find((c: any) => c.name.toLowerCase().endsWith('.pdf'));
            if (pdf) {
                return {
                    id: pdf.id,
                    driveId: bestMatch.parentReference.driveId,
                    fileName: pdf.name,
                    webUrl: pdf.webUrl,
                    downloadUrl: pdf['@microsoft.graph.downloadUrl']
                };
            }
        }

        console.warn(`[SharePoint Search] No matching folder found for Invoice ${nroFactura}`);
        return null;
    } catch (error) {
        console.error('Error finding external document:', error);
        return null;
    }
}

export async function createSharePointFolder(siteId: string, parentPath: string, folderName: string) {
    try {
        const client = await getGraphClient();
        return await client.api(`/sites/${siteId}/drive/root:/${parentPath}:/children`).post({
            name: folderName,
            folder: {},
            "@microsoft.graph.conflictBehavior": "replace"
        });
    } catch (error) {
        console.error('Error creating SharePoint folder:', error);
        throw error;
    }
}

export async function uploadFileToSharePoint(siteId: string, folderId: string, fileName: string, fileBuffer: Buffer) {
    try {
        const client = await getGraphClient();
        return await client.api(`/sites/${siteId}/drive/items/${folderId}:/${fileName}:/content`).put(fileBuffer);
    } catch (error) {
        console.error('Error uploading file to SharePoint:', error);
        throw error;
    }
}

export async function createSharePointListItem(siteId: string, listName: string, fields: Record<string, any>) {
    try {
        const client = await getGraphClient();
        const listId = await getCachedListId(client, siteId, listName);
        return await client.api(`/sites/${siteId}/lists/${listId}/items`).post({ fields });
    } catch (error) {
        console.error('Error creating SharePoint list item:', error);
        throw error;
    }
}
