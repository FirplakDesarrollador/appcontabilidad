import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getGraphClient, createSharePointListItem, getSharePointRESTToken, ensureSharePointUserByEmail } from '@/lib/sharepoint';

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

        const client = await getGraphClient();

        // 1. Obtener Site ID de FPKContabilidad (para la lista)
        const siteFPK = await client.api('/sites/firplaksa.sharepoint.com:/sites/FPKContabilidad').get();
        const siteIdFPK = siteFPK.id;

        // 2. Resolver Responsable (Lookup ID) asegurando que exista en SharePoint
        let responsableLookupId = null;
        let responsableName = responsableNombreRecibido;
        if (responsableEmail) {
            try {
                const spUser = await ensureSharePointUserByEmail(responsableEmail);
                if (spUser) {
                    responsableLookupId = spUser.id;
                    if (spUser.title) {
                        responsableName = spUser.title;
                    }
                } else {
                    console.warn('[SharePoint] No se pudo asegurar el responsable por email:', responsableEmail);
                    return NextResponse.json({ error: `El correo responsable (${responsableEmail}) no es válido o no existe en SharePoint.` }, { status: 400 });
                }
            } catch (e) {
                console.warn('[SharePoint] Error resolviendo el responsable por email:', responsableEmail, e);
                return NextResponse.json({ error: `Ocurrió un error validando al responsable (${responsableEmail}).` }, { status: 400 });
            }
        }

        const fields: Record<string, any> = {
            Title: nit,
            tsic: proveedor,
            AprobacionDoliente: 'Por Aprobar',
            Gestion_Contabilidad: 'Por Procesar'
        };

        if (responsableLookupId) {
            fields['ResponsableAprobarLookupId'] = responsableLookupId;
        }

        console.log(`[SharePoint] Creating list item in Documento_Soporte...`);
        const newItem = await createSharePointListItem(siteIdFPK, 'Documento_Soporte', fields);
        const newItemId = newItem.id;

        // 3. Adjuntar el archivo principal y los anexos al ítem de la lista usando la API de REST
        const attachments = formData.getAll('attachments') as File[];
        const filesToAttach = [file, ...attachments].filter(Boolean);

        const fileBuffer = Buffer.from(await file.arrayBuffer()); // Guardamos el buffer del archivo principal para Supabase

        try {
            const restToken = await getSharePointRESTToken();
            if (restToken) {
                const spBaseUrl = 'https://firplaksa.sharepoint.com/sites/FPKContabilidad';
                
                let digest = "";
                try {
                    const digestRes = await fetch(`${spBaseUrl}/_api/contextinfo`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${restToken}`,
                            'Accept': 'application/json;odata=verbose',
                        }
                    });
                    if (digestRes.ok) {
                        const digestData = await digestRes.json();
                        digest = digestData.d.GetContextWebInformation.FormDigestValue;
                    }
                } catch (e) {
                    console.warn('[SharePoint] Could not fetch digest, proceeding without it...');
                }

                for (const f of filesToAttach) {
                    const attachBuffer = Buffer.from(await f.arrayBuffer());
                    const escapedFileName = f.name.replace(/'/g, "''");
                    const attachUrl = `${spBaseUrl}/_api/web/lists/getbytitle('Documento_Soporte')/items(${newItemId})/AttachmentFiles/add(FileName='${escapedFileName}')`;
                    
                    console.log(`[SharePoint] Attaching file ${f.name} to Documento_Soporte item ${newItemId} via REST...`);
                    
                    const attachRes = await fetch(attachUrl, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${restToken}`,
                            'Accept': 'application/json;odata=verbose',
                            'Content-Type': f.type || 'application/octet-stream',
                            ...(digest ? { 'X-RequestDigest': digest } : {})
                        },
                        body: attachBuffer
                    });

                    if (!attachRes.ok) {
                        const errorText = await attachRes.text();
                        console.error('[SharePoint REST Error] Status:', attachRes.status, 'Body:', errorText);
                    } else {
                        console.log('[SharePoint] File attached successfully:', f.name);
                    }
                }
            }
        } catch (attachError) {
            console.error('Error al adjuntar archivos al ítem de SharePoint:', attachError);
        }

        // 4. Upsert en Supabase para visibilidad inmediata
        try {
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
                responsable_nombre: responsableName || 'Sin asignar',
                responsable_id: responsableEmail || null,
                consecutivo: 'S/N', // default
                pdf_url: publicUrl,
                adjunto: publicUrl
            };

            console.log('[Supabase] Inserting manual Documento_Soporte into DB:', docData);
            const { error: supabaseError } = await supabaseAdmin
                .from('Documento_Soporte')
                .upsert(docData, { onConflict: 'id' });

            if (supabaseError) {
                console.error('Error al sincronizar con Supabase inmediatamente:', supabaseError.message);
            }
        } catch (supabaseCatchError) {
            console.error('Error fatal al sincronizar con Supabase:', supabaseCatchError);
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
                
                const webhookRes = await fetch(webhookUrl, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify(payload)
                });
                
                if (!webhookRes.ok) {
                    console.error('[Webhook] Failed with status:', webhookRes.status);
                }
            }
        } catch (webhookError) {
            console.error('[Webhook] Error sending notification:', webhookError);
        }

        return NextResponse.json({ 
            success: true, 
            item: newItem
        });

    } catch (error: any) {
        console.error('Error in create support document API:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
