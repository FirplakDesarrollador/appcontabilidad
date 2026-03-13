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

        // Search for CUFE hash in the site
        const cufe = "fa52b8a340a36f62ec7b619bde1ea73c2531bc4faf0535ab8d1be9b0dd393059f1b275386fb685adc86507cd2f27defc";
        const searchRes = await client.api(`/sites/${siteId}/drive/root/search(q='${cufe}')`).get();
        
        return NextResponse.json({
            query: cufe,
            results: searchRes.value.map((i: any) => ({
                name: i.name,
                id: i.id,
                webUrl: i.webUrl
            }))
        });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
