import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin';

export async function PATCH(req: NextRequest) {
    try {
        const body = await req.json();
        const { id, ...updateData } = body;

        if (!id) {
            return NextResponse.json({ error: 'Missing invoice id' }, { status: 400 });
        }

        const { data, error } = await supabase
            .from('Facturas_Viventta')
            .update(updateData)
            .eq('id', id)
            .select();

        if (error) {
            console.error('Error updating Facturas_Viventta:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        if (!data || data.length === 0) {
            return NextResponse.json({ error: 'No se encontró ni actualizó la factura en Facturas_Viventta' }, { status: 404 });
        }

        return NextResponse.json({ success: true, item: data[0] });

    } catch (error: any) {
        console.error('Error in Viventta update API:', error);
        return NextResponse.json({ error: error.message || 'Error interno del servidor' }, { status: 500 });
    }
}
