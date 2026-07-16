import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { itemId, status, field } = body;

        if (!itemId || !status || !field) {
            return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 });
        }

        const updateData: any = {
            [field]: status,
        };

        if (field === 'Aprobacion_Doliente') {
            updateData.FechaAprobacion = new Date().toISOString();
            if (status === 'Aprobado') {
                updateData.Gestion_Contabilidad = 'Por Procesar';
            }
        }

        const { error } = await supabase
            .from('Facturas_Viventta')
            .update(updateData)
            .eq('id', itemId);

        if (error) {
            throw error;
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Error in facturas-viventta/update-status:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
