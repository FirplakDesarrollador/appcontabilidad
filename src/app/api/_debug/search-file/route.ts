import { NextRequest, NextResponse } from 'next/server';
import { getGraphClient } from '@/lib/sharepoint';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        const client = await getGraphClient();

        const siteResponse = await client.api('/sites/firplaksa.sharepoint.com:/sites/FPKContabilidad').get();
        const siteId = siteResponse.id;

        const drives = await client.api(`/sites/${siteId}/drives`).get();
        const drive = drives.value.find((d: any) => d.name === 'Documents');
        
        // Search for TLO112664 in the whole drive
        const searchRes = await client.api(`/drives/${drive.id}/root/search(q='TLO112664')`).get();
        
        return NextResponse.json({
            query: 'TLO112664',
            results: searchRes.value.map((i: any) => ({
                name: i.name,
                id: i.id,
                path: i.parentReference.path,
                webUrl: i.webUrl
            }))
        });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
