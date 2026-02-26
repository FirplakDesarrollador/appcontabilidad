import { NextResponse } from 'next/server';
import { getSharePointInvoices } from '@/lib/sharepoint';

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const page = parseInt(searchParams.get('page') || '1');
        const pageSize = parseInt(searchParams.get('pageSize') || '50');

        const { items, hasMore } = await getSharePointInvoices(page, pageSize);
        return NextResponse.json({ success: true, items, hasMore, page });
    } catch (error: any) {
        console.error('SharePoint list API error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
