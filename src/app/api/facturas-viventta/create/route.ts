import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

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
        const { data: uploadData, error: uploadError } = await supabase
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

        const { data, error } = await supabase
            .storage
            .from('adjuntos_facturas')
            .getPublicUrl(filePath);
            
        const fileUrl = data.publicUrl;

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

        const { data: insertData, error: insertError } = await supabase
            .from('Facturas_Viventta')
            .insert([invoiceData])
            .select();

        if (insertError) {
            console.error('Error al crear registro en Supabase:', insertError);
            return NextResponse.json({ error: 'Error al crear la factura en base de datos: ' + insertError.message, details: insertError }, { status: 500 });
        }

        const newItem = insertData && insertData.length > 0 ? insertData[0] : null;

        if (newItem && responsableEmail) {
            try {
                const webhookUrl = "https://defaultfa1de04f47804d83a94293c7ae8dee.9d.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/19/workflows/7861b03883ce4125aae9f210f51bca09/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=S8r1U8eAJqBk53XzSJL2sAXOVTjxtuuQ7U82AZuxwno";
                const docUrl = `https://appcontabilidad.vercel.app/externo/factura-viventta/${newItem.id}`;
                
                const payload = {
                    responsable: responsableEmail,
                    titulo: `Nueva Factura Viventta - ${proveedor}`,
                    contenido: `Se ha creado una nueva factura de Viventta para el proveedor ${proveedor} (NIT: ${nit}). Por favor, revisa el documento y procede con su aprobacion.`,
                    link: docUrl
                };

                console.log('[Webhook Viventta] Sending notification to Power Automate:', payload);

                const response = await fetch(webhookUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json; charset=utf-8' },
                    body: JSON.stringify(payload)
                });
                
                const responseText = await response.text();
                console.log(`[Webhook Viventta] Power Automate Response Status: ${response.status}`);
                console.log(`[Webhook Viventta] Power Automate Response Body:`, responseText);
            } catch (webhookErr) {
                console.error('[Webhook Viventta] Error building Power Automate request:', webhookErr);
            }
        }

        return NextResponse.json({ 
            success: true, 
            item: newItem
        });

    } catch (error: any) {
        console.error('Error in Viventta create-invoice API:', error);
        return NextResponse.json({ error: error.message || 'Error interno del servidor' }, { status: 500 });
    }
}
