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

        const listsRes = await client.api(`/sites/${siteId}/lists`).get();
        
        const libraries = listsRes.value.map((l: any) => ({
            name: l.name,
            displayName: l.displayName,
            template: l.list?.template,
            id: l.id
        }));

        writeFileSync(join(process.cwd(), 'debug_all_lists.json'), JSON.stringify(libraries, null, 2));
        
        return NextResponse.json({ count: libraries.length });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
