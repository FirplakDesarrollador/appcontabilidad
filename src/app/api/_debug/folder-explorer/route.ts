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
        const folderId = '01FQB66DJ5YMABBPN3NVB3PUOTUARQZERA'; // Radicación y automatización Facturas
        
        const children = await client.api(`/drives/${drive.id}/items/${folderId}/children`).get();
        
        return NextResponse.json({
            folder: "Radicación y automatización Facturas",
            children: children.value.map((i: any) => i.name)
        });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
