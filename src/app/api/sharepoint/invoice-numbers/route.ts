import { NextResponse } from 'next/server';
import * as msal from '@azure/msal-node';
import { Client } from '@microsoft/microsoft-graph-client';

const msalConfig = {
    auth: {
        clientId: process.env.AZURE_CLIENT_ID!,
        authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
        clientSecret: process.env.AZURE_CLIENT_SECRET!,
    },
};
const cca = new msal.ConfidentialClientApplication(msalConfig);

async function getGraphClient() {
    const response = await cca.acquireTokenByClientCredential({
        scopes: ['https://graph.microsoft.com/.default'],
    });
    return Client.init({
        authProvider: (done) => done(null, response!.accessToken!),
    });
}

const SHAREPOINT_HOST = 'firplaksa.sharepoint.com';
const SHAREPOINT_SITE = 'FPKContabilidad';
const LIST_NAME = 'Registro_de_Facturas';

// Cache to avoid hitting SharePoint on every request
let cachedNumbers: Set<string> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function normalizeRef(num: any): string {
    return String(num || '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .replace(/([a-z])0+/g, '$1')
        .replace(/^0+/, '');
}

export async function GET() {
    try {
        const now = Date.now();

        // Return cached result if fresh
        if (cachedNumbers && (now - cacheTimestamp) < CACHE_TTL_MS) {
            return NextResponse.json({
                success: true,
                count: cachedNumbers.size,
                numbers: Array.from(cachedNumbers),
                cached: true
            });
        }

        console.log('[SP-NUMBERS] Fetching all invoice numbers from SharePoint...');
        const client = await getGraphClient();

        const siteResponse = await client.api(`/sites/${SHAREPOINT_HOST}:/sites/${SHAREPOINT_SITE}`).get();
        const siteId = siteResponse.id;

        const listsResponse = await client.api(`/sites/${siteId}/lists`).get();
        const list = listsResponse.value.find((l: any) => l.name === LIST_NAME || l.displayName === LIST_NAME);
        if (!list) throw new Error(`SharePoint list "${LIST_NAME}" not found`);
        const listId = list.id;

        // Fetch all Nro_Factura values from SharePoint in batches of 500
        const allNumbers = new Set<string>();
        let nextLink: string | null = `/sites/${siteId}/lists/${listId}/items?select=fields/Nro_Factura&expand=fields(select=Nro_Factura)&top=500`;

        while (nextLink) {
            const response = await client.api(nextLink).get();
            for (const item of response.value || []) {
                const raw = item.fields?.Nro_Factura;
                if (raw) {
                    allNumbers.add(normalizeRef(raw));
                }
            }
            nextLink = response['@odata.nextLink']
                ? response['@odata.nextLink'].split('v1.0')[1]
                : null;
        }

        // Update cache
        cachedNumbers = allNumbers;
        cacheTimestamp = now;

        console.log(`[SP-NUMBERS] Fetched ${allNumbers.size} invoice numbers from SharePoint.`);

        return NextResponse.json({
            success: true,
            count: allNumbers.size,
            numbers: Array.from(allNumbers),
            cached: false
        });

    } catch (error: any) {
        console.error('[SP-NUMBERS] Error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
