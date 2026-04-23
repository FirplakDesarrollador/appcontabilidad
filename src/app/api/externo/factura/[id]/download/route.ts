import { NextRequest, NextResponse } from 'next/server';
import { getGraphClient, findExternalInvoiceDocument, getSharePointInvoiceById } from '@/lib/sharepoint';

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
        const invoiceDetails = await getSharePointInvoiceById(itemId);
        
        const nitValue = invoiceDetails.Title || invoiceDetails.Nit_x0020_ || invoiceDetails["Nit "] || invoiceDetails.Nit || "N/A";
        const nroFactura = invoiceDetails.Nro_Factura;

        let fileBuffer: ArrayBuffer | null = null;
        let finalFileName = requestFileName || `factura_${nroFactura || itemId}.pdf`;

        // 1. Try ITPowerApps first (most likely for "Todas tienen su carpeta")
        if (nroFactura && nitValue !== 'N/A') {
            console.log(`[Direct Download] Searching for ${nroFactura} in ITPowerApps...`);
            const externalDoc = await findExternalInvoiceDocument(nitValue, nroFactura, "");
            
            if (externalDoc) {
                console.log(`[Direct Download] Found external doc: ${externalDoc.fileName}. Fetching content...`);
                try {
                    const response = await client.api(`/drives/${externalDoc.driveId}/items/${externalDoc.id}/content`).get();
                    if (response) {
                        fileBuffer = response;
                        finalFileName = externalDoc.fileName;
                        console.log(`[Direct Download] Successfully fetched ${finalFileName} from ITPowerApps`);
                    }
                } catch (extErr) {
                    console.error(`[Direct Download] Failed to fetch content from ITPowerApps:`, extErr);
                }
            }
        }

        // 2. Fallback to FPKContabilidad Attachments
        if (!fileBuffer && requestFileName && requestFileName !== 'Ver en SharePoint') {
            console.log(`[Direct Download] Falling back to FPKContabilidad attachments for ${requestFileName}...`);
            try {
                const siteResponse = await client.api('/sites/firplaksa.sharepoint.com:/sites/FPKContabilidad').get();
                const siteId = siteResponse.id;
                const listsResponse = await client.api(`/sites/${siteId}/lists`).get();
                const list = listsResponse.value.find((l: any) => l.name === 'Registro_de_Facturas' || l.displayName === 'Registro_de_Facturas');
                
                if (list) {
                    const attResponse = await client.api(`/sites/${siteId}/lists/${list.id}/items/${itemId}/attachments/${requestFileName}/$value`).get();
                    if (attResponse) {
                        fileBuffer = attResponse;
                        finalFileName = requestFileName;
                        console.log(`[Direct Download] Successfully fetched attachment from FPKContabilidad`);
                    }
                }
            } catch (attErr) {
                console.warn(`[Direct Download] Failed to fetch attachment from FPKContabilidad:`, attErr);
            }
        }

        if (!fileBuffer) {
            console.warn(`[Direct Download] PDF not found for item ${itemId} after both attempts.`);
            return NextResponse.json({ error: 'No se ha encontrado factura en PDF' }, { status: 404 });
        }

        // 3. Serve the file
        // Ensure PDF extension if missing
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
        console.error('Error in direct download:', error);
        return NextResponse.json({ error: error.message || 'Error al procesar la descarga' }, { status: 500 });
    }
}
