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
        
        // Filter by responsable and status (Pending)
        const pendingItems = items.filter(item => {
            const itemResponsable = String(item.Responsable_de_Autorizar || "").toLowerCase();
            const searchResponsable = responsable.toLowerCase();
            
            const isResponsable = itemResponsable === searchResponsable;
            const status = (item.Aprobacion_Doliente || "Pendiente").toLowerCase();
            const isPending = status.includes("pendiente") || status.includes("por aprobar");
            
            return isResponsable && isPending;
        });

        // Normalize data for the view
        const normalized = pendingItems.map(item => {
             const nitValue = item.Title || item.Nit_x0020_ || item["Nit "] || item.Nit || "N/A";
             const valorTotal = item.Valortotal ?? item.Valor_x0020_total ?? item["Valor total"] ?? item.Monto ?? 0;
             return {
                 id: item.id,
                 proveedor: item.Proveedor || "N/A",
                 nit: nitValue,
                 valorTotal: valorTotal.toString(),
                 nroFactura: item.Nro_Factura || "N/A",
                 fechaRegistro: item.Created || item.OData__RegistrationDate,
                 aprobacionDoliente: item.Aprobacion_Doliente || "Pendiente",
                 responsableActual: item.Responsable_de_Autorizar || "No asignado",
             };
        });

        return NextResponse.json({
            success: true,
            total: normalized.length,
            items: normalized
        });

    } catch (error: any) {
        console.error('Error fetching pending invoices:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
