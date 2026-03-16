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

        // Normalize fields similar to the main list view
        const nitValue = invoice.Title || invoice.Nit_x0020_ || invoice["Nit "] || invoice.Nit || "N/A";
        const valorTotal = invoice.Valortotal ?? invoice.Valor_x0020_total ?? invoice["Valor total"] ?? invoice.Monto ?? 0;

        let documentInfo = null;
        
        // Check Documento_x0020_PDF (internal name for "Documento PDF")
        if (invoice.Documento_x0020_PDF) {
            try {
                // Could be JSON or string URL
                if (invoice.Documento_x0020_PDF.startsWith('{')) {
                    documentInfo = JSON.parse(invoice.Documento_x0020_PDF);
                } else {
                    documentInfo = { fileName: "Factura", serverRelativeUrl: invoice.Documento_x0020_PDF };
                }
            } catch (e) {
                documentInfo = { fileName: "Factura", serverRelativeUrl: invoice.Documento_x0020_PDF };
            }
        } 
        // Check for SharePoint Hyperlink column "Documento adjunto" (often mapped to Documento_x0020_adjunto)
        else if (invoice.Documento_x0020_adjunto) {
            const link = invoice.Documento_x0020_adjunto;
            documentInfo = {
                fileName: link.Description || "Documento Adjunto",
                serverRelativeUrl: link.Url || link
            };
        }
        else if (invoice.rawAttachments && invoice.rawAttachments.length > 0) {
            const attachment = invoice.rawAttachments[0];
            documentInfo = {
                fileName: attachment.name,
                serverRelativeUrl: attachment.serverRelativeUrl || `/sites/FPKContabilidad/Lists/Registro_de_Facturas/Attachments/${invoice.id}/${attachment.name}`,
                isNative: !!attachment.isNative
            };
        }

        return NextResponse.json({
            id: invoice.id,
            proveedor: invoice.Proveedor || "N/A",
            nit: nitValue,
            valorTotal: valorTotal.toString(),
            nroFactura: invoice.Nro_Factura || "N/A",
            fechaRegistro: invoice.Created || invoice.OData__RegistrationDate,
            estadoFactura: invoice.Aprobacion_Doliente || "Pendiente",
            aprobacionDoliente: invoice.Aprobacion_Doliente || "Pendiente",
            gestionContabilidad: invoice.Gestion_Contabilidad || "Pendiente",
            documentInfo
        });

    } catch (error: any) {
        console.error('Error fetching public invoice:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
