import { NextRequest, NextResponse } from 'next/server';
import { getSharePointInvoiceById } from '@/lib/sharepoint';

export const dynamic = 'force-dynamic';

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: itemId } = await params;
        if (!itemId) {
            return NextResponse.json({ error: 'Missing itemId' }, { status: 400 });
        }

        const invoice = await getSharePointInvoiceById(itemId);

        let documentInfo = null;
        if (invoice.Documento_x0020_PDF) {
            try {
                documentInfo = JSON.parse(invoice.Documento_x0020_PDF);
            } catch (e) {
                console.warn("Error parsing Documento_x0020_PDF:", e);
            }
        } else if (invoice.rawAttachments && invoice.rawAttachments.length > 0) {
            // Fallback to native SharePoint attachments
            const attachment = invoice.rawAttachments[0];
            documentInfo = {
                fileName: attachment.name,
                serverRelativeUrl: `/sites/FPKContabilidad/Lists/Registro_de_Facturas/Attachments/${invoice.id}/${attachment.name}`
            };
        }

        // Return only necessary fields for the public view
        return NextResponse.json({
            id: invoice.id,
            proveedor: invoice.Proveedor,
            nit: invoice.Title, // We confirmed NIT is in Title
            valorTotal: invoice.Valortotal,
            nroFactura: invoice.Nro_Factura,
            fechaRegistro: invoice.Fecha_x0020_de_x0020_Registro,
            estadoFactura: invoice.Estado_x0020_Factura,
            aprobacionDoliente: invoice.Aprobacion_Doliente,
            gestionContabilidad: invoice.Gestion_Contabilidad,
            documentInfo: documentInfo,
            debugAttachments: invoice.rawAttachments,
            debugHasAttachmentsField: invoice.Attachments
        });
    } catch (error: any) {
        console.error('Error fetching public invoice:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
