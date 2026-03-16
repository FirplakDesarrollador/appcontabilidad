import { NextResponse } from 'next/server';
import { getGraphClient } from '@/lib/sharepoint';

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const itemId = searchParams.get('itemId') || '47701';

        const client = await getGraphClient();
        const siteResponse = await client.api('/sites/firplaksa.sharepoint.com:/sites/FPKContabilidad').get();
        const siteId = siteResponse.id;
        
        const listsResponse = await client.api(`/sites/${siteId}/lists`).get();
        const list = listsResponse.value.find((l: any) => l.name === 'Registro_de_Facturas' || l.displayName === 'Registro_de_Facturas');
        const listId = list.id;

        const results: any = {};

        // 1. Intentar obtener el Drive de la lista
        try {
            results.listDrive = await client.api(`/sites/${siteId}/lists/${listId}/drive`).get();
        } catch (e: any) {
            results.listDrive = { error: e.message };
        }

        // 2. Intentar buscar carpetas llamadas "Attachments" en el drive raíz del sitio
        try {
            const rootChildren = await client.api(`/sites/${siteId}/drive/root/children`).get();
            results.rootChildren = rootChildren.value.map((c: any) => c.name);
        } catch (e: any) {
            results.rootChildren = { error: e.message };
        }

        return NextResponse.json({
            success: true,
            itemId,
            results
        });

    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
