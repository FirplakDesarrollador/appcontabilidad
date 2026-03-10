import { NextRequest, NextResponse } from 'next/server';
import { getGraphClient } from '@/lib/sharepoint';

export async function POST(req: NextRequest) {
    try {
        const { itemId, action, observaciones, centroCostos, cuenta, valor } = await req.json();

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
        const list = listsResponse.value.find((l: any) => l.name === 'Registro_de_Facturas' || l.displayName === 'Registro_de_Facturas');

        if (!list) throw new Error('SharePoint list "Registro_de_Facturas" not found');
        const listId = list.id;

        // 3. Update the Item
        const updatePayload: any = {
            Aprobacion_Doliente: action,
            Gestion_Contabilidad: action === 'Aprobado' ? 'Procesado' : 'Rechazado'
        };

        if (observaciones) {
            updatePayload.Observaciones = observaciones;
        }

        if (centroCostos || cuenta) {
            const centroCostosArray = [{
                centroCosto: centroCostos || "",
                cuenta: cuenta || "",
                valor: valor ? String(valor) : "0"
            }];
            updatePayload.centro_costos = JSON.stringify(centroCostosArray);
        }

        await client.api(`/sites/${siteId}/lists/${listId}/items/${itemId}/fields`).patch(updatePayload);

        console.log(`Public update for item ${itemId} to ${action} successful`);
        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Error in public action API:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
