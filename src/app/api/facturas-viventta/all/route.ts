import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        const searchParams = req.nextUrl.searchParams;
        const pending = searchParams.get('pending') === 'true';
        const processed = searchParams.get('processed') === 'true';
        const offset = parseInt(searchParams.get('offset') || '0', 10);
        const limit = parseInt(searchParams.get('limit') || '100', 10);

        let query = supabase.from('Facturas_Viventta').select('*', { count: 'exact' });

        if (pending) {
            query = query.not('Aprobacion_Doliente', 'in', '("Aprobado","Rechazado")');
        } else if (processed) {
            query = query.in('Aprobacion_Doliente', ['Aprobado', 'Rechazado']);
        }

        query = query.order('id', { ascending: false }).range(offset, offset + limit - 1);

        const { data, count, error } = await query;

        if (error) {
            throw error;
        }

        // Count pending
        const { count: pendingCount } = await supabase
            .from('Facturas_Viventta')
            .select('*', { count: 'exact', head: true })
            .not('Aprobacion_Doliente', 'in', '("Aprobado","Rechazado")');

        // Count processed
        const { count: processedCount } = await supabase
            .from('Facturas_Viventta')
            .select('*', { count: 'exact', head: true })
            .in('Aprobacion_Doliente', ['Aprobado', 'Rechazado']);

        const toProcessCount = 0;

        return NextResponse.json({
            success: true,
            items: data || [],
            totalCount: count,
            pendingCount: pendingCount || 0,
            processedCount: processedCount || 0,
            toProcessCount,
            source: 'supabase'
        });

    } catch (error: any) {
        console.error('Error in facturas-viventta/all:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
