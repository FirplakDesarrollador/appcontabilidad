import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const query = searchParams.get('q');
        const limit = parseInt(searchParams.get('limit') || '20');
        const page = parseInt(searchParams.get('page') || '0');

        let supabaseQuery = supabase
            .from('proveedores')
            .select('razon_social, numero_identificacion')
            .order('razon_social', { ascending: true });

        if (query && query.length > 0) {
            supabaseQuery = supabaseQuery.or(`razon_social.ilike.%${query}%,numero_identificacion.ilike.%${query}%`);
        }

        const from = page * limit;
        const to = from + limit - 1;

        const { data, error, count } = await supabaseQuery
            .range(from, to);

        if (error) throw error;

        return NextResponse.json({ 
            providers: data,
            hasMore: data.length === limit
        });
    } catch (error: any) {
        console.error('Error searching providers:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
