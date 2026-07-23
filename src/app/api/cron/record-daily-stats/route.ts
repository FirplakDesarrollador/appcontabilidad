import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // 60 segundos máx

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET(req: Request) {
    try {
        // Verificar token de seguridad de Vercel (si está configurado)
        const { searchParams } = new URL(req.url);
        const secret = searchParams.get('secret');
        if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        console.log('[Cron] Guardando historial de métricas diario...');

        // Funciones auxiliares para simplificar el conteo
        const getCount = async (table: string, filters: (query: any) => any) => {
            let query = supabaseAdmin.from(table).select('*', { count: 'exact', head: true });
            query = filters(query);
            const { count, error } = await query;
            if (error) throw error;
            return count || 0;
        };

        const todayDate = new Date();
        const today = todayDate.toISOString().split('T')[0]; // YYYY-MM-DD
        const firstDayOfMonth = new Date(todayDate.getFullYear(), todayDate.getMonth(), 1).toISOString().split('T')[0]; // YYYY-MM-01

        const getTwoBusinessDaysAgo = (date: Date) => {
            let d = new Date(date);
            let count = 0;
            while (count < 2) {
                d.setDate(d.getDate() - 1);
                if (d.getDay() !== 0 && d.getDay() !== 6) { // 0 = Sun, 6 = Sat
                    count++;
                }
            }
            return d.toISOString().split('T')[0];
        };
        const twoDaysAgo = getTwoBusinessDaysAgo(todayDate);

        // 1. Aprobación de Facturas
        const facturasPorAprobar = await getCount('Registro_Facturas', q => q.eq('Aprobacion_Doliente', 'Por Aprobar'));
        const facturasPorProcesar = await getCount('Registro_Facturas', q => 
            q.eq('Aprobacion_Doliente', 'Aprobado')
             .ilike('Gestion_Contabilidad', '%POR PROCESAR%')
             .or('Procesado.eq.false,Procesado.is.null')
        );
        const facturasRadicadas = await getCount('Registro_Facturas', q => q.gte('Creado', today));
        const facturasAcumuladas = await getCount('Registro_Facturas', q => q.gte('Creado', firstDayOfMonth));
        const facturasVencidas = await getCount('Registro_Facturas', q => q.eq('Aprobacion_Doliente', 'Por Aprobar').lte('Creado', twoDaysAgo));
        const facturasMateo = await getCount('Registro_Facturas', q => q.eq('ProcesadoPor', 'Mateo Benavides Rios').gte('FechaProcesado', today));
        const facturasDuvan = await getCount('Registro_Facturas', q => q.eq('ProcesadoPor', 'Duvan Esteban Ramirez Rua').gte('FechaProcesado', today));
        const facturasJesus = await getCount('Registro_Facturas', q => q.eq('ProcesadoPor', 'Jesús Angel Villalobos Rincon').gte('FechaProcesado', today));

        // 2. Aprobación de Documentos
        const documentosPorAprobar = await getCount('Documento_Soporte', q => q.in('aprobacion_doliente', ['Por Aprobar', 'Pendiente']));
        const documentosPorProcesar = await getCount('Documento_Soporte', q => 
            q.eq('aprobacion_doliente', 'Aprobado')
             .ilike('gestion_contabilidad', '%POR PROCESAR%')
        );
        const documentosRadicadas = await getCount('Documento_Soporte', q => q.gte('fecha_creacion', today));
        const documentosAcumuladas = await getCount('Documento_Soporte', q => q.gte('fecha_creacion', firstDayOfMonth));
        const documentosVencidas = await getCount('Documento_Soporte', q => q.in('aprobacion_doliente', ['Por Aprobar', 'Pendiente']).lte('fecha_creacion', twoDaysAgo));
        const documentosMateo = await getCount('Documento_Soporte', q => q.eq('ProcesadoPor', 'Mateo Benavides Rios').gte('FechaProcesado', today));
        const documentosDuvan = await getCount('Documento_Soporte', q => q.eq('ProcesadoPor', 'Duvan Esteban Ramirez Rua').gte('FechaProcesado', today));
        const documentosJesus = await getCount('Documento_Soporte', q => q.eq('ProcesadoPor', 'Jesús Angel Villalobos Rincon').gte('FechaProcesado', today));

        // 3. Radicados de Importación
        const radicadosPorAprobar = await getCount('Radicados_de_importacion', q => q.in('Aprobacion_Doliente', ['Por Aprobar', 'Pendiente']));
        const radicadosPorProcesar = await getCount('Radicados_de_importacion', q => 
            q.eq('Aprobacion_Doliente', 'Aprobado')
             .ilike('Gestion_Contabilidad', '%POR PROCESAR%')
        );
        const radicadosRadicadas = await getCount('Radicados_de_importacion', q => q.gte('Created', today));
        const radicadosAcumuladas = await getCount('Radicados_de_importacion', q => q.gte('Created', firstDayOfMonth));
        const radicadosVencidas = await getCount('Radicados_de_importacion', q => q.in('Aprobacion_Doliente', ['Por Aprobar', 'Pendiente']).lte('Created', twoDaysAgo));
        const radicadosMateo = await getCount('Radicados_de_importacion', q => q.eq('ProcesadoPor', 'Mateo Benavides Rios').gte('FechaProcesado', today));
        const radicadosDuvan = await getCount('Radicados_de_importacion', q => q.eq('ProcesadoPor', 'Duvan Esteban Ramirez Rua').gte('FechaProcesado', today));
        const radicadosJesus = await getCount('Radicados_de_importacion', q => q.eq('ProcesadoPor', 'Jesús Angel Villalobos Rincon').gte('FechaProcesado', today));

        // 4. Facturas Viventta
        const viventtaPorAprobar = await getCount('Facturas_Viventta', q => q.not('Aprobacion_Doliente', 'in', '("Aprobado","Rechazado")'));
        const viventtaPorProcesar = await getCount('Facturas_Viventta', q => 
            q.eq('Aprobacion_Doliente', 'Aprobado')
             .ilike('Gestion_Contabilidad', '%POR PROCESAR%')
        );
        const viventtaRadicadas = await getCount('Facturas_Viventta', q => q.gte('Creado', today));
        const viventtaAcumuladas = await getCount('Facturas_Viventta', q => q.gte('Creado', firstDayOfMonth));
        const viventtaVencidas = await getCount('Facturas_Viventta', q => q.not('Aprobacion_Doliente', 'in', '("Aprobado","Rechazado")').lte('Creado', twoDaysAgo));
        const viventtaMateo = await getCount('Facturas_Viventta', q => q.eq('ProcesadoPor', 'Mateo Benavides Rios').gte('FechaProcesado', today));
        const viventtaDuvan = await getCount('Facturas_Viventta', q => q.eq('ProcesadoPor', 'Duvan Esteban Ramirez Rua').gte('FechaProcesado', today));
        const viventtaJesus = await getCount('Facturas_Viventta', q => q.eq('ProcesadoPor', 'Jesús Angel Villalobos Rincon').gte('FechaProcesado', today));

        const metricsData = [
            {
                fecha: today,
                modulo: 'Aprobación de facturas',
                por_aprobar: facturasPorAprobar,
                por_procesar: facturasPorProcesar,
                radicadas: facturasRadicadas,
                radicadas_acumuladas: facturasAcumuladas,
                por_aprobar_vencidas: facturasVencidas,
                procesadas_mateo: facturasMateo,
                procesadas_duvan: facturasDuvan,
                procesadas_jesus: facturasJesus
            },
            {
                fecha: today,
                modulo: 'Aprobación de documentos',
                por_aprobar: documentosPorAprobar,
                por_procesar: documentosPorProcesar,
                radicadas: documentosRadicadas,
                radicadas_acumuladas: documentosAcumuladas,
                por_aprobar_vencidas: documentosVencidas,
                procesadas_mateo: documentosMateo,
                procesadas_duvan: documentosDuvan,
                procesadas_jesus: documentosJesus
            },
            {
                fecha: today,
                modulo: 'Radicados de importación',
                por_aprobar: radicadosPorAprobar,
                por_procesar: radicadosPorProcesar,
                radicadas: radicadosRadicadas,
                radicadas_acumuladas: radicadosAcumuladas,
                por_aprobar_vencidas: radicadosVencidas,
                procesadas_mateo: radicadosMateo,
                procesadas_duvan: radicadosDuvan,
                procesadas_jesus: radicadosJesus
            },
            {
                fecha: today,
                modulo: 'Facturas Viventta',
                por_aprobar: viventtaPorAprobar,
                por_procesar: viventtaPorProcesar,
                radicadas: viventtaRadicadas,
                radicadas_acumuladas: viventtaAcumuladas,
                por_aprobar_vencidas: viventtaVencidas,
                procesadas_mateo: viventtaMateo,
                procesadas_duvan: viventtaDuvan,
                procesadas_jesus: viventtaJesus
            }
        ];

        // Insertar o actualizar (upsert por si se corre varias veces el mismo día, usando la restricción UNIQUE)
        const { error: insertError } = await supabaseAdmin
            .from('Historial_Metricas_Diarias')
            .upsert(metricsData, { onConflict: 'fecha, modulo' });

        if (insertError) throw insertError;

        console.log('[Cron] Historial de métricas guardado exitosamente.');
        return NextResponse.json({ success: true, date: today, records: metricsData.length });

    } catch (error: any) {
        console.error('[Cron] Error saving daily metrics:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
