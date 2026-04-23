import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const query = searchParams.get('q');

        let supabaseQuery = supabase
            .from('Centro_costos')
            .select('Título, codigo')
            .order('Título', { ascending: true });

        if (query && query.length > 0) {
            supabaseQuery = supabaseQuery.or(`Título.ilike.%${query}%,codigo.ilike.%${query}%`);
        }

        const { data, error } = await supabaseQuery.limit(20);

        if (error) throw error;

        return NextResponse.json({ 
            costCenters: data
        });
    } catch (error: any) {
        console.error('Error searching cost centers:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
