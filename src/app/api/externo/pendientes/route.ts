import { NextRequest, NextResponse } from 'next/server';
import { fetchAllSharePointItems } from '@/lib/sharepoint';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const responsable = searchParams.get('responsable');

        if (!responsable) {
            return NextResponse.json({ error: 'Missing responsable parameter' }, { status: 400 });
        }

        const [facturas, { data: docData }] = await Promise.all([
            fetchAllSharePointItems('Registro_de_Facturas').then(res => res.map(i => ({ ...i, _isDocSoporte: false }))),
            supabaseAdmin.from('Documento_Soporte').select('*')
        ]);
        
        const mappedDocData = (docData || []).map(item => ({
            ...item,
            _isDocSoporte: true,
            Title: item.nit,
            Proveedor: item.proveedor,
            Valortotal: item.valor_total,
            Consecutivo_Doc_Soporte: item.consecutivo,
            Aprobacion_Doliente: item.aprobacion_doliente,
            Responsable_de_Autorizar: item.responsable_nombre,
            Created: item.fecha_creacion || item.created_at
        }));

        const allItems = [...facturas, ...mappedDocData];

        // Filter by responsable and status (Pending)
        const pendingItems = allItems.filter(item => {
            const itemResponsable = String(item.Responsable_de_Autorizar || "").toLowerCase();
            const searchResponsable = responsable.toLowerCase();
            
            const isResponsable = itemResponsable === searchResponsable;
            const rawStatus = item.Aprobacion_Doliente || item.AprobacionDoliente || "Pendiente";
            const status = String(rawStatus).toLowerCase();
            const isPending = status.includes("pendiente") || status.includes("por aprobar");
            
            return isResponsable && isPending;
        });

        // Normalize data for the view
        const normalized = pendingItems.map(item => {
             const nitValue = item.Title || item.Nit_x0020_ || item["Nit "] || item.Nit || "N/A";
             const valorTotal = item.Valortotal ?? item.Valor_x0020_total ?? item["Valor total"] ?? item.Monto ?? 0;
             const isDocSoporte = item._isDocSoporte;
             const nroDoc = isDocSoporte 
                ? (item.Consecutivo_Doc_Soporte || "S/N") 
                : (item.Nro_Factura || "N/A");
             
             return {
                 id: item.id,
                 proveedor: item.Proveedor || item.tsic || "N/A",
                 nit: nitValue,
                 valorTotal: valorTotal.toString(),
                 nroFactura: nroDoc,
                 fechaRegistro: item.Created || item.OData__RegistrationDate,
                 aprobacionDoliente: item.Aprobacion_Doliente || item.AprobacionDoliente || "Pendiente",
                 responsableActual: item.Responsable_de_Autorizar || "No asignado",
                 tipo: isDocSoporte ? "DOCUMENTO SOPORTE" : "FACTURA"
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
