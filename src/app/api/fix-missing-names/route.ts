import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export async function GET(req: Request) {
    try {
        console.log('[FIX] Iniciando reparación de nombres...');

        // 1. Obtener facturas con Nombre_Emisor vacío
        const { data: pendientes, error: pError } = await supabase
            .from('Facturas pendientes')
            .select('*')
            .or('Nombre_Emisor.is.null, Nombre_Emisor.eq.""');

        if (pError) throw pError;
        if (!pendientes || pendientes.length === 0) {
            return NextResponse.json({ success: true, message: 'No hay facturas para reparar.' });
        }

        // 2. Obtener nombres desde Registro_Facturas
        const { data: registros, error: rError } = await supabase
            .from('Registro_Facturas')
            .select('Nit, Proveedor')
            .order('ID', { ascending: false });

        if (rError) throw rError;

        const nitMap: Record<string, string> = {};
        const normalize = (nit: any) => String(nit || '').replace(/[^0-9]/g, '').slice(0, 9);
        
        registros.forEach(r => {
            const n = normalize(r.Nit);
            if (n && r.Proveedor && !nitMap[n]) nitMap[n] = r.Proveedor;
        });

        // 3. Reparar mediante DELETE + INSERT (si update falla)
        let updated = 0;
        let failed = 0;

        for (const p of pendientes) {
            const normNit = normalize(p.NIT_Emisor);
            const nombre = nitMap[normNit];

            if (nombre) {
                // Primero intentamos UPDATE
                const { error: uError, data: uData } = await supabase
                    .from('Facturas pendientes')
                    .update({ Nombre_Emisor: nombre })
                    .eq('ID', p.ID)
                    .select();

                if (!uError && uData && uData.length > 0) {
                    updated++;
                } else {
                    // Si UPDATE falla o no afecta filas, intentamos DELETE + INSERT
                    // (Cuidado: esto es agresivo, pero si el UPDATE falló por RLS, esto podría fallar también)
                    const { error: dError } = await supabase.from('Facturas pendientes').delete().eq('ID', p.ID);
                    if (!dError) {
                        const { error: iError } = await supabase.from('Facturas pendientes').insert({ ...p, Nombre_Emisor: nombre });
                        if (!iError) updated++;
                        else {
                            console.error(`[FIX] Error re-insertando ID ${p.ID}:`, iError);
                            failed++;
                            // Intentamos restaurar original si falló
                            await supabase.from('Facturas pendientes').insert(p);
                        }
                    } else {
                        failed++;
                    }
                }
            }
        }

        return NextResponse.json({
            success: true,
            totalFound: pendientes.length,
            repaired: updated,
            failed: failed
        });

    } catch (error: any) {
        console.error('[FIX] Error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
