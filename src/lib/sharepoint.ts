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
            Gestion_Contabilidad: action === 'Aprobado' ? 'Procesado' : 'Rechazado',
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

export async function fetchAllSharePointItems() {
    try {
        const client = await getGraphClient();

        // 1. Resolve Site ID
        const siteResponse = await client.api('/sites/firplaksa.sharepoint.com:/sites/FPKContabilidad').get();
        const siteId = siteResponse.id;

        // 2. Find the List
        const listsResponse = await client.api(`/sites/${siteId}/lists`).get();
        const list = listsResponse.value.find((l: any) => l.name === 'Registro_de_Facturas' || l.displayName === 'Registro_de_Facturas');

        if (!list) throw new Error('SharePoint list "Registro_de_Facturas" not found');
        const listId = list.id;

        // 3. Fetch the "Responsable de Autorizar" lookup list to resolve IDs to names
        // The lookup column references the site's User Information List
        const userMap = new Map<string, string>();
        try {
            // Try to get the User Information List
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
            console.log(`[SharePoint] Loaded ${userMap.size} users for lookup resolution`);
        } catch (e: any) {
            console.warn('[SharePoint] Could not load User Information List, trying alternative approach:', e.message);
        }

        // 4. Iterative Fetch of all list items
        let allItems: any[] = [];
        let nextLink: string | null = `/sites/${siteId}/lists/${listId}/items?expand=fields&top=500`;

        console.log('Starting full SharePoint fetch...');

        while (nextLink) {
            const response = await client.api(nextLink).get();
            const items = response.value.map((item: any) => {
                const fields = item.fields || {};
                const lookupId = fields.ResponsabledeAutorizarLookupId;
                const responsableName = lookupId ? userMap.get(String(lookupId)) : null;

                return {
                    id: item.id,
                    ...fields,
                    Responsable_de_Autorizar: responsableName || null,
                };
            });
            allItems = [...allItems, ...items];
            nextLink = response['@odata.nextLink'] ? response['@odata.nextLink'].split('v1.0')[1] : null;
            console.log(`Fetched ${allItems.length} items so far...`);
        }

        return allItems;
    } catch (error) {
        console.error('SharePoint full fetch error:', error);
        throw error;
    }
}

export async function getSharePointInvoiceById(itemId: string) {
    try {
        const client = await getGraphClient();

        // 1. Resolve Site ID
        const siteResponse = await client.api('/sites/firplaksa.sharepoint.com:/sites/FPKContabilidad').get();
        const siteId = siteResponse.id;

        // 2. Find the List
        const listsResponse = await client.api(`/sites/${siteId}/lists`).get();
        const list = listsResponse.value.find((l: any) => l.name === 'Registro_de_Facturas' || l.displayName === 'Registro_de_Facturas');

        if (!list) throw new Error('SharePoint list "Registro_de_Facturas" not found');
        const listId = list.id;

        // 3. Fetch specific item
        const item = await client.api(`/sites/${siteId}/lists/${listId}/items/${itemId}`)
            .expand('fields')
            .get();

        let attachments = [];
        // Try to fetch attachments regardless of the field, as it can be inconsistent
        try {
            const attachmentsRes = await client.api(`/sites/${siteId}/lists/${listId}/items/${itemId}/attachments`).get();
            attachments = attachmentsRes.value || [];
        } catch (err) {
            console.warn(`[SharePoint] Graph API attachments failed for ${itemId}, trying REST API...`);
            try {
                const restToken = await getSharePointRESTToken();
                // Usamos el ID de la lista que ya resolvimos vía Graph
                const restUrl = `https://firplaksa.sharepoint.com/sites/FPKContabilidad/_api/web/lists(guid'${listId}')/items(${itemId})/AttachmentFiles`;
                
                const restRes = await fetch(restUrl, {
                    headers: {
                        'Authorization': `Bearer ${restToken}`,
                        'Accept': 'application/json;odata=nometadata'
                    }
                });
                if (restRes.ok) {
                    const restData = await restRes.json();
                    // En nometadata, los resultados vienen en .value
                    const results = restData.value || [];
                    attachments = results.map((a: any) => ({
                        name: a.FileName,
                        serverRelativeUrl: a.ServerRelativeUrl
                    }));
                } else {
                    console.warn(`[SharePoint] REST API attachments failed with status: ${restRes.status}`);
                }
            } catch (restErr) {
                console.error("Error fetching attachments via REST for item " + itemId, restErr);
            }
        }

        // Fallback: Si no se encontraron adjuntos vía API pero el item dice tenerlos,
        // redirigimos al formulario estándar de SharePoint donde los adjuntos son visibles.
        if (attachments.length === 0 && item.fields.Attachments === true) {
            console.log(`[SharePoint] Usando DispForm como fallback para item ${itemId}`);
            attachments.push({
                name: 'Ver en SharePoint',
                serverRelativeUrl: `/Lists/Registro_de_Facturas/DispForm.aspx?ID=${itemId}`,
                isNative: true
            });
        }

        return {
            id: item.id,
            webUrl: item.webUrl,
            ...item.fields,
            rawAttachments: attachments
        };
    } catch (error) {
        console.error(`Error fetching SharePoint item ${itemId}:`, error);
        throw error;
    }
}

export async function findExternalInvoiceDocument(nit: string, nroFactura: string, dateStr: string) {
    try {
        const caGraph = await cca.acquireTokenByClientCredential({
            scopes: ['https://graph.microsoft.com/.default'],
        });
        const client = Client.init({
            authProvider: (done) => done(null, caGraph!.accessToken),
        });

        // 1. Obtener Site ID de ITPowerApps
        const site = await client.api('/sites/firplaksa.sharepoint.com:/sites/ITPowerApps').get();
        
        // Limpiar el NIT de caracteres no numéricos
        const cleanNitFull = nit.replace(/[^0-9]/g, '');
        // NIT sin el último dígito (asumiendo que es el dígito de verificación si viene de un formato con guión)
        const nitParts = nit.split('-');
        const nitWithoutDV = nitParts[0].replace(/[^0-9]/g, '');
        
        // 2. Buscar por el número de factura o el NIT en el sitio
        // Intentamos una búsqueda que combine ambos para ser más precisos
        const query = `${nroFactura}`;
        console.log(`[SharePoint Search] Searching for "${query}" in ITPowerApps (NIT: ${nitWithoutDV})...`);
        const searchRes = await client.api(`/sites/${site.id}/drive/root/search(q='${query}')`).get();
        
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
