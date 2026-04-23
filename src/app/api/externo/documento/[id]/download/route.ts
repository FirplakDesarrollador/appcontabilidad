import { NextRequest, NextResponse } from 'next/server';
import { getGraphClient, getSharePointItemById } from '@/lib/sharepoint';

export const dynamic = 'force-dynamic';

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: itemId } = await params;
        const { searchParams } = new URL(req.url);
        const requestFileName = searchParams.get('file');

        if (!itemId) {
            return NextResponse.json({ error: 'Missing itemId' }, { status: 400 });
        }

        const client = await getGraphClient();
        const docDetails = await getSharePointItemById(itemId, 'Documento_Soporte');
        
        let fileBuffer: ArrayBuffer | null = null;
        let finalFileName = requestFileName || `documento_${docDetails.Consecutivo_Doc_Soporte || itemId}.pdf`;

        // Support Documents usually have attachments in the same list item
        if (requestFileName && requestFileName !== 'Ver en SharePoint') {
            try {
                const siteResponse = await client.api('/sites/firplaksa.sharepoint.com:/sites/FPKContabilidad').get();
                const siteId = siteResponse.id;
                const listsResponse = await client.api(`/sites/${siteId}/lists`).get();
                const list = listsResponse.value.find((l: any) => l.name === 'Documento_Soporte' || l.displayName === 'Documento_Soporte');
                
                if (list) {
                    const attResponse = await client.api(`/sites/${siteId}/lists/${list.id}/items/${itemId}/attachments/${requestFileName}/$value`).get();
                    if (attResponse) {
                        fileBuffer = attResponse;
                        finalFileName = requestFileName;
                    }
                }
            } catch (attErr) {
                console.warn(`[Direct Download] Failed to fetch attachment from Documento_Soporte:`, attErr);
            }
        }

        if (!fileBuffer) {
            return NextResponse.json({ error: 'No se ha encontrado documento en PDF' }, { status: 404 });
        }

        if (!finalFileName.toLowerCase().endsWith('.pdf')) {
            finalFileName = finalFileName.includes('.') 
                ? finalFileName.replace(/\.[^/.]+$/, ".pdf")
                : `${finalFileName}.pdf`;
        }

        return new NextResponse(fileBuffer, {
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="${finalFileName}"`,
                'Cache-Control': 'no-store',
            },
        });

    } catch (error: any) {
        console.error('Error in document download:', error);
        return NextResponse.json({ error: error.message || 'Error al procesar la descarga' }, { status: 500 });
    }
}
