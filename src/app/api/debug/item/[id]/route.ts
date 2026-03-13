import { NextRequest, NextResponse } from 'next/server';
import { getGraphClient } from '@/lib/sharepoint';

export const dynamic = 'force-dynamic';

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: itemId } = await params;
        const client = await getGraphClient();

        const siteResponse = await client.api('/sites/firplaksa.sharepoint.com:/sites/FPKContabilidad').get();
        const siteId = siteResponse.id;

        const listsResponse = await client.api(`/sites/${siteId}/lists`).get();
        const list = listsResponse.value.find((l: any) => l.name === 'Registro_de_Facturas' || l.displayName === 'Registro_de_Facturas');
        const listId = list.id;

        // Try expanding EVERYTHING
        const item = await client.api(`/sites/${siteId}/lists/${listId}/items/${itemId}`)
            .expand('fields,attachments,driveItem')
            .get();
        
        return NextResponse.json({
            item: item,
            hasAttachments: item.fields.Attachments,
            attachmentsCount: item.attachments?.length || 0,
            attachments: item.attachments,
            driveItem: item.driveItem
        });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
