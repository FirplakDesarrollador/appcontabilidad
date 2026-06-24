import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

export async function GET(req: NextRequest) {
    try {
        const { data, error } = await supabaseAdmin
            .from('Facturas_Viventta')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching Facturas_Viventta:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, items: data || [] });

    } catch (error: any) {
        console.error('Error in Viventta list API:', error);
        return NextResponse.json({ error: error.message || 'Error interno del servidor' }, { status: 500 });
    }
}
