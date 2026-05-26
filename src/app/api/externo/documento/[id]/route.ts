import { NextRequest, NextResponse } from 'next/server';
import { getSharePointItemById } from '@/lib/sharepoint';
import { supabase } from '@/lib/supabaseClient';

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

        const [doc, { data: dbDoc }] = await Promise.all([
            getSharePointItemById(itemId, 'Documento_Soporte'),
            supabase
                .from('Documento_Soporte')
                .select('pdf_url, adjunto')
                .eq('id', Number(itemId))
                .maybeSingle()
        ]);

        // Normalize fields for Documento Soporte
        const nitValue = doc.Title || "N/A";
        const valorTotal = doc.Valortotal || 0;

        const pdfUrl = dbDoc?.pdf_url || dbDoc?.adjunto || null;

        let documentInfo = null;
        if (pdfUrl) {
            documentInfo = {
                fileName: pdfUrl.split('/').pop() || 'documento.pdf',
                serverRelativeUrl: pdfUrl,
                isNative: true,
                pdfUrl: pdfUrl
            };
        } else if (doc.rawAttachments && doc.rawAttachments.length > 0) {
            const attachment = doc.rawAttachments[0];
            documentInfo = {
                fileName: attachment.name,
                serverRelativeUrl: attachment.serverRelativeUrl,
                isNative: true
            };
        } else {
            // Fallback link to SharePoint if no specific PDF field
            documentInfo = {
                fileName: "Ver en SharePoint",
                serverRelativeUrl: `/Sites/FPKContabilidad/Lists/Documento_Soporte/DispForm.aspx?ID=${itemId}`,
                isNative: true,
                isExternal: true
            };
        }

        return NextResponse.json({
            id: doc.id,
            proveedor: doc.tsic || "N/A",
            nit: nitValue,
            valorTotal: valorTotal.toString(),
            nroFactura: doc.Consecutivo_Doc_Soporte ? String(doc.Consecutivo_Doc_Soporte) : "N/A",
            fechaRegistro: doc.Created,
            estadoFactura: doc.AprobacionDoliente || "Pendiente",
            aprobacionDoliente: doc.AprobacionDoliente || "Pendiente",
            gestionContabilidad: doc.Gestion_Contabilidad || "Pendiente",
            responsableActual: doc.Responsable_de_Autorizar || "No asignado",
            documentInfo,
            distribuciones: doc.centro_costos || null
        });

    } catch (error: any) {
        console.error('Error fetching public documento:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
