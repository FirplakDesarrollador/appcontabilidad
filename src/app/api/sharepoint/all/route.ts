import { NextResponse } from 'next/server';
import { fetchAllSharePointItems } from '@/lib/sharepoint';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const refresh = searchParams.get('refresh') === 'true';

        if (!refresh) {
            console.log('[API] Fetching invoices from Supabase cache...');
            const { data, error } = await supabase
                .from('Registro_Facturas')
                .select('*')
                .order('ID', { ascending: false });

            if (!error && data && data.length > 0) {
                return NextResponse.json({
                    success: true,
                    total: data.length,
                    items: data,
                    source: 'cache'
                });
            }
            console.log('[API] Cache empty or error, falling back to SharePoint...');
        }

        console.log('[API] Fetching all invoices from SharePoint (Direct)...');
        const items = await fetchAllSharePointItems();

        return NextResponse.json({
            success: true,
            total: items.length,
            items,
            source: 'sharepoint'
        });
    } catch (error: any) {
        console.error('SharePoint all items API error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
