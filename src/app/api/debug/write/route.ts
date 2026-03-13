import { NextRequest, NextResponse } from 'next/server';
import { getSharePointInvoiceById } from '@/lib/sharepoint';
import { writeFileSync } from 'fs';
import { join } from 'path';

export const dynamic = 'force-dynamic';

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: itemId } = await params;
        const invoice = await getSharePointInvoiceById(itemId);

        // Write to file to avoid console truncation
        const debugPath = join(process.cwd(), 'debug_invoice.json');
        writeFileSync(debugPath, JSON.stringify(invoice, null, 2));

        return NextResponse.json({ 
            message: 'Debug data written to debug_invoice.json',
            path: debugPath,
            id: invoice.id,
            fieldsCount: Object.keys(invoice).length
        });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
