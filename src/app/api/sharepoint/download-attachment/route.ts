import { NextRequest, NextResponse } from 'next/server';
import { getSharePointRESTToken } from '@/lib/sharepoint';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const itemId = searchParams.get('itemId');
        const fileName = searchParams.get('fileName');

        if (!itemId) {
            return new Response('Missing itemId', { status: 400 });
        }

        const token = await getSharePointRESTToken();
        if (!token) throw new Error('Could not get SharePoint token');

        const headers = {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json;odata=nometadata',
        };

        const SP_BASE = 'https://firplaksa.sharepoint.com/sites/FPKContabilidad';
        
        let targetFileName = fileName;
        let serverRelativeUrl = '';

        if (!targetFileName) {
            const listName = 'Registro_de_Facturas';
            
            // Try to find via REST (might fail due to permissions)
            const attachUrl = `${SP_BASE}/_api/web/lists/getbytitle('${listName}')/items(${itemId})/AttachmentFiles`;
            const attachRes = await fetch(attachUrl, { headers });
            
            if (attachRes.ok) {
                const attachData = await attachRes.json();
                const attachments = attachData.value || [];
                if (attachments.length > 0) {
                    targetFileName = attachments[0].FileName;
                    serverRelativeUrl = attachments[0].ServerRelativeUrl;
                }
            }

            // If still no filename, try predicting based on RAD pattern (requires fetching item fields first)
            if (!targetFileName) {
                try {
                    const { getSharePointInvoiceById } = await import('@/lib/sharepoint');
                    const invoice = await getSharePointInvoiceById(itemId);
                    if (invoice.Consecutivo && invoice.Proveedor && invoice.Nro_Factura) {
                        targetFileName = `RAD ${invoice.Consecutivo} ${invoice.Proveedor} ${invoice.Nro_Factura}.pdf`;
                    }
                } catch (e) {
                    console.warn("Could not predict filename:", e);
                }
            }

            if (!targetFileName) {
                return new Response('No se encontraron archivos adjuntos para esta factura y no se pudo predecir el nombre.', { status: 404 });
            }
        }

        if (!serverRelativeUrl) {
            serverRelativeUrl = `/sites/FPKContabilidad/Lists/Registro_de_Facturas/Attachments/${itemId}/${targetFileName}`;
        }

        const downloadUrl = `https://firplaksa.sharepoint.com${serverRelativeUrl}`;
        const fileResponse = await fetch(downloadUrl, { headers });

        if (!fileResponse.ok) {
            throw new Error(`Failed to download file: ${fileResponse.status} ${fileResponse.statusText}`);
        }

        const buffer = await fileResponse.arrayBuffer();
        const ext = targetFileName!.split('.').pop()?.toLowerCase() ?? '';
        const contentTypeMap: Record<string, string> = {
            pdf: 'application/pdf',
            xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            xls: 'application/vnd.ms-excel',
            png: 'image/png',
            jpg: 'image/jpeg',
            jpeg: 'image/jpeg',
            doc: 'application/msword',
            docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        };
        const contentType = contentTypeMap[ext] || 'application/pdf';

        return new NextResponse(buffer, {
            headers: {
                'Content-Type': contentType,
                'Content-Disposition': `attachment; filename="${targetFileName}"`,
            },
        });

    } catch (error: any) {
        console.error('Download error:', error);
        return new Response(`Error al descargar adjunto: ${error.message}`, { status: 500 });
    }
}
