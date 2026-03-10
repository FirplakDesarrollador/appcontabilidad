import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export async function GET() {
    try {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

        const { data: pData, count: pCount, error: pError } = await supabase
            .from('Facturas pendientes')
            .select('*', { count: 'exact' });

        const { data: rData, count: rCount, error: rError } = await supabase
            .from('Registro_Facturas')
            .select('*', { count: 'exact' });

        return NextResponse.json({
            config: {
                hasUrl: !!url,
                hasKey: !!key,
                nodeEnv: process.env.NODE_ENV
            },
            facturasPendientes: {
                count: pCount,
                error: pError,
                sample: pData ? pData.slice(0, 2) : []
            },
            registroFacturas: {
                count: rCount,
                error: rError,
                sample: rData ? rData.slice(0, 2) : []
            }
        });
    } catch (err: any) {
        return NextResponse.json({ fatalError: err.message });
    }
}
