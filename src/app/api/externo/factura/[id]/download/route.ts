import { NextRequest, NextResponse } from 'next/server';
import { getGraphClient } from '@/lib/sharepoint';

export const dynamic = 'force-dynamic';

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: itemId } = await params;
        const { searchParams } = new URL(req.url);
        const fileName = searchParams.get('file');

        if (!itemId || !fileName) {
            return NextResponse.json({ error: 'Missing itemId or fileName' }, { status: 400 });
        }

        const client = await getGraphClient();

        // 1. Resolve Site ID (repeated for simplicity, could be cached)
        const siteResponse = await client.api('/sites/firplaksa.sharepoint.com:/sites/FPKContabilidad').get();
        const siteId = siteResponse.id;

        // 2. Find the List
        const listsResponse = await client.api(`/sites/${siteId}/lists`).get();
        const list = listsResponse.value.find((l: any) => l.name === 'Registro_de_Facturas' || l.displayName === 'Registro_de_Facturas');
        const listId = list.id;

        // 3. Get the attachment content
        // Note: SharePoint list attachments are retrieved via the attachments endpoint
        const attachmentContent = await client.api(`/sites/${siteId}/lists/${listId}/items/${itemId}/attachments/${fileName}/$value`).get();

        if (!attachmentContent) {
            return NextResponse.json({ error: 'Attachment not found or empty' }, { status: 404 });
        }

        // Return the file with proper headers
        return new NextResponse(attachmentContent, {
            headers: {
                'Content-Type': 'application/octet-stream', // Could improve this based on extension
                'Content-Disposition': `attachment; filename="${fileName}"`,
            },
        });

    } catch (error: any) {
        console.error('Error downloading attachment:', error);
        return NextResponse.json({ error: error.message || 'Error downloading file' }, { status: 500 });
    }
}
