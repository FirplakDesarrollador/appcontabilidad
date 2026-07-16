import { NextRequest, NextResponse } from 'next/server';
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

        const { data: dbDoc, error } = await supabase
            .from('Documento_Soporte')
            .select('*')
            .eq('id', Number(itemId))
            .maybeSingle();

        if (error || !dbDoc) {
            return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 });
        }

        // Normalize fields for Documento Soporte
        const nitValue = dbDoc.nit || "N/A";
        const valorTotal = dbDoc.valor_total || 0;

        const pdfUrl = dbDoc.pdf_url || dbDoc.adjunto || null;

        let documentInfo = null;
        if (pdfUrl) {
            documentInfo = {
                fileName: pdfUrl.split('/').pop() || 'documento.pdf',
                serverRelativeUrl: pdfUrl,
                isNative: true,
                pdfUrl: pdfUrl
            };
        } else {
            documentInfo = {
                fileName: "Sin adjunto",
                serverRelativeUrl: null,
                isNative: false,
                isExternal: false
            };
        }

        return NextResponse.json({
            id: dbDoc.id,
            proveedor: dbDoc.proveedor || "N/A",
            nit: nitValue,
            valorTotal: valorTotal.toString(),
            nroFactura: dbDoc.consecutivo ? String(dbDoc.consecutivo) : "N/A",
            fechaRegistro: dbDoc.fecha_creacion || dbDoc.created_at,
            estadoFactura: dbDoc.aprobacion_doliente || "Pendiente",
            aprobacionDoliente: dbDoc.aprobacion_doliente || "Pendiente",
            gestionContabilidad: dbDoc.gestion_contabilidad || "Pendiente",
            responsableActual: dbDoc.responsable_nombre || "No asignado",
            documentInfo,
            distribuciones: dbDoc.centro_costos || null
        });

    } catch (error: any) {
        console.error('Error fetching public documento:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
