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

        const { data: radicado, error } = await supabase
            .from('Radicados_de_importacion')
            .select('*')
            .eq('id', itemId)
            .maybeSingle();

        if (error || !radicado) {
            return NextResponse.json({ error: 'Radicado no encontrado' }, { status: 404 });
        }

        let documentInfo = null;
        if (radicado.adjuntos_url) {
            documentInfo = {
                fileName: `RAD_${radicado.Consecutivo || radicado.id}.pdf`,
                serverRelativeUrl: radicado.adjuntos_url,
                downloadUrl: `/api/externo/radicado/${radicado.id}/download`,
                isExternal: true
            };
        }

        return NextResponse.json({
            id: radicado.id,
            proveedor: radicado.Proveedor || "N/A",
            nit: radicado.Nit || "N/A",
            valorTotal: radicado.Monto != null ? String(radicado.Monto) : "0",
            nroFactura: radicado.Nro_Factura || radicado.Consecutivo || "N/A",
            consecutivo: radicado.Consecutivo || "N/A",
            fechaRegistro: radicado.Created || radicado.created_at || new Date().toISOString(),
            estadoFactura: radicado.Aprobacion_Doliente || "Pendiente",
            aprobacionDoliente: radicado.Aprobacion_Doliente || "Pendiente",
            gestionContabilidad: radicado.Gestion_Contabilidad || "Pendiente",
            responsableActual: radicado.Responsable_de_Autorizar || "No asignado",
            documentInfo,
            adjuntosUrl: radicado.adjuntos_url ? [radicado.adjuntos_url] : [],
            distribuciones: radicado.centro_costos || null,
            observaciones: radicado.Observaciones || "",
            anticipo: "",
            moneda: "USD"
        });

    } catch (error: any) {
        console.error('Error fetching public radicado:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
