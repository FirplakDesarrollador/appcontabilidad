import { NextRequest, NextResponse } from 'next/server';
import { getGraphClient } from '@/lib/sharepoint';

export const dynamic = 'force-dynamic';

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const client = await getGraphClient();

        const siteResponse = await client.api('/sites/firplaksa.sharepoint.com:/sites/FPKContabilidad').get();
        const siteId = siteResponse.id;

        const drives = await client.api(`/sites/${siteId}/drives`).get();
        const drive = drives.value.find((d: any) => d.name === 'RECEPCIÓN FACTURAS');
        
        if (!drive) return NextResponse.json({ error: 'Drive RECEPCIÓN FACTURAS not found' }, { status: 404 });

        // Search in this specific drive
        const searchRes = await client.api(`/drives/${drive.id}/root/search(q='TLO112664')`).get();
        
        return NextResponse.json({
            driveName: drive.name,
            results: searchRes.value.map((i: any) => ({
                name: i.name,
                webUrl: i.webUrl,
                id: i.id
            }))
        });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
