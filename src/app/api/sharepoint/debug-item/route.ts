import { NextResponse } from 'next/server';
import * as msal from '@azure/msal-node';
import { Client } from '@microsoft/microsoft-graph-client';

const cca = new msal.ConfidentialClientApplication({
    auth: {
        clientId: process.env.AZURE_CLIENT_ID!,
        authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
        clientSecret: process.env.AZURE_CLIENT_SECRET!,
    },
});

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const itemId = searchParams.get('itemId') || '47380';

        const response = await cca.acquireTokenByClientCredential({
            scopes: ['https://graph.microsoft.com/.default'],
        });
        const client = Client.init({
            authProvider: (done) => done(null, response!.accessToken!),
        });

        const siteResponse = await client.api('/sites/firplaksa.sharepoint.com:/sites/FPKContabilidad').get();
        const siteId = siteResponse.id;

        const listsResponse = await client.api(`/sites/${siteId}/lists`).get();
        const list = listsResponse.value.find((l: any) => l.name === 'Registro_de_Facturas' || l.displayName === 'Registro_de_Facturas');
        const listId = list.id;

        // Get specific item with all fields expanded
        const item = await client.api(`/sites/${siteId}/lists/${listId}/items/${itemId}`)
            .expand('fields')
            .get();

        return NextResponse.json({
            success: true,
            itemId,
            allFields: item.fields,
            fieldNames: Object.keys(item.fields),
        });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
