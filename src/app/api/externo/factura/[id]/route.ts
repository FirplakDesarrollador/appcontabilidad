import { NextRequest, NextResponse } from 'next/server';
import { getSharePointInvoiceById, findExternalInvoiceDocument } from '@/lib/sharepoint';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

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
        const { data: supabaseInvoice } = await supabase
            .from('Registro_Facturas')
            .select('adjuntos_url, fp, documentos')
            .or(`ID.eq.${itemId},sharepoint_id.eq.${itemId}`)
            .maybeSingle();

        // Normalize fields similar to the main list view
        const nitValue = invoice.Title || invoice.Nit_x0020_ || invoice["Nit "] || invoice.Nit || "N/A";
        const valorTotal = invoice.Valortotal ?? invoice.Valor_x0020_total ?? invoice["Valor total"] ?? invoice.Monto ?? 0;

        let documentInfo = null;
        
        // 1. Check direct fields
        if (invoice.Documento_x0020_PDF) {
            try {
                if (invoice.Documento_x0020_PDF.startsWith('{')) {
                    documentInfo = JSON.parse(invoice.Documento_x0020_PDF);
                } else {
                    documentInfo = { fileName: "Factura", serverRelativeUrl: invoice.Documento_x0020_PDF };
                }
            } catch (e) {
                documentInfo = { fileName: "Factura", serverRelativeUrl: invoice.Documento_x0020_PDF };
            }
        } 
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

        // 2. Fallback: Search in ITPowerApps Site if not found
        if (!documentInfo && invoice.Nro_Factura && nitValue !== 'N/A') {
            const externalDoc = await findExternalInvoiceDocument(nitValue, invoice.Nro_Factura, "");
            if (externalDoc) {
                documentInfo = {
                    fileName: externalDoc.fileName,
                    serverRelativeUrl: externalDoc.webUrl,
                    isExternal: true,
                    downloadUrl: externalDoc.downloadUrl
                };
            }
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
            responsableActual: invoice.Responsable_de_Autorizar || "No asignado",
            documentInfo,
            adjuntosUrl: supabaseInvoice?.adjuntos_url || [],
            distribuciones: invoice.centro_costos || null,
            observaciones: invoice.Observaciones || "",
            anticipo: invoice.tiene_anticipo || "",
            documentos: supabaseInvoice?.documentos || supabaseInvoice?.fp || null
        });

    } catch (error: any) {
        console.error('Error fetching public invoice:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
