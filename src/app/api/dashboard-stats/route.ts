import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET() {
    try {
        console.log('[API] Fetching Dashboard Stats...');

        const getCount = async (table: string, filters: (query: any) => any) => {
            let query = supabaseAdmin.from(table).select('*', { count: 'exact', head: true });
            query = filters(query);
            const { count, error } = await query;
            if (error) throw error;
            return count || 0;
        };

        const getPorAprobarResponsables = async (table: string, userCol: string, dateCol: string, filters: (query: any) => any, limitDate: string) => {
            let query = supabaseAdmin.from(table).select(`${userCol}, ${dateCol}`);
            query = filters(query);
            const { data, error } = await query;
            if (error) throw error;
            return data.map((r: any) => ({
                name: r[userCol] ? String(r[userCol]).trim() : 'Sin Asignar',
                isOverdue: r[dateCol] && r[dateCol] <= limitDate
            }));
        };
        
        const responsablesAll: {name: string, isOverdue: boolean}[] = [];

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
        const twoDaysAgo = getTwoBusinessDaysAgo(new Date());

        // 1. Aprobación de Facturas (Registro_Facturas)
        const facturasPorAprobar = await getCount('Registro_Facturas', q => q.eq('Aprobacion_Doliente', 'Por Aprobar'));
        const facturasPorProcesar = await getCount('Registro_Facturas', q => 
            q.eq('Aprobacion_Doliente', 'Aprobado')
             .ilike('Gestion_Contabilidad', '%POR PROCESAR%')
        );
        const facturasVencidas = await getCount('Registro_Facturas', q => q.eq('Aprobacion_Doliente', 'Por Aprobar').lte('Creado', twoDaysAgo));
        const res1 = await getPorAprobarResponsables('Registro_Facturas', 'Responsable_de_Autorizar', 'Creado', q => q.eq('Aprobacion_Doliente', 'Por Aprobar'), twoDaysAgo);
        responsablesAll.push(...res1);

        // 2. Aprobación de Documentos (Documento_Soporte)
        const documentosPorAprobar = await getCount('Documento_Soporte', q => q.in('aprobacion_doliente', ['Por Aprobar', 'Pendiente']));
        const documentosPorProcesar = await getCount('Documento_Soporte', q => 
            q.eq('aprobacion_doliente', 'Aprobado')
             .ilike('gestion_contabilidad', '%POR PROCESAR%')
        );
        const documentosVencidas = await getCount('Documento_Soporte', q => q.in('aprobacion_doliente', ['Por Aprobar', 'Pendiente']).lte('fecha_creacion', twoDaysAgo));
        const res2 = await getPorAprobarResponsables('Documento_Soporte', 'responsable_nombre', 'fecha_creacion', q => q.in('aprobacion_doliente', ['Por Aprobar', 'Pendiente']), twoDaysAgo);
        responsablesAll.push(...res2);

        // 3. Radicados de Importación (Radicados_de_importacion)
        const radicadosPorAprobar = await getCount('Radicados_de_importacion', q => q.in('Aprobacion_Doliente', ['Por Aprobar', 'Pendiente']));
        const radicadosPorProcesar = await getCount('Radicados_de_importacion', q => 
            q.eq('Aprobacion_Doliente', 'Aprobado')
             .ilike('Gestion_Contabilidad', '%POR PROCESAR%')
        );
        const radicadosVencidas = await getCount('Radicados_de_importacion', q => q.in('Aprobacion_Doliente', ['Por Aprobar', 'Pendiente']).lte('Created', twoDaysAgo));
        const res3 = await getPorAprobarResponsables('Radicados_de_importacion', 'Responsable_de_Autorizar', 'Created', q => q.in('Aprobacion_Doliente', ['Por Aprobar', 'Pendiente']), twoDaysAgo);
        responsablesAll.push(...res3);

        // 4. Facturas Viventta (Facturas_Viventta)
        const viventtaPorAprobar = await getCount('Facturas_Viventta', q => q.not('Aprobacion_Doliente', 'in', '("Aprobado","Rechazado")'));
        const viventtaPorProcesar = await getCount('Facturas_Viventta', q => 
            q.eq('Aprobacion_Doliente', 'Aprobado')
             .ilike('Gestion_Contabilidad', '%POR PROCESAR%')
        );
        const viventtaVencidas = await getCount('Facturas_Viventta', q => q.not('Aprobacion_Doliente', 'in', '("Aprobado","Rechazado")').lte('Creado', twoDaysAgo));
        const res4 = await getPorAprobarResponsables('Facturas_Viventta', 'Responsable_de_Autorizar', 'Creado', q => q.not('Aprobacion_Doliente', 'in', '("Aprobado","Rechazado")'), twoDaysAgo);
        responsablesAll.push(...res4);

        const responsablesMap: Record<string, { total: number, overdue: number }> = {};
        responsablesAll.forEach(r => {
            const name = r.name === 'null' || !r.name ? 'Sin Asignar' : r.name;
            if (!responsablesMap[name]) responsablesMap[name] = { total: 0, overdue: 0 };
            responsablesMap[name].total += 1;
            if (r.isOverdue) responsablesMap[name].overdue += 1;
        });

        const porAprobarPorPersona = Object.entries(responsablesMap)
            .map(([name, stats]) => ({ name, count: stats.total, overdue: stats.overdue }))
            .sort((a, b) => b.count - a.count);

        return NextResponse.json({
            success: true,
            data: [
                {
                    module: 'Aprobación de facturas',
                    porAprobar: facturasPorAprobar,
                    porProcesar: facturasPorProcesar,
                    vencidas: facturasVencidas
                },
                {
                    module: 'Aprobación de documentos',
                    porAprobar: documentosPorAprobar,
                    porProcesar: documentosPorProcesar,
                    vencidas: documentosVencidas
                },
                {
                    module: 'Radicados de importación',
                    porAprobar: radicadosPorAprobar,
                    porProcesar: radicadosPorProcesar,
                    vencidas: radicadosVencidas
                },
                {
                    module: 'Facturas Viventta',
                    porAprobar: viventtaPorAprobar,
                    porProcesar: viventtaPorProcesar,
                    vencidas: viventtaVencidas
                }
            ],
            porAprobarPorPersona,
            totals: {
                porAprobar: facturasPorAprobar + documentosPorAprobar + radicadosPorAprobar + viventtaPorAprobar,
                porProcesar: facturasPorProcesar + documentosPorProcesar + radicadosPorProcesar + viventtaPorProcesar,
                vencidas: facturasVencidas + documentosVencidas + radicadosVencidas + viventtaVencidas
            }
        });

    } catch (error: any) {
        console.error('[API] Error fetching dashboard stats:', error);
        return NextResponse.json({ success: false, error: error?.message || JSON.stringify(error) || String(error) }, { status: 500 });
    }
}
