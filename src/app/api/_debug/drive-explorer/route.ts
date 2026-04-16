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

        const drives = await client.api(`/sites/${siteId}/drives`).get();
        
        let driveExplorer: any[] = [];
        for (const drive of drives.value) {
            try {
                const children = await client.api(`/drives/${drive.id}/root/children`).get();
                driveExplorer.push({
                    driveName: drive.name,
                    driveId: drive.id,
                    children: children.value.map((c: any) => ({
                        name: c.name,
                        id: c.id,
                        folder: c.folder ? true : false,
                        file: c.file ? true : false
                    }))
                });
            } catch (e: any) {
                driveExplorer.push({ driveName: drive.name, error: e.message });
            }
        }

        writeFileSync(join(process.cwd(), 'debug_drive_explorer.json'), JSON.stringify(driveExplorer, null, 2));
        
        return NextResponse.json({ 
            message: 'Explorer data written to debug_drive_explorer.json',
            drivesTracked: driveExplorer.length
        });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
