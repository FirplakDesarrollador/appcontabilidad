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

        const { data: supabaseInvoice } = await supabase
            .from('Registro_Facturas')
            .select('*')
            .or(`ID.eq.${isNaN(Number(itemId)) ? 0 : itemId},sharepoint_id.eq.${itemId}`)
            .maybeSingle();

        let invoice: any = null;

        if (supabaseInvoice) {
            invoice = {
                id: supabaseInvoice.ID,
                Proveedor: supabaseInvoice.Proveedor,
                Nit: supabaseInvoice.Nit,
                Title: supabaseInvoice.Nit,
                Valortotal: supabaseInvoice.Valor_total,
                Nro_Factura: supabaseInvoice.Nro_Factura,
                Created: supabaseInvoice.Creado || supabaseInvoice.updated_at,
                Aprobacion_Doliente: supabaseInvoice.Aprobacion_Doliente,
                Gestion_Contabilidad: supabaseInvoice.Gestion_Contabilidad,
                Responsable_de_Autorizar: supabaseInvoice.Responsable_de_Autorizar,
                Observaciones: supabaseInvoice.Observaciones,
                tiene_anticipo: supabaseInvoice.tiene_anticipo,
                centro_costos: supabaseInvoice.centro_costos,
                tablaCostos: supabaseInvoice.tablaCostos,
                Consecutivo: supabaseInvoice.Consecutivo,
                Documento_x0020_PDF: supabaseInvoice.fp || supabaseInvoice.documentos,
                fp: supabaseInvoice.fp,
                documentos: supabaseInvoice.documentos,
                adjuntos_url: supabaseInvoice.adjuntos_url
            };
        } else {
            // If not found directly in Supabase, query SharePoint
            try {
                if (Number(itemId) < 1000000) {
                    invoice = await getSharePointInvoiceById(itemId);
                }
            } catch (spErr) {
                console.warn('SharePoint lookup failed for item:', itemId, spErr);
            }
        }

        if (!invoice) {
            return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 });
        }

        // Normalize fields similar to the main list view
        const nitValue = invoice.Title || invoice.Nit_x0020_ || invoice["Nit "] || invoice.Nit || "N/A";
        const valorTotal = invoice.Valortotal ?? invoice.Valor_x0020_total ?? invoice["Valor total"] ?? invoice.Monto ?? 0;

        let documentInfo = null;
        
        // 1. Check direct PDF URL from Supabase / direct storage
        const directUrl = invoice.fp || invoice.documentos || supabaseInvoice?.fp || supabaseInvoice?.documentos;
        if (directUrl && typeof directUrl === 'string' && /^https?:\/\//i.test(directUrl)) {
            documentInfo = {
                fileName: `${invoice.Nro_Factura || 'Factura'}.pdf`,
                serverRelativeUrl: directUrl,
                downloadUrl: directUrl,
                isExternal: true
            };
        }
        else if (invoice.Documento_x0020_PDF) {
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
            try {
                const externalDoc = await findExternalInvoiceDocument(nitValue, invoice.Nro_Factura, "");
                if (externalDoc) {
                    documentInfo = {
                        fileName: externalDoc.fileName,
                        serverRelativeUrl: externalDoc.webUrl,
                        isExternal: true,
                        downloadUrl: externalDoc.downloadUrl
                    };
                }
            } catch (_extErr) {}
        }

        const isProcessed = invoice.Aprobacion_Doliente === 'Aprobado' || invoice.Aprobacion_Doliente === 'Rechazado';

        return NextResponse.json({
            id: invoice.id,
            proveedor: invoice.Proveedor || "N/A",
            nit: nitValue,
            valorTotal: valorTotal.toString(),
            nroFactura: invoice.Nro_Factura || "N/A",
            consecutivo: invoice.Consecutivo || supabaseInvoice?.Consecutivo || null,
            fechaRegistro: invoice.Created || invoice.Creado || invoice.OData__RegistrationDate || new Date().toISOString(),
            estadoFactura: invoice.Aprobacion_Doliente || "Pendiente",
            aprobacionDoliente: invoice.Aprobacion_Doliente || "Pendiente",
            gestionContabilidad: invoice.Gestion_Contabilidad || "Pendiente",
            responsableActual: invoice.Responsable_de_Autorizar || "No asignado",
            documentInfo,
            adjuntosUrl: supabaseInvoice?.adjuntos_url || invoice.adjuntos_url || [],
            distribuciones: isProcessed ? (invoice.centro_costos || null) : null,
            observaciones: invoice.Observaciones || "",
            anticipo: invoice.tiene_anticipo || "",
            documentos: supabaseInvoice?.documentos || supabaseInvoice?.fp || invoice.fp || null
        });

    } catch (error: any) {
        console.error('Error fetching public invoice:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
