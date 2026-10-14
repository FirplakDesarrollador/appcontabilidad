import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST() {
    return NextResponse.json({
        success: true,
        message: 'La sincronización con SharePoint ha sido desactivada. Supabase es la única base de datos activa.'
    });
}

export async function GET() {
    return NextResponse.json({
        success: true,
        message: 'La sincronización con SharePoint ha sido desactivada. Supabase es la única base de datos activa.'
    });
}
