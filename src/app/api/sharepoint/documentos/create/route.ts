import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getGraphClient, createSharePointListItem, getSharePointRESTToken } from '@/lib/sharepoint';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        
        const nit = formData.get('nit') as string;
        const proveedor = formData.get('proveedor') as string;
        const responsableEmail = formData.get('responsableEmail') as string;
        const file = formData.get('file') as File;

        if (!nit || !proveedor || !file) {
            return NextResponse.json({ error: 'Faltan campos obligatorios (NIT, Proveedor o Archivo)' }, { status: 400 });
        }

        const client = await getGraphClient();

        // 1. Obtener Site ID de FPKContabilidad (para la lista)
        const siteFPK = await client.api('/sites/firplaksa.sharepoint.com:/sites/FPKContabilidad').get();
        const siteIdFPK = siteFPK.id;

        // 2. Resolver Responsable (Lookup ID)
        let responsableLookupId = null;
        let responsableName = null;
        if (responsableEmail) {
            try {
                const userRes = await client.api(`/sites/${siteIdFPK}/lists('User Information List')/items`)
                    .header('Prefer', 'HonorNonIndexedQueriesWarningMayFailRandomly')
                    .expand('fields($select=id,EMail,Title)')
                    .filter(`fields/EMail eq '${responsableEmail}'`)
                    .get();
                
                if (userRes.value && userRes.value.length > 0) {
                    responsableLookupId = userRes.value[0].id;
                    responsableName = userRes.value[0].fields.Title;
                }
            } catch (e) {
                console.warn('No se pudo resolver el responsable por email:', responsableEmail);
            }
        }

        const fields: Record<string, any> = {
            Title: nit,
            tsic: proveedor,
            AprobacionDoliente: 'Por Aprobar',
            Gestion_Contabilidad: 'Pendiente'
        };

        if (responsableLookupId) {
            fields['ResponsableAprobarLookupId'] = responsableLookupId;
        }

        console.log(`[SharePoint] Creating list item in Documento_Soporte...`);
        const newItem = await createSharePointListItem(siteIdFPK, 'Documento_Soporte', fields);
        const newItemId = newItem.id;

        // 3. Adjuntar el archivo al ítem de la lista usando la API de REST (más confiable para adjuntos)
        const fileBuffer = Buffer.from(await file.arrayBuffer());
        try {
            const restToken = await getSharePointRESTToken();
            if (restToken) {
                const spBaseUrl = 'https://firplaksa.sharepoint.com/sites/FPKContabilidad';
                const escapedFileName = file.name.replace(/'/g, "''");
                const attachUrl = `${spBaseUrl}/_api/web/lists/getbytitle('Documento_Soporte')/items(${newItemId})/AttachmentFiles/add(FileName='${escapedFileName}')`;
                
                console.log(`[SharePoint] Attaching file to Documento_Soporte item ${newItemId} via REST...`);

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
                
                const attachRes = await fetch(attachUrl, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${restToken}`,
                        'Accept': 'application/json;odata=verbose',
                        'Content-Type': file.type || 'application/pdf',
                        ...(digest ? { 'X-RequestDigest': digest } : {})
                    },
                    body: fileBuffer
                });

                if (!attachRes.ok) {
                    const errorText = await attachRes.text();
                    console.error('[SharePoint REST Error] Status:', attachRes.status, 'Body:', errorText);
                } else {
                    console.log('[SharePoint] File attached successfully to item', newItemId);
                }
            }
        } catch (attachError) {
            console.error('Error al adjuntar archivo al ítem de SharePoint:', attachError);
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
                gestion_contabilidad: 'Pendiente',
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
                
                const payload = {
                    titulo: `Nuevo Documento Soporte - ${proveedor}`,
                    contenido: `Se ha creado un nuevo documento soporte para el proveedor ${proveedor} (NIT: ${nit}). Por favor, revisa el documento y procede con su aprobación.`,
                    responsable: responsableEmail,
                    link: `https://appcontabilidad.vercel.app/externo/documento/${newItemId}`
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
