import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const { data, error } = await supabase
            .from('Proveedores_Viventta')
            .select('Responsables');

        if (error) {
            throw error;
        }

        // Extraer los responsables únicos y que no sean nulos
        const uniqueResponsables = Array.from(new Set(
            data
                .map(d => d.Responsables)
                .filter(Boolean)
        )).sort();

        // Formatear la lista
        const formatted = uniqueResponsables.map((name, index) => ({
            id: String(index + 1),
            name: name,
            email: `${name.toLowerCase().replace(/\s+/g, '.')}@firplak.com`
        }));

        return NextResponse.json({ success: true, items: formatted });
    } catch (error: any) {
        console.error('Error fetching Viventta responsables:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
