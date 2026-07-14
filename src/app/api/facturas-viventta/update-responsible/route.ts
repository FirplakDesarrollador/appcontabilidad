import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { itemId, userName, userEmail } = body;

        if (!itemId || !userName) {
            return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 });
        }

        const { error } = await supabase
            .from('Facturas_Viventta')
            .update({
                Responsable_de_Autorizar: userName,
                Responsable_email: userEmail || ''
            })
            .eq('id', itemId);

        if (error) {
            throw error;
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Error in facturas-viventta/update-responsible:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
