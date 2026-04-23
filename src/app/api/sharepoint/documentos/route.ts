import { NextResponse } from 'next/server';
import { fetchAllSharePointItems } from '@/lib/sharepoint';

export async function GET() {
    try {
        const items = await fetchAllSharePointItems('Documento_Soporte');

        return NextResponse.json({
            success: true,
            total: items.length,
            items
        });
    } catch (error: any) {
        console.error('SharePoint Documento_Soporte API error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
