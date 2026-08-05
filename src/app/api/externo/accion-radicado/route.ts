import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export async function POST(req: NextRequest) {
    try {
        const {
            itemId,
            action,
            observaciones,
            distribuciones,
            valor,
        } = await req.json();

        if (!itemId || !action) {
            return NextResponse.json({ error: 'Missing itemId or action' }, { status: 400 });
        }

        if (action !== 'Aprobado' && action !== 'Rechazado') {
            return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
        }

        // Build distribution JSON if present
        let jsonDist: string | null = null;
        if (distribuciones && Array.isArray(distribuciones) && distribuciones.length > 0) {
            const centroCostosArray = distribuciones.map((d: any) => ({
                centroCosto: d.centroCosto || d.centroCostos || '',
                cuenta: d.cuenta || '',
                valor: d.valor ? String(d.valor) : '0'
            }));
            jsonDist = JSON.stringify(centroCostosArray);
        }

        // Clean numeric valor
        let cleanValor: number | null = null;
        if (valor) {
            const numericValue = String(valor).replace(/[^0-9.]/g, '');
            cleanValor = numericValue ? Number(numericValue) : null;
        }

        const updateData: any = {
            Aprobacion_Doliente: action,
            FechaAprobacion: new Date().toISOString(),
        };

        if (action === 'Aprobado') {
            updateData.Gestion_Contabilidad = 'Por Procesar';
        }
        if (cleanValor !== null) {
            updateData.Monto = cleanValor;
        }
        if (observaciones) {
            updateData.Observaciones = observaciones;
        }
        if (jsonDist) {
            updateData.centro_costos = jsonDist;
        }

        const { error: updateError } = await supabase
            .from('Radicados_de_importacion')
            .update(updateData)
            .eq('id', itemId);

        if (updateError) {
            throw updateError;
        }

        return NextResponse.json({ success: true });

    } catch (error: any) {
        console.error('Error in accion-radicado:', error);
        return NextResponse.json({ error: error.message || 'Error al procesar la acción' }, { status: 500 });
    }
}
