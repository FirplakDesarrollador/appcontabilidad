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

        const { data: invoice, error } = await supabase
            .from('Facturas_Viventta')
            .select('*')
            .eq('id', itemId)
            .single();

        if (error || !invoice) {
            return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 });
        }

        let documentInfo = null;
        if (invoice.documentos || invoice.fp) {
            const url = invoice.documentos || invoice.fp;
            documentInfo = {
                fileName: "Factura",
                serverRelativeUrl: url,
                downloadUrl: url, // Since it's from Supabase, it's a direct URL
                isExternal: true
            };
        }

        return NextResponse.json({
            id: invoice.id,
            proveedor: invoice.Proveedor || "N/A",
            nit: invoice.Nit || "N/A",
            valorTotal: invoice.Valor_total || "0",
            nroFactura: invoice.Nro_Factura || "N/A",
            fechaRegistro: invoice.Creado || invoice.created_at || new Date().toISOString(),
            estadoFactura: invoice.Aprobacion_Doliente || "Pendiente",
            aprobacionDoliente: invoice.Aprobacion_Doliente || "Pendiente",
            gestionContabilidad: invoice.Gestion_Contabilidad || "Pendiente",
            responsableActual: invoice.Responsable_de_Autorizar || "No asignado",
            documentInfo,
            adjuntosUrl: invoice.adjuntos_url || [],
            distribuciones: invoice.centro_costos || null,
            observaciones: invoice.Observaciones || "",
            anticipo: ""
        });

    } catch (error: any) {
        console.error('Error fetching public Viventta invoice:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
