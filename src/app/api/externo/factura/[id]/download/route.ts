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

        // Si el "fileName" es en realidad nuestro marcador de posición para SharePoint manual
        if (fileName === 'Ver en SharePoint') {
            const siteResponse = await client.api('/sites/firplaksa.sharepoint.com:/sites/FPKContabilidad').get();
            const item = await client.api(`/sites/${siteResponse.id}/lists/Registro_de_Facturas/items/${itemId}`).get();
            
            if (item.webUrl) {
                console.log('[Externo View] Redirecting to native webUrl:', item.webUrl);
                // Forzamos el visor de SharePoint agregando web=1
                const viewerUrl = item.webUrl.includes('?') ? `${item.webUrl}&web=1` : `${item.webUrl}?web=1`;
                return NextResponse.redirect(viewerUrl);
            }
            return NextResponse.redirect(`https://firplaksa.sharepoint.com/sites/FPKContabilidad/Lists/Registro_de_Facturas/DispForm.aspx?ID=${itemId}`);
        }

        // 1. Resolve Site ID
        const siteResponse = await client.api('/sites/firplaksa.sharepoint.com:/sites/FPKContabilidad').get();
        const siteId = siteResponse.id;

        // 2. Find the List
        const listsResponse = await client.api(`/sites/${siteId}/lists`).get();
        const list = listsResponse.value.find((l: any) => l.name === 'Registro_de_Facturas' || l.displayName === 'Registro_de_Facturas');
        const listId = list.id;

        // 3. Get the attachment content
        try {
            const attachmentContent = await client.api(`/sites/${siteId}/lists/${listId}/items/${itemId}/attachments/${fileName}/$value`).get();

            if (!attachmentContent) {
                throw new Error('Attachment empty');
            }

            // Detect content type
            const ext = fileName.split('.').pop()?.toLowerCase() || '';
            const contentTypeMap: Record<string, string> = {
                pdf: 'application/pdf',
                jpg: 'image/jpeg',
                jpeg: 'image/jpeg',
                png: 'image/png'
            };
            
            // SI EL ARCHIVO NO TIENE EXTENSIÓN O ES DESCONOCIDA (como .000), 
            // FORZAMOS application/pdf porque en este sistema casi todo son facturas PDF.
            // Esto evita que el navegador lo descargue automáticamente.
            const contentType = contentTypeMap[ext] || 'application/pdf';

            console.log(`[Externo View] Serving file ${fileName} as ${contentType}`);

            // Return the file with proper headers for inline viewing
            return new NextResponse(attachmentContent, {
                headers: {
                    'Content-Type': contentType,
                    'Content-Disposition': `inline; filename="${fileName}${ext ? '' : '.pdf'}"`,
                },
            });
        } catch (downloadErr) {
            console.warn('[Externo View] Graph download failed, falling back to Viewer:', downloadErr);
            // Si falla la descarga directa (por permisos de App-Only), redirigimos al item en SharePoint
            const item = await client.api(`/sites/${siteId}/lists/${listId}/items/${itemId}`).get();
            if (item.webUrl) {
                // Forzamos el modo web para ver en lugar de descargar
                const viewerUrl = item.webUrl.includes('?') ? `${item.webUrl}&web=1` : `${item.webUrl}?web=1`;
                return NextResponse.redirect(viewerUrl);
            }
            return NextResponse.redirect(`https://firplaksa.sharepoint.com/sites/FPKContabilidad/Lists/Registro_de_Facturas/DispForm.aspx?ID=${itemId}`);
        }

    } catch (error: any) {
        console.error('Error viewing attachment:', error);
        return NextResponse.json({ error: error.message || 'Error viewing file' }, { status: 500 });
    }
}
