import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        
        const nroFactura = formData.get('nroFactura') as string;
        const nit = formData.get('nit') as string;
        const proveedor = formData.get('proveedor') as string;
        const centroCosto = formData.get('centroCosto') as string;
        const cuenta = formData.get('cuenta') as string;
        const responsableEmail = formData.get('responsableEmail') as string;
        const observaciones = formData.get('observaciones') as string;
        const monto = formData.get('monto') as string;
        const responsable = formData.get('responsable') as string;
        const file = formData.get('file') as File;

        if (!nroFactura || !nit || !file) {
            return NextResponse.json({ error: 'Faltan campos obligatorios (Número, NIT o Archivo)' }, { status: 400 });
        }

        const cleanNit = nit.split('-')[0].replace(/[^0-9]/g, '');
        const fileExtension = file.name.split('.').pop();
        const fileName = `${cleanNit}_${nroFactura}_${Date.now()}.${fileExtension}`;
        const filePath = `viventta/${fileName}`;

        // Subir a Supabase Storage
        const fileBuffer = await file.arrayBuffer();
        const { data: uploadData, error: uploadError } = await supabaseAdmin
            .storage
            .from('adjuntos_facturas')
            .upload(filePath, fileBuffer, {
                contentType: file.type || 'application/pdf',
                upsert: false
            });

        if (uploadError) {
            console.error('Error al subir archivo a Supabase Storage:', uploadError);
            return NextResponse.json({ error: 'Error al subir archivo adjunto' }, { status: 500 });
        }

        const { data: publicUrlData } = supabaseAdmin
            .storage
            .from('adjuntos_facturas')
            .getPublicUrl(filePath);
            
        const fileUrl = publicUrlData.publicUrl;

        // Crear registro en la tabla EXCLUSIVA de Viventta (Facturas_Viventta)
        const invoiceData = {
            Nit: nit,
            Proveedor: proveedor,
            Nro_Factura: nroFactura,
            Valor_total: String(Number(monto) || 0),
            Aprobacion_Doliente: 'Por Aprobar',
            Gestion_Contabilidad: 'Por Procesar',
            Responsable_de_Autorizar: responsable || 'Sin asignar',
            Responsable_email: responsableEmail || '',
            fp: fileUrl,
            documentos: fileUrl,
            Datos_adjuntos: 1,
            Observaciones: observaciones || '',
            Consecutivo: 'CON-' + Math.floor(7000 + Math.random() * 1000),
            centro_costos: JSON.stringify([{ centroCosto: centroCosto, cuenta: cuenta }]),
            Creado: new Date().toISOString(),
            adjuntos_url: [],
        };

        const { data: insertData, error: insertError } = await supabaseAdmin
            .from('Facturas_Viventta')
            .insert([invoiceData])
            .select();

        if (insertError) {
            console.error('Error al crear registro en Supabase:', insertError);
            return NextResponse.json({ error: 'Error al crear la factura en base de datos: ' + insertError.message, details: insertError }, { status: 500 });
        }

        return NextResponse.json({ 
            success: true, 
            item: insertData && insertData.length > 0 ? insertData[0] : null
        });

    } catch (error: any) {
        console.error('Error in Viventta create-invoice API:', error);
        return NextResponse.json({ error: error.message || 'Error interno del servidor' }, { status: 500 });
    }
}
