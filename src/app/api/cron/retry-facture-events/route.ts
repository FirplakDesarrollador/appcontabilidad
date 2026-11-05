import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { triggerFactureEventForInvoice } from '@/lib/facture';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const MAX_INTENTOS = 5;
// La DIAN rechaza el evento pasados 3 días hábiles desde el recibo de bienes; no se reintenta más allá de 5 días calendario.
const VENTANA_DIAS = 5;
const MAX_POR_EJECUCION = 10;

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/**
 * Reintenta los eventos Facture (aprobación / rechazo) que fallaron.
 * Requiere la migración 20261105110000_facture_event_status.sql.
 */
export async function GET(req: Request) {
    const authHeader = req.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const desde = new Date(Date.now() - VENTANA_DIAS * 24 * 60 * 60 * 1000).toISOString();
    const { data: pendientes, error } = await supabaseAdmin
        .from('Registro_Facturas')
        .select('ID, Nro_Factura, Aprobacion_Doliente, Observaciones, evento_facture_intentos')
        .eq('evento_facture_estado', 'error')
        .in('Aprobacion_Doliente', ['Aprobado', 'Rechazado'])
        .lt('evento_facture_intentos', MAX_INTENTOS)
        .gte('evento_facture_fecha', desde)
        .order('evento_facture_fecha', { ascending: true })
        .limit(MAX_POR_EJECUCION);

    if (error) {
        console.error('[retry-facture-events] Error consultando pendientes:', error.message);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    const resultados: any[] = [];
    for (const f of pendientes || []) {
        const res = await triggerFactureEventForInvoice(f.ID, f.Aprobacion_Doliente, { observaciones: f.Observaciones });
        resultados.push({ id: f.ID, nro: f.Nro_Factura, accion: f.Aprobacion_Doliente, success: res.success, error: res.error });
    }

    const fallidos = resultados.filter(r => !r.success);
    if (fallidos.length) console.error('[retry-facture-events] Eventos que siguen fallando:', JSON.stringify(fallidos));
    return NextResponse.json({ success: true, reintentados: resultados.length, fallidos: fallidos.length, resultados });
}

