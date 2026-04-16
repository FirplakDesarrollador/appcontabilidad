import { NextRequest, NextResponse } from 'next/server';
import { createSapDraft } from '@/lib/sap';

export async function POST(req: NextRequest) {
    try {
        const payload = await req.json();
        const { isApproval } = payload;

        // 0. Only process if it's an approval
        if (!isApproval) {
            console.log(`SAP Draft: Skipping creation because isApproval is false.`);
            return NextResponse.json({ success: true, message: "Factura rechazada, no se envía a SAP" });
        }

        const result = await createSapDraft(payload);
        
        return NextResponse.json(result);

    } catch (error: any) {
        console.error('SAP Draft API Error:', error);
        return NextResponse.json({ 
            error: error.message || 'Error processing SAP Draft',
            details: error.details 
        }, { status: 500 });
    }
}

