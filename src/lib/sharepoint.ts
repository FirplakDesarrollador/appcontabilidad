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

const getGraphClient = async () => {
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

        // 3. Iterative Fetch
        let allItems: any[] = [];
        let nextLink = `/sites/${siteId}/lists/${listId}/items?expand=fields&top=500`;

        console.log('Starting full SharePoint fetch...');

        while (nextLink) {
            const response = await client.api(nextLink).get();
            const items = response.value.map((item: any) => ({
                id: item.id,
                ...item.fields
            }));
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
