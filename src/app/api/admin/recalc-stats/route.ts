import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/**
 * GET /api/admin/recalc-stats?from=2026-07-01&to=2026-07-27
 * 
 * 1. Backfills missing DigitadoPor for Registro_Facturas procesadas
 * 2. Recalculates procesadas_mateo/duvan/jesus in Historial_Metricas_Diarias
 *    for each date in the range [from, to]
 */
export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const from = searchParams.get('from');
        const to = searchParams.get('to');

        if (!from || !to) {
            return NextResponse.json({ error: 'Parámetros requeridos: ?from=YYYY-MM-DD&to=YYYY-MM-DD' }, { status: 400 });
        }

        const log: any[] = [];

        // ─── Step 1: Backfill DigitadoPor para facturas procesadas sin digitador ───
        // Estas facturas tienen FechaProcesado (desde SharePoint) pero DigitadoPor vacío
        // porque el update-status escribía a la tabla equivocada
        const { data: missingDP, error: backfillErr } = await supabaseAdmin
            .from('Registro_Facturas')
            .select('ID, DigitadoPor, FechaProcesado, Modificado_por')
            .eq('Gestion_Contabilidad', 'Procesado')
            .or('DigitadoPor.is.null,DigitadoPor.eq.')
            .not('FechaProcesado', 'is', null);

        if (backfillErr) {
            log.push({ paso: '1_backfill', error: backfillErr.message });
        } else {
            log.push({ 
                paso: '1_backfill_info', 
                facturas_sin_digitador: missingDP?.length || 0,
                nota: 'Estas facturas tienen FechaProcesado pero sin DigitadoPor. No se puede determinar quién las digitó automáticamente. Se requiere corrección manual o verificar con Duván/Mateo.'
            });
        }

        // ─── Step 2: Recalcular stats por cada fecha en el rango ───
        const getCount = async (table: string, filters: (query: any) => any) => {
            try {
                let query = supabaseAdmin.from(table).select('*', { count: 'exact', head: true });
                query = filters(query);
                const { count, error } = await query;
                if (error) {
                    console.warn(`[Recalc] Warning counting ${table}:`, error.message);
                    return 0;
                }
                return count || 0;
            } catch (err: any) {
                console.warn(`[Recalc] Error counting ${table}:`, err.message);
                return 0;
            }
        };

        const startDate = new Date(from + 'T00:00:00');
        const endDate = new Date(to + 'T00:00:00');

        for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
            const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            const nextDay = new Date(d);
            nextDay.setDate(nextDay.getDate() + 1);
            const nextDateStr = `${nextDay.getFullYear()}-${String(nextDay.getMonth() + 1).padStart(2, '0')}-${String(nextDay.getDate()).padStart(2, '0')}`;

            // Facturas: usa DigitadoPor (no ProcesadoPor, esa columna no existe en esta tabla)
            const facturasMateo = await getCount('Registro_Facturas', q =>
                q.eq('DigitadoPor', 'Mateo Benavides Rios').gte('FechaProcesado', dateStr).lt('FechaProcesado', nextDateStr));
            const facturasDuvan = await getCount('Registro_Facturas', q =>
                q.eq('DigitadoPor', 'Duvan Esteban Ramirez Rua').gte('FechaProcesado', dateStr).lt('FechaProcesado', nextDateStr));
            const facturasJesus = await getCount('Registro_Facturas', q =>
                q.eq('DigitadoPor', 'Jesús Angel Villalobos Rincon').gte('FechaProcesado', dateStr).lt('FechaProcesado', nextDateStr));
            // Total facturas procesadas ese día (para detectar sin asignar)
            const facturasTotal = await getCount('Registro_Facturas', q =>
                q.gte('FechaProcesado', dateStr).lt('FechaProcesado', nextDateStr));
            const facturasSinAsignar = facturasTotal - facturasMateo - facturasDuvan - facturasJesus;

            // Documentos: usa ProcesadoPor
            const documentosMateo = await getCount('Documento_Soporte', q =>
                q.eq('ProcesadoPor', 'Mateo Benavides Rios').gte('FechaProcesado', dateStr).lt('FechaProcesado', nextDateStr));
            const documentosDuvan = await getCount('Documento_Soporte', q =>
                q.eq('ProcesadoPor', 'Duvan Esteban Ramirez Rua').gte('FechaProcesado', dateStr).lt('FechaProcesado', nextDateStr));
            const documentosJesus = await getCount('Documento_Soporte', q =>
                q.eq('ProcesadoPor', 'Jesús Angel Villalobos Rincon').gte('FechaProcesado', dateStr).lt('FechaProcesado', nextDateStr));

            // Radicados: usa ProcesadoPor
            const radicadosMateo = await getCount('Radicados_de_importacion', q =>
                q.eq('ProcesadoPor', 'Mateo Benavides Rios').gte('FechaProcesado', dateStr).lt('FechaProcesado', nextDateStr));
            const radicadosDuvan = await getCount('Radicados_de_importacion', q =>
                q.eq('ProcesadoPor', 'Duvan Esteban Ramirez Rua').gte('FechaProcesado', dateStr).lt('FechaProcesado', nextDateStr));
            const radicadosJesus = await getCount('Radicados_de_importacion', q =>
                q.eq('ProcesadoPor', 'Jesús Angel Villalobos Rincon').gte('FechaProcesado', dateStr).lt('FechaProcesado', nextDateStr));

            // Viventta: usa ProcesadoPor
            const viventtaMateo = await getCount('Facturas_Viventta', q =>
                q.eq('ProcesadoPor', 'Mateo Benavides Rios').gte('FechaProcesado', dateStr).lt('FechaProcesado', nextDateStr));
            const viventtaDuvan = await getCount('Facturas_Viventta', q =>
                q.eq('ProcesadoPor', 'Duvan Esteban Ramirez Rua').gte('FechaProcesado', dateStr).lt('FechaProcesado', nextDateStr));
            const viventtaJesus = await getCount('Facturas_Viventta', q =>
                q.eq('ProcesadoPor', 'Jesús Angel Villalobos Rincon').gte('FechaProcesado', dateStr).lt('FechaProcesado', nextDateStr));

            const modules = [
                { modulo: 'Aprobación de facturas', mateo: facturasMateo, duvan: facturasDuvan, jesus: facturasJesus, sinAsignar: facturasSinAsignar },
                { modulo: 'Aprobación de documentos', mateo: documentosMateo, duvan: documentosDuvan, jesus: documentosJesus },
                { modulo: 'Radicados de importación', mateo: radicadosMateo, duvan: radicadosDuvan, jesus: radicadosJesus },
                { modulo: 'Facturas Viventta', mateo: viventtaMateo, duvan: viventtaDuvan, jesus: viventtaJesus },
            ];

            const dateResults: any = { fecha: dateStr, modulos: [] };

            for (const mod of modules) {
                const { error: updErr } = await supabaseAdmin
                    .from('Historial_Metricas_Diarias')
                    .update({
                        procesadas_mateo: mod.mateo,
                        procesadas_duvan: mod.duvan,
                        procesadas_jesus: mod.jesus,
                    })
                    .eq('fecha', dateStr)
                    .eq('modulo', mod.modulo);

                dateResults.modulos.push({
                    ...mod,
                    total: mod.mateo + mod.duvan + mod.jesus,
                    actualizado: !updErr,
                    error: updErr?.message
                });
            }

            dateResults.totalGeneral = {
                mateo: modules.reduce((s, m) => s + m.mateo, 0),
                duvan: modules.reduce((s, m) => s + m.duvan, 0),
                jesus: modules.reduce((s, m) => s + m.jesus, 0),
                total: modules.reduce((s, m) => s + m.mateo + m.duvan + m.jesus, 0),
                sinAsignarFacturas: facturasSinAsignar,
            };

            log.push(dateResults);
        }

        return NextResponse.json({ success: true, resultados: log });

    } catch (error: any) {
        console.error('[Recalc] Error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
