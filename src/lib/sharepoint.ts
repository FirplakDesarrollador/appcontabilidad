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
            console.error("Error fetching attachments for item " + itemId, err);
        }

        return {
            id: item.id,
            ...item.fields,
            rawAttachments: attachments
        };
    } catch (error) {
        console.error(`Error fetching SharePoint item ${itemId}:`, error);
        throw error;
    }
}
