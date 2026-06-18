import { NextRequest, NextResponse } from 'next/server';
import { fetchAllSharePointItems } from '@/lib/sharepoint';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const responsable = searchParams.get('responsable');

        if (!responsable) {
            return NextResponse.json({ error: 'Missing responsable parameter' }, { status: 400 });
        }

        const items = await fetchAllSharePointItems();
        
        // Filter by responsable and status (Aprobado or Rechazado)
        const historyItems = items.filter(item => {
            const itemResponsable = String(item.Responsable_de_Autorizar || "").toLowerCase();
            const searchResponsable = responsable.toLowerCase();
            
            const isResponsable = itemResponsable === searchResponsable;
            const status = (item.Aprobacion_Doliente || "Pendiente").toLowerCase();
            const isProcessed = status.includes("aprobado") || status.includes("rechazado");
            
            return isResponsable && isProcessed;
        });

        // Normalize data for the view
        const normalized = historyItems.map(item => {
             const nitValue = item.Title || item.Nit_x0020_ || item["Nit "] || item.Nit || "N/A";
             const valorTotal = item.Valortotal ?? item.Valor_x0020_total ?? item["Valor total"] ?? item.Monto ?? 0;
             return {
                 id: item.id,
                 proveedor: item.Proveedor || "N/A",
                 nit: nitValue,
                 valorTotal: valorTotal.toString(),
                 nroFactura: item.Nro_Factura || "N/A",
                 fechaRegistro: item.Created || item.OData__RegistrationDate,
                 fechaAprobacion: item.FechaAprobacion || item.Modified || null,
                 aprobacionDoliente: item.Aprobacion_Doliente || "Desconocido",
                 responsableActual: item.Responsable_de_Autorizar || "No asignado",
             };
        });

        // Sort by fechaAprobacion descending (most recent first)
        normalized.sort((a, b) => {
            const dateA = a.fechaAprobacion ? new Date(a.fechaAprobacion).getTime() : 0;
            const dateB = b.fechaAprobacion ? new Date(b.fechaAprobacion).getTime() : 0;
            return dateB - dateA;
        });

        return NextResponse.json({
            success: true,
            total: normalized.length,
            items: normalized
        });

    } catch (error: any) {
        console.error('Error fetching approval history:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
