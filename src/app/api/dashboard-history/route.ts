import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const limitDays = parseInt(searchParams.get('days') || '7');

        // Fetch the records grouped by date
        const { data, error } = await supabase
            .from('Historial_Metricas_Diarias')
            .select('*')
            .order('fecha', { ascending: false })
            // we multiply by 4 because there are 4 modules per day
            .limit(limitDays * 4);

        if (error) {
            // Si la tabla no existe, devolver un array vacío graciosamente
            if (error.code === '42P01') {
                return NextResponse.json({ success: true, history: [] });
            }
            throw error;
        }

        // Transformar los datos para la gráfica / tabla
        // Formato deseado: [{ fecha: '2026-07-23', totalRadicadas: 8, totalRadicadasAcumuladas: 100, ...}, ...]
        const groupedByDate: Record<string, any> = {};
        
        // Calcular "aprobadas" basadas en: (por aprobar ayer) + (radicadas hoy) - (por aprobar hoy)
        // Y calcular acumulado de aprobadas por mes
        // Para esto necesitamos iterar de más antiguo a más reciente
        const lastPorAprobarByModule: Record<string, number> = {};
        const aprobadasAcumuladas: Record<string, number> = {}; // key: "YYYY-MM_modulo"
        const digitadasAcumuladas: Record<string, number> = {}; // key: "YYYY-MM_modulo"
        const reversedData = [...(data || [])].reverse();
        
        reversedData.forEach((row: any) => {
            const monthKey = row.fecha.substring(0, 7); // "YYYY-MM"
            const accumKey = `${monthKey}_${row.modulo}`;

            let aprobadasDia = 0;
            if (lastPorAprobarByModule[row.modulo] !== undefined) {
                aprobadasDia = lastPorAprobarByModule[row.modulo] + (row.radicadas || 0) - row.por_aprobar;
                if (aprobadasDia < 0) aprobadasDia = 0;
            }
            lastPorAprobarByModule[row.modulo] = row.por_aprobar;
            row.aprobadas = aprobadasDia;

            if (aprobadasAcumuladas[accumKey] === undefined) {
                aprobadasAcumuladas[accumKey] = 0;
            }
            aprobadasAcumuladas[accumKey] += aprobadasDia;
            row.aprobadas_acumuladas_mes = aprobadasAcumuladas[accumKey];

            const totalDigitadasDia = (row.procesadas_mateo || 0) + (row.procesadas_duvan || 0) + (row.procesadas_jesus || 0);
            if (digitadasAcumuladas[accumKey] === undefined) {
                digitadasAcumuladas[accumKey] = 0;
            }
            digitadasAcumuladas[accumKey] += totalDigitadasDia;
            row.digitadas_acumuladas_mes = digitadasAcumuladas[accumKey];
        });

        data?.forEach((row: any) => {
            if (!groupedByDate[row.fecha]) {
                groupedByDate[row.fecha] = {
                    fecha: row.fecha,
                    totalRadicadas: 0,
                    totalRadicadasAcumuladas: 0,
                    totalAprobadas: 0,
                    totalAprobadasAcumuladas: 0,
                    totalDigitadasAcumuladas: 0,
                    totalAprobar: 0,
                    totalProcesar: 0,
                    totalVencidas: 0,
                    mateo: 0,
                    duvan: 0,
                    jesus: 0,
                    modulos: []
                };
            }
            
            groupedByDate[row.fecha].totalRadicadas += (row.radicadas || 0);
            groupedByDate[row.fecha].totalRadicadasAcumuladas += (row.radicadas_acumuladas || 0);
            groupedByDate[row.fecha].totalAprobadas += (row.aprobadas || 0);
            groupedByDate[row.fecha].totalAprobadasAcumuladas += (row.aprobadas_acumuladas_mes || 0);
            groupedByDate[row.fecha].totalDigitadasAcumuladas += (row.digitadas_acumuladas_mes || 0);
            groupedByDate[row.fecha].totalAprobar += row.por_aprobar;
            groupedByDate[row.fecha].totalProcesar += row.por_procesar;
            groupedByDate[row.fecha].totalVencidas += (row.por_aprobar_vencidas || 0);
            groupedByDate[row.fecha].mateo += (row.procesadas_mateo || 0);
            groupedByDate[row.fecha].duvan += (row.procesadas_duvan || 0);
            groupedByDate[row.fecha].jesus += (row.procesadas_jesus || 0);
            groupedByDate[row.fecha].modulos.push({
                nombre: row.modulo,
                radicadas: (row.radicadas || 0),
                radicadasAcumuladas: (row.radicadas_acumuladas || 0),
                aprobadas: (row.aprobadas || 0),
                aprobadasAcumuladas: (row.aprobadas_acumuladas_mes || 0),
                digitadasAcumuladas: (row.digitadas_acumuladas_mes || 0),
                porAprobar: row.por_aprobar,
                porProcesar: row.por_procesar,
                vencidas: (row.por_aprobar_vencidas || 0),
                mateo: (row.procesadas_mateo || 0),
                duvan: (row.procesadas_duvan || 0),
                jesus: (row.procesadas_jesus || 0)
            });
        });

        // Convertir de nuevo a array y ordenar ascendente para gráficos (o descendente para la tabla, aquí lo dejaremos desc)
        const historyArray = Object.values(groupedByDate).sort((a: any, b: any) => 
            new Date(b.fecha).getTime() - new Date(a.fecha).getTime()
        );

        return NextResponse.json({ success: true, history: historyArray });

    } catch (error: any) {
        console.error('Error fetching dashboard history:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
