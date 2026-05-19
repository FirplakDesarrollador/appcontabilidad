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

// Cache for Site IDs and Users to avoid redundant API calls
const siteIdCache: Record<string, string> = {};
let globalUserMap: Map<string, string> | null = null;
let lastUserFetch: number = 0;
const USER_CACHE_TTL = 1000 * 60 * 30; // 30 minutes

async function getAccessToken() {
    const tokenRequest = {
        scopes: ["https://graph.microsoft.com/.default"],
    };
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
        authProvider: (done) => {
            done(null, token!);
        },
    });
};

export async function updateSharePointInvoiceStatus(invoiceNumber: string, action: 'Aprobado' | 'Rechazado') {
    try {
        const client = await getGraphClient();

        // 1. Resolve Site ID
        // The URL is https://firplaksa.sharepoint.com/sites/FPKContabilidad
        // We can get the site details by hostname and path
        const siteResponse = await client.api('/sites/firplaksa.sharepoint.com:/sites/FPKContabilidad').get();
        const siteId = siteResponse.id;

        // 2. Find the List
        const listsResponse = await client.api(`/sites/${siteId}/lists`).get();
        const list = listsResponse.value.find((l: any) => l.name === 'Registro_de_Facturas' || l.displayName === 'Registro_de_Facturas');

        if (!list) throw new Error('SharePoint list "Registro_de_Facturas" not found');
        const listId = list.id;

        // 3. Find the Item by Invoice Number
        // We assume 'Nro_Factura' is the internal name of the column in SharePoint
        const itemsResponse = await client.api(`/sites/${siteId}/lists/${listId}/items`)
            .expand('fields')
            .filter(`fields/Nro_Factura eq '${invoiceNumber}'`)
            .get();

        if (itemsResponse.value.length === 0) {
            console.warn(`No SharePoint item found with Nro_Factura: ${invoiceNumber}`);
            return false;
        }

        const itemId = itemsResponse.value[0].id;

        // 4. Update the Item
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

        // 1. Resolve Site ID
        const siteResponse = await client.api('/sites/firplaksa.sharepoint.com:/sites/FPKContabilidad').get();
        const siteId = siteResponse.id;

        // 2. Find the List
        const listsResponse = await client.api(`/sites/${siteId}/lists`).get();
        const list = listsResponse.value.find((l: any) => l.name === 'Registro_de_Facturas' || l.displayName === 'Registro_de_Facturas');

        if (!list) throw new Error('SharePoint list "Registro_de_Facturas" not found');
        const listId = list.id;

        // 3. Get Items with fields
        const itemsResponse = await client.api(`/sites/${siteId}/lists/${listId}/items`)
            .expand('fields')
            .top(top)
            .get();

        const allItems = itemsResponse.value || [];
        const pageItems = allItems.slice(skip, skip + pageSize);

        return {
            items: pageItems.map((item: any) => ({
                id: item.id,
                ...item.fields
            })),
            hasMore: !!itemsResponse['@odata.nextLink'] || allItems.length >= top
        };
    } catch (error) {
        console.error('SharePoint fetch error:', error);
        throw error;
    }
}

