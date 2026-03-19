import { NextRequest, NextResponse } from 'next/server';
import { fetchAllSharePointItems } from '@/lib/sharepoint';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        const itemId = req.nextUrl.searchParams.get('id') || '';
        const allItems = await fetchAllSharePointItems();
        
        const item = allItems.find((i: any) => 
            String(i.id) === String(itemId) || 
            i.Nro_Factura === 'TLO112664' ||
            i.Consecutivo === itemId
        );

        if (!item) return NextResponse.json({ error: 'Item not found in all items', count: allItems.length }, { status: 404 });

        return NextResponse.json({
            foundItem: item
        });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
