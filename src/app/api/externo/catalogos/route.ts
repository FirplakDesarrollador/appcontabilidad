import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export async function GET() {
    try {
        const [centrosCostosRes, cuentasRes] = await Promise.all([
            supabase.from('Centro_costos').select('*').order('codigo', { ascending: true }),
            supabase.from('cuentas').select('*').order('Título', { ascending: true })
        ]);

        if (centrosCostosRes.error) throw centrosCostosRes.error;
        if (cuentasRes.error) throw cuentasRes.error;

        return NextResponse.json({
            centrosCostos: centrosCostosRes.data || [],
            cuentas: cuentasRes.data || []
        });
    } catch (error: any) {
        console.error('Error fetching catalog data:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
