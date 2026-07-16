import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const limit = parseInt(searchParams.get('limit') || '0');
        const pending = searchParams.get('pending') === 'true';
        const offset = parseInt(searchParams.get('offset') || '0');

        console.log(`[API] Fetching Documento_Soporte from Supabase (pending=${pending}, offset=${offset})...`);
        
        const columns = 'id, sharepoint_id, nit, proveedor, valor_total, consecutivo, aprobacion_doliente, gestion_contabilidad, observaciones, responsable_id, centro_costos, attachments, fecha_creacion, responsable_nombre, tiene_anticipo, pdf_url, adjunto, fecha_aprobacion';

        let query = supabase.from('Documento_Soporte').select(columns);
        
        if (pending) {
            query = query.or('aprobacion_doliente.eq.Por Aprobar,aprobacion_doliente.eq.Pendiente');
        }

        const { data, error } = await query
            .order('id', { ascending: false })
            .range(offset, offset + (limit > 0 ? limit - 1 : 1000));
        
        if (error) {
            throw error;
        }

        const mappedData = (data || []).map(item => ({
            ...item,
            // SharePoint fallbacks for the frontend
            FechaAprobacion: item.fecha_aprobacion,
            Created: item.fecha_creacion || item.created_at,
            AprobacionDoliente: item.aprobacion_doliente,
            Gestion_Contabilidad: item.gestion_contabilidad,
            Valortotal: item.valor_total,
            Observaciones: item.observaciones,
            Consecutivo_Doc_Soporte: item.consecutivo,
            Responsable_de_Autorizar: item.responsable_nombre
        }));

        return NextResponse.json({
            success: true,
            total: mappedData.length,
            items: mappedData,
            source: 'supabase'
        });
        
    } catch (error: any) {
        console.error('Support documents all items API error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