export async function fetchAllSharePointItems(listName: string = 'Registro_de_Facturas', limit: number = 0, filter: string = '') {
    try {
        const client = await getGraphClient();

        // 1. Resolve Site ID
        const siteResponse = await client.api('/sites/firplaksa.sharepoint.com:/sites/FPKContabilidad').get();
        const siteId = siteResponse.id;

        // 2. Find the List
        const listsResponse = await client.api(`/sites/${siteId}/lists`).get();
        const list = listsResponse.value.find((l: any) => l.name === listName || l.displayName === listName);

        if (!list) throw new Error(`SharePoint list "${listName}" not found`);
        const listId = list.id;

        // 3. Fetch the "User Information List" to resolve IDs to names (with caching)
        const now = Date.now();
        if (!globalUserMap || (now - lastUserFetch > USER_CACHE_TTL)) {
            const userMap = new Map<string, string>();
            try {
                console.log("[SharePoint] Fetching User Information List...");
                let userNextLink: string | null = `/sites/${siteId}/lists('User Information List')/items?$select=id,fields&$expand=fields($select=Title)&$top=500`;
                while (userNextLink) {
                    const userResponse = await client.api(userNextLink).get();
                    for (const u of userResponse.value) {
                        if (u.fields?.Title) {
                            userMap.set(String(u.id), u.fields.Title);
                        }
                    }
                    userNextLink = userResponse['@odata.nextLink'] ? userResponse['@odata.nextLink'].split('v1.0')[1] : null;
                }
                globalUserMap = userMap;
                lastUserFetch = now;
                console.log(`[SharePoint] Loaded ${userMap.size} users into cache`);
            } catch (e: any) {
                console.warn('[SharePoint] Could not load User Information List:', e.message);
                if (!globalUserMap) globalUserMap = new Map();
            }
        }
        const userMap = globalUserMap;

        // 4. Iterative Fetch of list items
        let allItems: any[] = [];
        const top = limit > 0 ? Math.min(limit, 500) : 500;
        let nextLink: string | null = `/sites/${siteId}/lists/${listId}/items?expand=fields&top=${top}`;
        
        if (filter) {
            nextLink += `&filter=${encodeURIComponent(filter)}`;
        }

        console.log(`Starting SharePoint fetch for list: ${listName}, limit: ${limit || 'none'}, filter: ${filter || 'none'}...`);

        while (nextLink) {
            const response = await client.api(nextLink)
                .header('Prefer', 'HonorNonIndexedQueriesWarningMayFailRandomly')
                .get();
            const items = response.value.map((item: any) => {
                const fields = item.fields || {};
                
                // Resolve Responsable lookup
                // Registro_de_Facturas use: ResponsabledeAutorizarLookupId
                // Documento_Soporte use: ResponsableAprobarLookupId
                const lookupId = fields.ResponsabledeAutorizarLookupId || fields.ResponsableAprobarLookupId || fields.Responsable_de_AutorizarLookupId;
                const responsableName = lookupId ? userMap.get(String(lookupId)) : null;

                return {
                    id: item.id,
                    ...fields,
                    Responsable_de_Autorizar: responsableName || null,
                };
            });
            allItems = [...allItems, ...items];

            // Check if we reached the limit
            if (limit > 0 && allItems.length >= limit) {
                allItems = allItems.slice(0, limit);
                break;
            }

            nextLink = response['@odata.nextLink'] ? response['@odata.nextLink'].split('v1.0')[1] : null;
            console.log(`Fetched ${allItems.length} items so far...`);
        }

        return allItems;
    } catch (error) {
        console.error(`SharePoint full fetch error for ${listName}:`, error);
        throw error;
    }
}


