import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 120; // SAP / notificaciones pueden tardar más que el límite por defecto

const STORAGE_PUBLIC_PREFIX = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/documento_soporte/`;

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

export async function POST(req: NextRequest) {
    try {
        const isJson = (req.headers.get('content-type') || '').includes('application/json');

        let nit: string;
        let proveedor: string;
        let responsableEmail: string | null;
        let responsableNombreRecibido: string | null;
        let valorTotal: string | null;
        let file: File | null = null;
        let attachments: File[] = [];
        let presetPublicUrl: string | null = null;
        let presetAnexos: { name: string, url: string }[] = [];

        if (isJson) {
            // Modo directo: el navegador ya subió los archivos a Supabase Storage
            const body = await req.json();
            nit = body.nit;
            proveedor = body.proveedor;
            responsableEmail = body.responsableEmail || null;
            responsableNombreRecibido = body.responsableNombre || null;
            valorTotal = body.valorTotal || null;
            presetPublicUrl = body.pdfUrl || null;
            presetAnexos = Array.isArray(body.anexos) ? body.anexos : [];

            // Solo aceptar URLs de nuestro propio bucket
            const urlsOk = (!presetPublicUrl || presetPublicUrl.startsWith(STORAGE_PUBLIC_PREFIX))
                && presetAnexos.every(a => typeof a?.url === 'string' && a.url.startsWith(STORAGE_PUBLIC_PREFIX));
            if (!urlsOk) {
                return NextResponse.json({ success: false, error: 'URL de archivo no válida' }, { status: 400 });
            }
        } else {
            const formData = await req.formData();

            nit = formData.get('nit') as string;
            proveedor = formData.get('proveedor') as string;
            responsableEmail = formData.get('responsableEmail') as string | null;
            responsableNombreRecibido = formData.get('responsableNombre') as string | null;
            valorTotal = formData.get('valorTotal') as string | null;

            const files = formData.getAll('files') as File[];
            file = files && files.length > 0 ? files[0] : (formData.get('file') as File | null);
            attachments = files && files.length > 1 ? files.slice(1) : (formData.getAll('attachments') as File[]);
        }

        if ((!file && !presetPublicUrl) || !nit || !proveedor || !valorTotal) {
            return NextResponse.json({ success: false, error: 'Faltan campos obligatorios' }, { status: 400 });
        }

        const fileBuffer = file ? Buffer.from(await file.arrayBuffer()) : Buffer.alloc(0);

        // Generate a new ID based on timestamp or UUID. For now, use epoch ms for ID.
        const newItemId = Date.now();

        let publicUrl: string | null = presetPublicUrl;
        if (!presetPublicUrl && file) try {
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

        let anexosUrls: { name: string, url: string }[] = [...presetAnexos];
        for (const att of attachments) {
            try {
                const fileExtension = att.name.split('.').pop() || 'pdf';
                const storagePath = `${newItemId}_anexo_${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExtension}`;
                const attBuffer = Buffer.from(await att.arrayBuffer());
                
                const { error: attError } = await supabaseAdmin
                    .storage
                    .from('documento_soporte')
                    .upload(storagePath, attBuffer, {
                        contentType: att.type || 'application/octet-stream',
                        duplex: 'half'
                    });

                if (!attError) {
                    const { data: attUrlData } = supabaseAdmin
                        .storage
                        .from('documento_soporte')
                        .getPublicUrl(storagePath);
                    
                    anexosUrls.push({ name: att.name, url: attUrlData.publicUrl });
                }
            } catch (attErr) {
                console.error('[Supabase Storage] Error uploading attachment:', attErr);
            }
        }

        // --- Auto-approval detection ---
        let finalAprobacionDoliente = 'Por Aprobar';
        let finalCentroCostos = null;
        let finalObservaciones = null;
        let isAutoApproved = false;

        if (valorTotal) {
            try {
                const baseNit = nit.includes('-') ? nit.split('-')[0] : nit;
                const { data: providerData } = await supabaseAdmin
                    .from('proveedores')
                    .select('id, aprobacion_automatica, proveedor_aprobacion_reglas(valor, porcentaje_desviacion, centro_costos, cuenta)')
                    .like('numero_identificacion', `${baseNit}%`)
                    .limit(1)
                    .single();

                if (providerData && providerData.aprobacion_automatica && providerData.proveedor_aprobacion_reglas) {
                    const val = parseFloat(valorTotal.replace(/[^0-9.-]+/g, ""));
                    if (!isNaN(val)) {
                        for (const rule of providerData.proveedor_aprobacion_reglas) {
                            const rMin = rule.valor - (rule.valor * rule.porcentaje_desviacion / 100);
                            const rMax = rule.valor + (rule.valor * rule.porcentaje_desviacion / 100);
                            if (val >= rMin && val <= rMax) {
                                finalAprobacionDoliente = 'Aprobado';
                                
                                let parsedLines = [];
                                try {
                                    parsedLines = typeof rule.centro_costos === 'string' 
                                        ? JSON.parse(rule.centro_costos) 
                                        : rule.centro_costos;
                                        
                                    if (!Array.isArray(parsedLines)) {
                                        parsedLines = [{ centro_costos: rule.centro_costos, cuenta: rule.cuenta }];
                                    }
                                } catch (e) {
                                    // legacy fallback if it was a plain string
                                    parsedLines = [{ centro_costos: rule.centro_costos, cuenta: rule.cuenta }];
                                }
                                
                                finalCentroCostos = JSON.stringify(parsedLines.map((line: any) => ({
                                    centroCosto: line.centro_costos || '',
                                    cuenta: line.cuenta || '',
                                    porcentaje: 100
                                })));
                                
                                finalObservaciones = 'Aprobado automáticamente por regla de proveedor';
                                isAutoApproved = true;
                                console.log(`[Auto-Approve] Documento Soporte auto-approved! Rule matches val: ${val}`);
                                break;
                            }
                        }
                    }
                }
            } catch (err) {
                console.error('[Auto-Approve] Error checking rules for Doc Soporte:', err);
            }
        }

        // Si falta responsableNombre o responsableEmail, intentar resolver desde Proveedores_con_Responsable
        if (!responsableNombreRecibido || !responsableEmail) {
            try {
                const baseNit = nit.includes('-') ? nit.split('-')[0] : nit;
                const { data: provResp } = await supabaseAdmin
                    .from('Proveedores_con_Responsable')
                    .select('"Responsable", "Autorizador", "Correo"')
                    .like('Nit', `${baseNit}%`)
                    .limit(1)
                    .maybeSingle();

                if (provResp) {
                    if (!responsableNombreRecibido) {
                        responsableNombreRecibido = provResp.Responsable || provResp.Autorizador;
                    }
                    if (!responsableEmail) {
                        responsableEmail = provResp.Correo;
                    }
                }
            } catch (err) {
                console.error('[Doc Soporte] Error resolving fallback responsable:', err);
            }
        }

        const docData: any = {
            id: Number(newItemId),
            sharepoint_id: String(newItemId),
            nit: nit,
            proveedor: proveedor,
            valor_total: valorTotal || null,
            aprobacion_doliente: finalAprobacionDoliente,
            gestion_contabilidad: 'Por Procesar',
            attachments: true,
            fecha_creacion: new Date().toISOString(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            responsable_nombre: responsableNombreRecibido || 'Sin asignar',
            responsable_id: responsableEmail || null,
            consecutivo: 'S/N',
            pdf_url: publicUrl,
            adjunto: anexosUrls.length > 0 ? JSON.stringify(anexosUrls) : publicUrl
        };

        if (finalCentroCostos) docData.centro_costos = finalCentroCostos;
        if (finalObservaciones) docData.observaciones = finalObservaciones;
        if (isAutoApproved) docData.fecha_aprobacion = new Date().toISOString();

        console.log('[Supabase] Inserting Documento_Soporte into DB:', docData);
        const { error: supabaseError } = await supabaseAdmin
            .from('Documento_Soporte')
            .upsert(docData, { onConflict: 'id' });

        if (supabaseError) {
            console.error('Error al guardar en Supabase:', supabaseError.message);
            return NextResponse.json({ success: false, error: 'Error al guardar el documento' }, { status: 500 });
        }

        // Auto-registrar proveedor en Proveedores_con_Responsable si no existe o actualizar si no tiene responsable
        if (responsableNombreRecibido && responsableNombreRecibido !== 'Sin asignar') {
            try {
                const baseNit = nit.includes('-') ? nit.split('-')[0] : nit;
                const { data: existingProvider, error: lookupError } = await supabaseAdmin
                    .from("Proveedores_con_Responsable")
                    .select('"Nit", "Responsable", "Correo"')
                    .or(`Nit.ilike.${baseNit}%,Nit.ilike.${nit}%`)
                    .limit(1);

                if (!lookupError && (!existingProvider || existingProvider.length === 0)) {
                    await supabaseAdmin.from("Proveedores_con_Responsable").insert({
                        "Nit": nit,
                        "Nombre de socio de negocios": proveedor,
                        "Responsable": responsableNombreRecibido,
                        "Autorizador": responsableNombreRecibido,
                        "Correo": responsableEmail || null,
                        "Notificar": "True",
                        "Creado": new Date().toISOString()
                    });
                    console.log(`[Supabase] Auto-registrado nuevo proveedor con responsable (Doc Soporte): ${nit} - ${responsableNombreRecibido}`);
                } else if (existingProvider && existingProvider.length > 0) {
                    const prov = existingProvider[0];
                    const updates: any = {};
                    if (!prov.Responsable) {
                        updates.Responsable = responsableNombreRecibido;
                        updates.Autorizador = responsableNombreRecibido;
                    }
                    if (!prov.Correo && responsableEmail) {
                        updates.Correo = responsableEmail;
                    }
                    if (Object.keys(updates).length > 0) {
                        await supabaseAdmin
                            .from("Proveedores_con_Responsable")
                            .update(updates)
                            .eq("Nit", prov.Nit);
                        console.log(`[Supabase] Actualizado Proveedores_con_Responsable (Doc Soporte): ${prov.Nit}`);
                    }
                }
            } catch (providerErr) {
                console.error("[Supabase] Error registrando Proveedor_con_Responsable (Doc Soporte):", providerErr);
            }
        }

        // 5. Integración post-guardado (Notificación o SAP)
        if (isAutoApproved) {
            // Auto-Approve -> Create SAP draft directly
            try {
                const { createSapDraft } = await import('@/lib/sap');
                await createSapDraft({
                    nit: nit || "",
                    total: valorTotal || "0",
                    distribuciones: finalCentroCostos ? JSON.parse(finalCentroCostos) : [],
                    anticipo: 'f',
                    observations: finalObservaciones || 'Aprobado automáticamente',
                    nroFactura: 'S/N', 
                    docTypeDesc: 'DOCUMENTO SOPORTE',
                    itemId: String(newItemId),
                    consecutivo: 'S/N',
                    proveedorName: proveedor || "Proveedor Desconocido"
                });
                console.log(`[Auto-Approve] Draft in SAP created for Documento_Soporte ${newItemId}`);
            } catch (sapErr: any) {
                console.error('[Auto-Approve] Error en SAP para Doc Soporte:', sapErr);
                // Opcional: Registrar el error de SAP en Supabase
            }
        }
        
        // Notificar por Power Automate siempre (si fue auto aprobado, se notifica que ya se aprobó)
        try {
            if (responsableEmail) {
                const webhookUrl = "https://8c18912a4169ec67aa9b39bdfb7cc3.10.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/aeb6cb48c08d4b2284e6195f1af861a5/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=HeQc9SianqYpHVdBvGopK5kUtWrdUHkCuQhvWupbAZs";
                
                const docUrl = `https://appcontabilidad.vercel.app/externo/documento/${newItemId}`;
                const payload = {
                    titulo: isAutoApproved 
                        ? `Documento Soporte Auto-Aprobado - ${proveedor}`
                        : `Nuevo Documento Soporte - ${proveedor}`,
                    contenido: isAutoApproved
                        ? `Se ha creado y aprobado AUTOMÁTICAMENTE el documento soporte para el proveedor ${proveedor} (NIT: ${nit}) gracias a las reglas configuradas. Puedes ingresar al enlace para revisar el soporte.`
                        : `Se ha creado un nuevo documento soporte para el proveedor ${proveedor} (NIT: ${nit}). Por favor, revisa el documento y procede con su aprobación.`,
                    responsable: responsableEmail,
                    link: `<a href="${docUrl}">${docUrl}</a>`
                };

                console.log('[Webhook] Sending notification to Power Automate:', payload);

                const notifyRes = await fetch(webhookUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                console.log(`[Webhook] Power Automate response status: ${notifyRes.status}`);
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
