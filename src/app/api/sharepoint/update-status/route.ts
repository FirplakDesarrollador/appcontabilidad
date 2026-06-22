import { NextRequest, NextResponse } from 'next/server';
import { getGraphClient } from '@/lib/sharepoint';
import { supabase } from '@/lib/supabaseClient';

export async function POST(req: NextRequest) {
    try {
        const { itemId, status, listName = 'Registro_de_Facturas' } = await req.json();

        if (!itemId || !status) {
            return NextResponse.json({ error: 'Missing itemId or status' }, { status: 400 });
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

        // 3. Update SharePoint
        await client.api(`/sites/${siteId}/lists/${listId}/items/${itemId}/fields`).patch({
            Gestion_Contabilidad: status
        });

        console.log(`Successfully updated Gestion_Contabilidad to ${status} for item ${itemId}`);

        // 4. Update Supabase
        try {
            if (listName === 'Documento_Soporte') {
                await supabase
                    .from('Documento_Soporte')
                    .update({
                        gestion_contabilidad: status,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', Number(itemId));
            } else {
                await supabase
                    .from('Registro_Facturas')
                    .update({
                        Gestion_Contabilidad: status,
                        updated_at: new Date().toISOString()
                    })
                    .eq('ID', Number(itemId));
            }
        } catch (supaErr) {
            console.error('Failed to update Supabase cache:', supaErr);
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Error updating status:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