export async function getSharePointItemById(itemId: string, listName: string = 'Registro_de_Facturas') {
    try {
        const client = await getGraphClient();

        // 1. Resolve Site ID
        const siteResponse = await client.api('/sites/firplaksa.sharepoint.com:/sites/FPKContabilidad').get();
        const siteId = siteResponse.id;

        // 2. Find the List
        const listsResponse = await client.api(`/sites/${siteId}/lists`).get();
        const list = listsResponse.value.find((l: any) => l.name === listName || l.displayName === listName);

        if (!list) throw new Error(`SharePoint list "${listName}" not found`);
        const listId = list.id;

        // 3. Fetch specific item
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
                const results = restData.value || [];
                attachments = results.map((a: any) => ({
                    name: a.FileName,
                    serverRelativeUrl: a.ServerRelativeUrl
                }));
            }
        } catch (restErr) {
            console.error("Error fetching attachments via REST for item " + itemId, restErr);
        }

        // Fallback for attachments link
        if (attachments.length === 0 && item.fields.Attachments === true) {
            attachments.push({
                name: 'Ver en SharePoint',
                serverRelativeUrl: `/Lists/${listName}/DispForm.aspx?ID=${itemId}`,
                isNative: true
            });
        }

        // 4. Resolve Responsable lookup
        const fields = item.fields || {};
        const lookupId = fields.ResponsabledeAutorizarLookupId || fields.ResponsableAprobarLookupId || fields.Responsable_de_AutorizarLookupId;
        let responsableName = null;

        if (lookupId) {
            try {
                const userRes = await client.api(`/sites/${siteId}/lists('User Information List')/items/${lookupId}`).expand('fields($select=Title)').get();
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

        // 1. Obtener Site ID de ITPowerApps (con caché)
        let siteId = siteIdCache['ITPowerApps'];
        if (!siteId) {
            const site = await client.api('/sites/firplaksa.sharepoint.com:/sites/ITPowerApps').get();
            siteId = site.id;
            siteIdCache['ITPowerApps'] = siteId;
        }
        
        // Limpiar el NIT de caracteres no numéricos
        const cleanNitFull = nit.replace(/[^0-9]/g, '');
        // NIT sin el último dígito (asumiendo que es el dígito de verificación si viene de un formato con guión)
        const nitParts = nit.split('-');
        const nitWithoutDV = nitParts[0].replace(/[^0-9]/g, '');
        
        // 2. Buscar por el número de factura o el NIT en el sitio
        // Intentamos una búsqueda que combine ambos para ser más precisos
        const query = `${nroFactura}`;
        console.log(`[SharePoint Search] Searching for "${query}" in ITPowerApps (NIT: ${nitWithoutDV})...`);
        const searchRes = await client.api(`/sites/${siteId}/drive/root/search(q='${query}')`).get();
        
        // 3. Filtrar resultados que coincidan con el NIT y el número de factura
        const items = searchRes.value || [];
        
        // Intentar encontrar carpetas que contengan los datos con lógica más flexible
        const matches = items.filter((item: any) => {
            if (!item.folder) return false;
            const folderName = item.name;
            
            // Patrón esperado: FACTURA-UBL(NIT;NRO;...)
            if (!folderName.includes('FACTURA-UBL(')) return false;
            
            // Extraer el contenido entre paréntesis
            const contentMatch = folderName.match(/\(([^)]+)\)/);
            if (!contentMatch) return false;
            
            const parts = contentMatch[1].split(';');
            if (parts.length < 2) return false;
            
            const folderNit = parts[0].trim().replace(/[^0-9]/g, '');
            const folderNro = parts[1].trim();
            
            // Comparar número de factura (prioridad absoluta según el usuario)
            const nroMatches = folderNro === nroFactura;
            
            if (nroMatches) {
                console.log(`[SharePoint Search] Potential match by NRO: ${folderName}`);
                // Si el NIT también coincide, es un "Perfect Match"
                const nitMatches = folderNit === cleanNitFull || folderNit === nitWithoutDV;
                if (nitMatches) {
                    item.isPerfectMatch = true;
                }
                // Si coincide el número de factura, lo dejamos pasar
                return true; 
            }
            
            return false;
        });

        // Ordenar: primero los que coinciden en NIT, luego el resto
        const bestMatch = (matches as any[]).sort((a, b) => (b.isPerfectMatch ? 1 : 0) - (a.isPerfectMatch ? 1 : 0))[0];

        if (bestMatch) {
            console.log(`[SharePoint Search] Selected match: ${bestMatch.name}`);
            // 4. Si encontramos la carpeta, buscar el PDF dentro
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
        const response = await client.api(`/sites/${siteId}/drive/root:/${parentPath}:/children`).post({
            name: folderName,
            folder: {},
            "@microsoft.graph.conflictBehavior": "replace"
        });
        return response;
    } catch (error) {
        console.error('Error creating SharePoint folder:', error);
        throw error;
    }
}

export async function uploadFileToSharePoint(siteId: string, folderId: string, fileName: string, fileBuffer: Buffer) {
    try {
        const client = await getGraphClient();
        const response = await client.api(`/sites/${siteId}/drive/items/${folderId}:/${fileName}:/content`).put(fileBuffer);
        return response;
    } catch (error) {
        console.error('Error uploading file to SharePoint:', error);
        throw error;
    }
}

export async function createSharePointListItem(siteId: string, listName: string, fields: Record<string, any>) {
    try {
        const client = await getGraphClient();
        
        // Find the List ID
        const listsResponse = await client.api(`/sites/${siteId}/lists`).get();
        const list = listsResponse.value.find((l: any) => l.name === listName || l.displayName === listName);
        if (!list) throw new Error(`SharePoint list "${listName}" not found`);
        
        const response = await client.api(`/sites/${siteId}/lists/${list.id}/items`).post({
            fields: fields
        });
        return response;
    } catch (error) {
        console.error('Error creating SharePoint list item:', error);
        throw error;
    }
}

