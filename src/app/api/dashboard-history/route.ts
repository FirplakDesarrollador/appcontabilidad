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
        // Accept month/year to fetch the full month data
        const now = new Date();
        const colombiaDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(now);
        const defaultYear = parseInt(colombiaDate.substring(0, 4));
        const defaultMonth = parseInt(colombiaDate.substring(5, 7));
        
        const year = parseInt(searchParams.get('year') || String(defaultYear));
        const month = parseInt(searchParams.get('month') || String(defaultMonth));
        
        const monthStr = `${year}-${String(month).padStart(2, '0')}`;
        const firstDay = `${monthStr}-01`;
        // Last day of selected month
        const lastDay = new Date(year, month, 0); // day 0 of next month = last day of this month
        const lastDayStr = `${year}-${String(month).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`;
        
        // We also need the LAST record from the previous month to calculate aprobadas for day 1
        // Fetch previous month's last day of data
        const prevMonth = month === 1 ? 12 : month - 1;
        const prevYear = month === 1 ? year - 1 : year;
        const prevMonthStr = `${prevYear}-${String(prevMonth).padStart(2, '0')}`;
        
        const { data: prevData } = await supabase
            .from('Historial_Metricas_Diarias')
            .select('*')
            .gte('fecha', `${prevMonthStr}-01`)
            .lt('fecha', firstDay)
            .order('fecha', { ascending: false })
            .limit(4); // Last day of prev month, 4 modules

        // Fetch full month of selected data
        const { data, error } = await supabase
            .from('Historial_Metricas_Diarias')
            .select('*')
            .gte('fecha', firstDay)
            .lte('fecha', lastDayStr)
            .order('fecha', { ascending: true });

        if (error) {
            if (error.code === '42P01') {
                return NextResponse.json({ success: true, history: [] });
            }
            throw error;
        }

        const groupedByDate: Record<string, any> = {};
        
        // Initialize lastPorAprobarByModule from the previous month's last day
        const lastPorAprobarByModule: Record<string, number> = {};
        if (prevData && prevData.length > 0) {
            // prevData is ordered desc, so the first entries are from the latest day
            const lastPrevDay = prevData[0].fecha;
            prevData.filter((r: any) => r.fecha === lastPrevDay).forEach((row: any) => {
                lastPorAprobarByModule[row.modulo] = row.por_aprobar;
            });
        }
        
        const aprobadasAcumuladas: Record<string, number> = {};
        const digitadasAcumuladas: Record<string, number> = {};
        
        // Data is already ordered ascending
        (data || []).forEach((row: any) => {
            const accumKey = `${monthStr}_${row.modulo}`;

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
