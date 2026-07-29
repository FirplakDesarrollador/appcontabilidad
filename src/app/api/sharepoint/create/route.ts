import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
import { getGraphClient, createSharePointFolder, uploadFileToSharePoint, createSharePointListItem, getSharePointRESTToken, ensureSharePointUserByEmail } from '@/lib/sharepoint';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();

        const nroFactura = (formData.get('nroFactura') as string || '').trim();
        const nit = (formData.get('nit') as string || '').trim();
        const proveedor = formData.get('proveedor') as string;
        const responsableEmail = formData.get('responsableEmail') as string;
        const files = formData.getAll('files') as File[];
        const valorTotal = formData.get('valorTotal') as string;

        if (!nroFactura || !nit || !files || files.length === 0) {
            return NextResponse.json({ error: 'Faltan campos obligatorios (Número, NIT o Archivos)' }, { status: 400 });
        }

        const client = await getGraphClient();

        // 1. Obtener Site ID de FPKContabilidad (para la lista)
        const siteFPK = await client.api('/sites/firplaksa.sharepoint.com:/sites/FPKContabilidad').get();
        const siteIdFPK = siteFPK.id;

        // 2. Verificar si la factura ya existe para este proveedor (NIT)
        // Consultamos Supabase (indexado y confiable) en vez del filtro compuesto
        // de Graph API, que en listas grandes de SharePoint puede devolver
        // resultados incompletos sin avisar. Comparamos normalizado (sin
        // espacios sueltos, sin digito de verificacion del NIT) porque datos
        // historicos tienen esas inconsistencias.
        const normalizedNit = nit.replace(/[^0-9]/g, '');
        const normalizedNro = nroFactura.toUpperCase();

        const { data: candidates, error: dupCheckError } = await supabaseAdmin
            .from('Registro_Facturas')
            .select('ID, Nit, Nro_Factura')
            .ilike('Nro_Factura', `%${normalizedNro}%`);

        if (dupCheckError) {
            console.error('Error checking for duplicates:', dupCheckError.message);
        }

        const isDuplicate = (candidates || []).some(c =>
            (c.Nro_Factura || '').trim().toUpperCase() === normalizedNro &&
            (c.Nit || '').replace(/[^0-9]/g, '') === normalizedNit
        );

        if (isDuplicate) {
            return NextResponse.json({
                error: 'DUPLICATED',
                message: `La factura ${nroFactura} ya está registrada para el proveedor con NIT ${nit}.`
            }, { status: 400 });
        }

        // 3. Obtener Site ID de ITPowerApps (para el PDF)
        const siteIT = await client.api('/sites/firplaksa.sharepoint.com:/sites/ITPowerApps').get();
        const siteIdIT = siteIT.id;

        // Normalizar NIT para la carpeta y búsqueda (quitar puntos, guiones y DV si es necesario)
        const cleanNit = nit.split('-')[0].replace(/[^0-9]/g, '');

        // 3. (REMOVED) Carpeta en ITPowerApps y carga a SharePoint para evitar limite de 4MB
        // Se suben los archivos a Supabase Storage directamente
        let firstFileUrl = "";
        let adjuntosData = [];
        
        for (let i = 0; i < files.length; i++) {
            const fileItem = files[i];
            const fileBuffer = await fileItem.arrayBuffer();
            
            const fileExtension = fileItem.name.split('.').pop() || '';
            const safeName = fileItem.name.replace(/[^a-zA-Z0-9.-]/g, '_');
            const uniqueFileName = `${cleanNit}_${nroFactura}_${Date.now()}_${i}_${safeName}`;
            
            const { error: uploadError } = await supabaseAdmin
                .storage
                .from('adjuntos_facturas')
                .upload(uniqueFileName, fileBuffer, {
                    contentType: fileItem.type || 'application/octet-stream',
                    upsert: false
                });

            if (uploadError) {
                console.error('[Supabase Storage] Error uploading file:', uploadError);
                throw new Error(`Error al subir el archivo ${fileItem.name}: ${uploadError.message}`);
            }

            const { data: publicUrlData } = supabaseAdmin
                .storage
                .from('adjuntos_facturas')
                .getPublicUrl(uniqueFileName);
                
            const fileUrl = publicUrlData.publicUrl;
            
            adjuntosData.push({
                name: fileItem.name,
                url: fileUrl,
                path: uniqueFileName
            });

            if (i === 0) {
                firstFileUrl = fileUrl;
            }
        }

        // 5. Resolver Responsable (Lookup ID) asegurando que exista en SharePoint
        let responsableLookupId = null;
        let responsableName = null;
        if (responsableEmail) {
            try {
                const spUser = await ensureSharePointUserByEmail(responsableEmail);
                if (spUser) {
                    responsableLookupId = spUser.id;
                    responsableName = spUser.title;
                } else {
                    console.warn('[SharePoint] No se pudo asegurar el responsable por email:', responsableEmail);
                    return NextResponse.json({ error: `El correo responsable (${responsableEmail}) no es válido o no existe en SharePoint.` }, { status: 400 });
                }
            } catch (e) {
                console.warn('[SharePoint] Error resolviendo responsable por email:', responsableEmail, e);
                return NextResponse.json({ error: `Ocurrió un error validando al responsable (${responsableEmail}).` }, { status: 400 });
            }
        } else {
            return NextResponse.json({ error: 'Debes seleccionar un responsable para la factura.' }, { status: 400 });
        }

        const fields: Record<string, any> = {
            Title: nit, 
            Nro_Factura: nroFactura,
            Proveedor: proveedor,
            Aprobacion_Doliente: 'Por Aprobar',
            Gestion_Contabilidad: 'Por Procesar',
            fp: firstFileUrl
        };

        if (valorTotal) {
            fields['Valortotal'] = valorTotal;
        }

        if (responsableLookupId) {
            fields['ResponsabledeAutorizarLookupId'] = responsableLookupId;
        }

        const newItem = await createSharePointListItem(siteIdFPK, 'Registro_de_Facturas', fields);
        const newItemId = newItem.id;

        // 7. (REMOVED) Adjuntar a SharePoint REST API (reemplazado por Supabase Storage)
        if (adjuntosData.length > 0) {
            fields['adjuntos_url'] = JSON.stringify(adjuntosData);
        }

        // 8. Upsert en Supabase para visibilidad inmediata
        try {
            const invoiceData: Record<string, any> = {
                ID: Number(newItemId),
                sharepoint_id: String(newItemId),
                Nit: nit,
                Proveedor: proveedor,
                Nro_Factura: nroFactura,
                Aprobacion_Doliente: 'Por Aprobar',
                Gestion_Contabilidad: 'Por Procesar',
                Valor_total: valorTotal || '0',
                fp: firstFileUrl,
                documentos: firstFileUrl,
                "Datos adjuntos": files.length,
                adjuntos_url: fields['adjuntos_url'] || null,
                Creado: new Date().toISOString(),
            };
            // Include the responsible person immediately so the invoice never
            // appears as "Sin asignar" while waiting for the next sync cycle.
            if (responsableName) {
                invoiceData.Responsable_de_Autorizar = responsableName;
            }

            const { error: supabaseError } = await supabaseAdmin
                .from('Registro_Facturas')
                .upsert(invoiceData, { onConflict: 'ID' });

            if (supabaseError) {
                console.error('Error al sincronizar con Supabase inmediatamente:', supabaseError.message);
            } else {
                // Auto-create Proveedor en Proveedores_con_Responsable si no existe
                try {
                    const { data: provData, error: provCheckError } = await supabaseAdmin
                        .from('Proveedores_con_Responsable')
                        .select('Nit')
                        .eq('Nit', nit)
                        .maybeSingle();
                        
                    if (!provCheckError && !provData) {
                        const { error: provInsertError } = await supabaseAdmin
                            .from('Proveedores_con_Responsable')
                            .insert({
                                "Nit": nit,
                                "Nombre de socio de negocios": proveedor,
                                "Responsable": responsableName,
                                "Autorizador": responsableName, // By default the authorizer is the responsible
                                "Creado": new Date().toISOString()
                            });
                        if (provInsertError) {
                            console.error('Error auto-creando Proveedor_con_Responsable:', provInsertError.message);
                        } else {
                            console.log(`Proveedor auto-creado en Proveedores_con_Responsable: ${proveedor} (${nit})`);
                        }
                    }
                } catch (provEx) {
                    console.error('Exception auto-creando Proveedor_con_Responsable:', provEx);
                }

                // --- Auto-approval detection ---
                try {
                    const { data: checkData } = await supabaseAdmin
                        .from('Registro_Facturas')
                        .select('Aprobacion_Doliente, centro_costos')
                        .eq('ID', Number(newItemId))
                        .single();
                        
                    if (checkData && checkData.Aprobacion_Doliente === 'Aprobado') {
                        console.log(`[Auto-Approve] Invoice ${newItemId} auto-approved by DB trigger.`);
                        
                        try {
                            const listsResponse = await client.api(`/sites/${siteIdFPK}/lists`).get();
                            const listId = listsResponse.value.find((l: any) => l.name === 'Registro_de_Facturas' || l.displayName === 'Registro_de_Facturas')?.id;
                            
                            if (listId) {
                                await client.api(`/sites/${siteIdFPK}/lists/${listId}/items/${newItemId}/fields`).patch({
                                    Aprobacion_Doliente: 'Aprobado',
                                    Observaciones: 'Aprobado automáticamente',
                                    centro_costos: checkData.centro_costos
                                });
                            }
                        } catch(spErr: any) {
                            console.error('[Auto-Approve] Error patching SharePoint:', spErr);
                        }
                        
                        try {
                            const { createSapDraft } = await import('@/lib/sap');
                            await createSapDraft({
                                nit: nit || "",
                                total: valorTotal || "0",
                                distribuciones: checkData.centro_costos ? JSON.parse(checkData.centro_costos) : [],
                                anticipo: 'f',
                                observations: 'Aprobado automáticamente por regla de proveedor',
                                nroFactura: nroFactura || String(newItemId),
                                docTypeDesc: 'FACTURA',
                                itemId: String(newItemId),
                                consecutivo: String(newItemId),
                                proveedorName: proveedor || "Proveedor Desconocido"
                            });
                        } catch (sapErr: any) {
                            console.error('[Auto-Approve] Error en SAP:', sapErr);
                            await supabaseAdmin.from('log_errores_sap').insert({
                                factura_id: Number(newItemId),
                                nro_factura: nroFactura || String(newItemId),
                                proveedor: proveedor,
                                error_mensaje: sapErr.message,
                                detalles: sapErr
                            });
                        }
                    }
                } catch(e: any) {
                    console.error('[Auto-Approve] Error in post-create auto-approve logic:', e);
                }
                // -------------------------------
            }

            // Auto-registrar proveedor si no existe
            if (responsableEmail && responsableName) {
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
                            "Responsable": responsableName,
                            "Autorizador": responsableName,
                            "Correo": responsableEmail,
                            "Creado": new Date().toISOString()
                        });
                        console.log(`[Supabase] Registrado nuevo proveedor con responsable: ${nit} - ${responsableName}`);
                    }
                } catch (providerErr) {
                    console.error("[Supabase] Error registrando Proveedor_con_Responsable:", providerErr);
                }
            }
        } catch (supabaseCatchError) {
            console.error('Error fatal al sincronizar con Supabase:', supabaseCatchError);
        }

        return NextResponse.json({ 
            success: true, 
            item: newItem
        });

    } catch (error: any) {
        console.error('Error in create-invoice API:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
