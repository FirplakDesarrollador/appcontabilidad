import { NextRequest, NextResponse } from 'next/server';
import { getGraphClient } from '@/lib/sharepoint';
import { createSapDraft } from '@/lib/sap';

export async function POST(req: NextRequest) {
    try {
        const { itemId, action, observaciones, distribuciones, anticipo, valor, nit, nroFactura, listName = 'Registro_de_Facturas' } = await req.json();

        if (!itemId || !action) {
            return NextResponse.json({ error: 'Missing itemId or action' }, { status: 400 });
        }

        if (action !== 'Aprobado' && action !== 'Rechazado') {
            return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
        }

        const client = await getGraphClient();

        // 1. Resolve Site ID
        const siteResponse = await client.api('/sites/firplaksa.sharepoint.com:/sites/FPKContabilidad').get();
        const siteId = siteResponse.id;

        // 2. Find the List
        const listsResponse = await client.api(`/sites/${siteId}/lists`).get();
        const list = listsResponse.value.find((l: any) => l.name === listName || l.displayName === listName);

        if (!list) throw new Error(`SharePoint list "${listName}" not found`);
        const listId = list.id;

        // 3. Update the Item
        const isDocSoporte = listName === 'Documento_Soporte';
        const updatePayload: any = {};

        if (isDocSoporte) {
            updatePayload.AprobacionDoliente = action;
        } else {
            updatePayload.Aprobacion_Doliente = action;
        }

        if (observaciones) {
            updatePayload.Observaciones = observaciones;
        }
        
        if (anticipo) {
            updatePayload.tiene_anticipo = anticipo;
        }

        if (distribuciones && Array.isArray(distribuciones) && distribuciones.length > 0) {
            const centroCostosArray = distribuciones.map((d: any) => ({
                centroCosto: d.centroCosto || d.centroCostos || "",
                cuenta: d.cuenta || "",
                valor: d.valor ? String(d.valor) : "0"
            }));
            updatePayload.centro_costos = JSON.stringify(centroCostosArray);
        }

        // Apply update to SharePoint
        await client.api(`/sites/${siteId}/lists/${listId}/items/${itemId}/fields`).patch(updatePayload);
        console.log(`SharePoint update for item ${itemId} to ${action} successful`);

        // 4. Trigger SAP Draft Creation on Approval
        let sapResult = null;
        if (action === 'Aprobado') {
            try {
                console.log(`Externo Accion: Triggering SAP Draft for item ${itemId} (NIT: ${nit})...`);
                
                // Fetch the full record from Supabase to get the Consecutivo
                const { data: invoice } = await supabase
                    .from('Registro_Facturas')
                    .select('Consecutivo, Proveedor')
                    .eq('ID', itemId)
                    .single();

                sapResult = await createSapDraft({
                    nit: nit || "",
                    total: valor || "0",
                    distribuciones: distribuciones || [],
                    anticipo: anticipo || 'f',
                    observations: `Proveedor: ${invoice?.Proveedor || 'N/A'} - ${observaciones || 'Aprobado vía portal externo'}`,
                    nroFactura: nroFactura || itemId,
                    docTypeDesc: isDocSoporte ? 'DOCUMENTO SOPORTE' : 'FACTURA',
                    itemId: invoice?.Consecutivo || itemId
                });
            } catch (sapErr: any) {
                console.error('Failed to trigger SAP Draft registration:', sapErr.message);
                sapResult = { success: false, error: sapErr.message };
            }
        }

        return NextResponse.json({ success: true, sap: sapResult });
    } catch (error: any) {
        console.error('Error in externo-accion API:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
