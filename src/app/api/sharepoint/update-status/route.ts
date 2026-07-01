import { NextRequest, NextResponse } from 'next/server';
import { getGraphClient } from '@/lib/sharepoint';
import { supabase } from '@/lib/supabaseClient';

export async function POST(req: NextRequest) {
    try {
        const { itemId, status, listName = 'Registro_de_Facturas', field = 'Aprobacion_Doliente' } = await req.json();

        if (!itemId || !status) {
            return NextResponse.json({ error: 'Missing itemId or status' }, { status: 400 });
        }

        if (listName === 'Documento_Soporte') {
            const { error: supaErr } = await supabase
                .from('Documento_Soporte')
                .update({
                    gestion_contabilidad: status,
                    updated_at: new Date().toISOString()
                })
                .eq('id', Number(itemId));
                
            if (supaErr) throw new Error(supaErr.message);
            console.log(`Successfully updated status for Documento_Soporte item ${itemId} in Supabase`);
            return NextResponse.json({ success: true });
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

        const updateData: any = {};
        if (field === 'Gestion_Contabilidad') {
            updateData.Gestion_Contabilidad = status;
        } else {
            updateData.Aprobacion_Doliente = status;
            if (status === 'Aprobado') {
                updateData.Gestion_Contabilidad = 'Por Procesar';
            }
            updateData.FechaAprobacion = new Date().toISOString();
        }

        // 3. Update SharePoint
        await client.api(`/sites/${siteId}/lists/${listId}/items/${itemId}/fields`).patch(updateData);

        console.log(`Successfully updated status for item ${itemId} in SharePoint`);

        // 4. Update Supabase
        try {
            const supaUpdate: any = {
                updated_at: new Date().toISOString()
            };
            if (field === 'Gestion_Contabilidad') {
                supaUpdate.Gestion_Contabilidad = status;
            } else {
                supaUpdate.Aprobacion_Doliente = status;
                supaUpdate.FechaAprobacion = updateData.FechaAprobacion;
                if (status === 'Aprobado') {
                    supaUpdate.Gestion_Contabilidad = 'Por Procesar';
                }
            }

            await supabase
                .from('Registro_Facturas')
                .update(supaUpdate)
                .eq('ID', Number(itemId));
        } catch (supaErr) {
            console.error('Failed to update Supabase cache:', supaErr);
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Error updating status:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
