import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({
        databases: [
            process.env.SAP_COMPANY_DB,
            process.env.SAP_COMPANY_DB_VIVENTTA
        ].filter(Boolean) as string[]
    });
}
