import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        
        const nit = formData.get('nit') as string;
        const proveedor = formData.get('proveedor') as string;
        const responsableEmail = formData.get('responsableEmail') as string | null;
        let responsableNombreRecibido = formData.get('responsableNombre') as string | null;
        const file = formData.get('file') as File;

        if (!file || !nit || !proveedor) {
            return NextResponse.json({ success: false, error: 'Faltan campos obligatorios' }, { status: 400 });
        }

        const fileBuffer = Buffer.from(await file.arrayBuffer());

        // Generate a new ID based on timestamp or UUID. For now, use epoch ms for ID.
        const newItemId = Date.now();

        let publicUrl = null;
        try {
            const fileExtension = file.name.split('.').pop() || 'pdf';
            const storagePath = `${newItemId}_${Date.now()}.${fileExtension}`;
            
            console.log(`[Supabase Storage] Uploading file to bucket documento_soporte...`);
            const { data: uploadData, error: uploadError } = await supabaseAdmin
                .storage
                .from('documento_soporte')
                .upload(storagePath, fileBuffer, {
                    contentType: file.type || 'application/pdf',
                    duplex: 'half'
                });

            if (uploadError) {
                console.error('[Supabase Storage] Error uploading file:', uploadError.message);
                return NextResponse.json({ success: false, error: 'Error al subir el archivo' }, { status: 500 });
            } else {
                const { data: urlData } = supabaseAdmin
                    .storage
                    .from('documento_soporte')
                    .getPublicUrl(storagePath);
                
                publicUrl = urlData.publicUrl;
                console.log(`[Supabase Storage] Upload successful. Public URL:`, publicUrl);
            }
        } catch (storageErr) {
            console.error('[Supabase Storage] Fatal upload error:', storageErr);
            return NextResponse.json({ success: false, error: 'Error interno de almacenamiento' }, { status: 500 });
        }

        const docData: any = {
            id: Number(newItemId),
            sharepoint_id: String(newItemId),
            nit: nit,
            proveedor: proveedor,
            aprobacion_doliente: 'Por Aprobar',
            gestion_contabilidad: 'Por Procesar',
            attachments: true,
            fecha_creacion: new Date().toISOString(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            responsable_nombre: responsableNombreRecibido || 'Sin asignar',
            responsable_id: responsableEmail || null,
            consecutivo: 'S/N',
            pdf_url: publicUrl,
            adjunto: publicUrl
        };

        console.log('[Supabase] Inserting Documento_Soporte into DB:', docData);
        const { error: supabaseError } = await supabaseAdmin
            .from('Documento_Soporte')
            .upsert(docData, { onConflict: 'id' });

        if (supabaseError) {
            console.error('Error al guardar en Supabase:', supabaseError.message);
            return NextResponse.json({ success: false, error: 'Error al guardar el documento' }, { status: 500 });
        }

        // Auto-registrar proveedor si no existe
        if (responsableEmail && responsableNombreRecibido) {
            try {
                const baseNit = nit.includes('-') ? nit.split('-')[0] : nit;
                const { data: existingProvider, error: lookupError } = await supabaseAdmin
                    .from("Proveedores_con_Responsable")
                    .select('"Nit"')
                    .like("Nit", `${baseNit}%`)
                    .limit(1);

                if (!lookupError && (!existingProvider || existingProvider.length === 0)) {
                    await supabaseAdmin.from("Proveedores_con_Responsable").insert({
                        "Nit": nit,
                        "Nombre de socio de negocios": proveedor,
                        "Responsable": responsableNombreRecibido,
                        "Autorizador": responsableNombreRecibido,
                        "Correo": responsableEmail,
                        "Creado": new Date().toISOString()
                    });
                    console.log(`[Supabase] Registrado nuevo proveedor con responsable (Doc Soporte): ${nit} - ${responsableNombreRecibido}`);
                }
            } catch (providerErr) {
                console.error("[Supabase] Error registrando Proveedor_con_Responsable (Doc Soporte):", providerErr);
            }
        }

        // 5. Notificación webhook Power Automate
        try {
            if (responsableEmail) {
                const webhookUrl = "https://8c18912a4169ec67aa9b39bdfb7cc3.10.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/aeb6cb48c08d4b2284e6195f1af861a5/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=HeQc9SianqYpHVdBvGopK5kUtWrdUHkCuQhvWupbAZs";
                
                const docUrl = `https://appcontabilidad.vercel.app/externo/documento/${newItemId}`;
                const payload = {
                    titulo: `Nuevo Documento Soporte - ${proveedor}`,
                    contenido: `Se ha creado un nuevo documento soporte para el proveedor ${proveedor} (NIT: ${nit}). Por favor, revisa el documento y procede con su aprobación.`,
                    responsable: responsableEmail,
                    link: `<a href="${docUrl}">${docUrl}</a>`
                };

                console.log('[Webhook] Sending notification to Power Automate:', payload);

                fetch(webhookUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                }).catch(e => console.error('[Webhook] Error fetching background:', e));
            }
        } catch (webhookError) {
            console.error('[Webhook] Error configuring notification:', webhookError);
        }

        return NextResponse.json({ success: true, id: newItemId, publicUrl });
    } catch (error: any) {
        console.error('Support Document creation error:', error);
        return NextResponse.json({ success: false, error: error.message || 'Error desconocido' }, { status: 500 });
    }
}
