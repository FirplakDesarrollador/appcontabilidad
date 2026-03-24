import { NextRequest, NextResponse } from 'next/server';
import { getGraphClient } from '@/lib/sharepoint';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        const client = await getGraphClient();

        const siteResponse = await client.api('/sites/firplaksa.sharepoint.com:/sites/FPKContabilidad').get();
        const siteId = siteResponse.id;

        const listsResponse = await client.api(`/sites/${siteId}/lists`).get();
        const list = listsResponse.value.find((l: any) => l.name === 'Registro_de_Facturas' || l.displayName === 'Registro_de_Facturas');
        const listId = list.id;

        const itemsResponse = await client.api(`/sites/${siteId}/lists/${listId}/items`)
            .expand('fields')
            .top(5)
            .get();
        
        return NextResponse.json({ 
            items: itemsResponse.value.map((item: any) => ({
                id: item.id,
                fields: item.fields,
                hasAttachments: item.fields.Attachments
            })) 
        });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
