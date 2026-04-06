import { NextRequest, NextResponse } from 'next/server';
import { getGraphClient } from '@/lib/sharepoint';
import { writeFileSync } from 'fs';
import { join } from 'path';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        const client = await getGraphClient();

        const siteResponse = await client.api('/sites/firplaksa.sharepoint.com:/sites/FPKContabilidad').get();
        const siteId = siteResponse.id;

        const listsResponse = await client.api(`/sites/${siteId}/lists`).get();
        const list = listsResponse.value.find((l: any) => l.name === 'Registro_de_Facturas' || l.displayName === 'Registro_de_Facturas');
        const listId = list.id;

        const itemsRes = await client.api(`/sites/${siteId}/lists/${listId}/items`)
            .expand('fields')
            .top(10)
            .get();
        
        let report = [];
        for (const item of itemsRes.value) {
            let itemData: any = {
                id: item.id,
                nro: item.fields.Nro_Factura,
                hasAttachmentsField: item.fields.Attachments
            };

            if (item.fields.Attachments) {
                try {
                    const attachments = await client.api(`/sites/${siteId}/lists/${listId}/items/${item.id}/attachments`).get();
                    itemData.attachments = attachments.value;
                    itemData.count = attachments.value?.length || 0;
                } catch (e: any) {
                    itemData.error = e.message;
                }
            }
            report.push(itemData);
        }
        
        writeFileSync(join(process.cwd(), 'debug_attachments_report.json'), JSON.stringify(report, null, 2));

        return NextResponse.json({ 
            message: 'Report written to debug_attachments_report.json',
            count: report.length
        });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
