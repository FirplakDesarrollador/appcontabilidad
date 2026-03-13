import { NextRequest, NextResponse } from 'next/server';
import { getGraphClient } from '@/lib/sharepoint';
import { writeFileSync } from 'fs';
import { join } from 'path';

export const dynamic = 'force-dynamic';

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const client = await getGraphClient();

        const siteResponse = await client.api('/sites/firplaksa.sharepoint.com:/sites/FPKContabilidad').get();
        const siteId = siteResponse.id;

        // Fetch all drives with paging
        let allDrives: any[] = [];
        let driveRes = await client.api(`/sites/${siteId}/drives`).get();
        allDrives = [...driveRes.value];
        
        while (driveRes['@odata.nextLink']) {
             driveRes = await client.api(driveRes['@odata.nextLink']).get();
             allDrives = [...allDrives, ...driveRes.value];
        }
        
        const driveList = allDrives.map((d: any) => ({
            name: d.name,
            id: d.id,
            driveType: d.driveType
        }));

        writeFileSync(join(process.cwd(), 'debug_all_drives.json'), JSON.stringify(driveList, null, 2));

        // Search for the file in the entire site search
        const searchRes = await client.api(`/sites/${siteId}/drive/root/search(q='TLO112664')`).get();

        return NextResponse.json({ 
            drivesCount: allDrives.length,
            driveNames: allDrives.map(d => d.name),
            searchResults: searchRes.value.map((i: any) => i.name)
        });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
