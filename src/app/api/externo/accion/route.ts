import { NextRequest, NextResponse } from 'next/server';
import { getGraphClient } from '@/lib/sharepoint';
import { createSapDraft } from '@/lib/sap';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: NextRequest) {
    try {
        const { itemId, action, observaciones, distribuciones, anticipo, valor, nit, nroFactura, listName = 'Registro_de_Facturas' } = await req.json();

        if (!itemId || !action) {
            return NextResponse.json({ error: 'Missing itemId or action' }, { status: 400 });
        }

        if (action !== 'Aprobado' && action !== 'Rechazado') {
            return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
        }

        // Clean valor if present (Number field in SP)
        let cleanValor: number | null = null;
        if (valor) {
            const numericValue = String(valor).replace(/[^0-9]/g, '');
            cleanValor = numericValue ? Number(numericValue) : null;
        }

        const client = await getGraphClient();

        // 1. Resolve Site ID
        const siteResponse = await client.api('/sites/firplaksa.sharepoint.com:/sites/FPKContabilidad').get();
        const siteId = siteResponse.id;

        // 2. Find the List
        const listsResponse = await client.api(`/sites/${siteId}/lists`).get();
        const list = listsResponse.value.find((l: any) => l.name === listName || l.displayName === listName);

        if (!list) throw new Error(`SharePoint list "${listName}" not found`);
        const listId = list.id;

        // 3. Update the Item AND Fetch current fields for SAP
        let jsonDist = "";
        if (distribuciones && Array.isArray(distribuciones) && distribuciones.length > 0) {
            const centroCostosArray = distribuciones.map((d: any) => ({
                centroCosto: d.centroCosto || d.centroCostos || "",
                cuenta: d.cuenta || "",
                valor: d.valor ? String(d.valor) : "0"
            }));
            jsonDist = JSON.stringify(centroCostosArray);
        }

        const isDocSoporte = listName === 'Documento_Soporte';
        // If it's Documento_Soporte, skip SharePoint entirely
        if (isDocSoporte) {
            let consecutivoReal = String(itemId);
            let proveedorReal = "Proveedor Desconocido";

            try {
                const supabaseUpdate: any = {
                    aprobacion_doliente: action,
                    updated_at: new Date().toISOString()
                };
                if (action === 'Aprobado') {
                    supabaseUpdate.fecha_aprobacion = new Date().toISOString(); // Setting approval date!
                }
                if (cleanValor !== null) {
                    supabaseUpdate.valor_total = cleanValor;
                }
                if (observaciones) {
                    supabaseUpdate.observaciones = observaciones;
                }
                if (anticipo) {
                    supabaseUpdate.tiene_anticipo = anticipo;
                }
                if (jsonDist) {
                    supabaseUpdate.centro_costos = jsonDist;
                }

                const { data: updatedDoc, error: supaErr } = await supabase
                    .from('Documento_Soporte')
                    .update(supabaseUpdate)
                    .eq('id', Number(itemId))
                    .select('consecutivo, proveedor')
                    .single();
                
                if (supaErr) throw supaErr;
                
                if (updatedDoc) {
                    if (updatedDoc.consecutivo) consecutivoReal = String(updatedDoc.consecutivo);
                    if (updatedDoc.proveedor) proveedorReal = updatedDoc.proveedor;
                }
                console.log(`Supabase cache updated for Documento_Soporte item ${itemId}`);
            } catch (supaErr) {
                console.error('Failed to update Supabase for Documento Soporte:', supaErr);
                throw new Error('Error al actualizar Documento Soporte en Supabase');
            }

            // Trigger SAP Draft Creation on Approval
            let sapResult = null;
            if (action === 'Aprobado') {
                try {
                    console.log(`Externo Accion: Triggering SAP Draft for item ${itemId} (Consecutivo: ${consecutivoReal})...`);

                    sapResult = await createSapDraft({
                        nit: nit || "",
                        total: cleanValor !== null ? cleanValor : (valor || "0"),
                        distribuciones: distribuciones || [],
                        anticipo: anticipo === 'Con anticipo' ? 't' : 'f',
                        observations: observaciones || 'Aprobado vía portal externo',
                        nroFactura: nroFactura || itemId,
                        docTypeDesc: 'DOCUMENTO SOPORTE',
                        itemId: String(itemId),
                        consecutivo: consecutivoReal,
                        proveedorName: proveedorReal,
                        seriesName: 'DSE3'
                    });
                } catch (sapErr: any) {
                    console.error('Failed to trigger SAP Draft registration:', sapErr.message);
                    sapResult = { success: false, error: sapErr.message };

                    try {
                        await supabase.from('log_errores_sap').insert({
                            factura_id: Number(itemId),
                            nro_factura: nroFactura || String(itemId),
                            proveedor: proveedorReal,
                            error_mensaje: sapErr.message,
                            detalles: sapErr
                        });
                    } catch (logErr) {
                        console.error('Failed to log SAP error to database:', logErr);
                    }
                }
            }

            return NextResponse.json({ success: true, sap: sapResult });
        }

        // --- For Registro_de_Facturas ---
        // Determinar si es un ID nativo de Supabase (generado por Facture) o un ID legacy de SharePoint
        const isSupabaseNativeId = Number(itemId) > 1000000;

        if (isSupabaseNativeId) {
            // ─── FLUJO SUPABASE DIRECTO (facturas creadas por Facture) ───
            let consecutivoReal = String(itemId);
            let proveedorReal = "Proveedor Desconocido";

            try {
                const supabaseUpdate: any = {
                    Aprobacion_Doliente: action,
                    updated_at: new Date().toISOString()
                };
                if (action === 'Aprobado') {
                    supabaseUpdate.FechaAprobacion = new Date().toISOString();
                }
                if (cleanValor !== null) {
                    supabaseUpdate.Valor_total = cleanValor;
                }
                if (observaciones) {
                    supabaseUpdate.Observaciones = observaciones;
                }
                if (anticipo) {
                    supabaseUpdate.tiene_anticipo = anticipo;
                }
                if (jsonDist) {
                    supabaseUpdate.centro_costos = jsonDist;
                    supabaseUpdate.tablaCostos = jsonDist;
                }

                const { data: updatedInvoice, error: supaErr } = await supabase
                    .from('Registro_Facturas')
                    .update(supabaseUpdate)
                    .eq('ID', Number(itemId))
                    .select('Consecutivo, Proveedor, Responsable_de_Autorizar')
                    .single();

                if (supaErr) throw supaErr;

                if (updatedInvoice) {
                    if (updatedInvoice.Consecutivo) consecutivoReal = String(updatedInvoice.Consecutivo);
                    if (updatedInvoice.Proveedor) proveedorReal = updatedInvoice.Proveedor;
                }
                console.log(`Supabase updated for Registro_Facturas item ${itemId} (Supabase-native)`);
            } catch (supaErr) {
                console.error('Failed to update Supabase for Registro_Facturas:', supaErr);
                throw new Error('Error al actualizar factura en Supabase');
            }

            // Ejecutar en paralelo: Creación de borrador SAP, Notificación a Teams y Eventos Facture
            let sapResult: any = null;
            let factureResult: any = null;

            const [sapSettled, _notifySettled, factureSettled] = await Promise.allSettled([
                // 1. Borrador SAP
                (action === 'Aprobado') ? (async () => {
                    try {
                        console.log(`Externo Accion: Triggering SAP Draft for item ${itemId} (Consecutivo: ${consecutivoReal})...`);
                        return await createSapDraft({
                            nit: nit || "",
                            total: cleanValor !== null ? cleanValor : (valor || "0"),
                            distribuciones: distribuciones || [],
                            anticipo: anticipo === 'Con anticipo' ? 't' : 'f',
                            observations: observaciones || 'Aprobado vía portal externo',
                            nroFactura: nroFactura || itemId,
                            itemId: String(itemId),
                            consecutivo: consecutivoReal,
                            proveedorName: proveedorReal
                        });
                    } catch (sapErr: any) {
                        console.error('Failed to trigger SAP Draft registration:', sapErr.message);
                        try {
                            await supabase.from('log_errores_sap').insert({
                                factura_id: Number(itemId),
                                nro_factura: nroFactura || String(itemId),
                                proveedor: proveedorReal,
                                error_mensaje: sapErr.message,
                                detalles: sapErr
                            });
                        } catch (logErr) {}
                        return { success: false, error: sapErr.message };
                    }
                })() : Promise.resolve(null),

                // 2. Notificación Teams Webhook
                (action === 'Aprobado' || action === 'Rechazado') ? (async () => {
                    try {
                        const { sendApprovalNotification } = await import('@/lib/sendApprovalNotification');
                        const responsableNombre = (await supabase
                            .from('Registro_Facturas')
                            .select('Responsable_de_Autorizar')
                            .eq('ID', Number(itemId))
                            .single()).data?.Responsable_de_Autorizar || "Responsable Desconocido";

                        await sendApprovalNotification({
                            factura: nroFactura || String(itemId),
                            proveedor: proveedorReal,
                            nit: nit || "",
                            responsable_aprobacion: responsableNombre,
                            estado_aprobacion: action === 'Aprobado' ? "Aprobada" : "Rechazada",
                            observaciones: observaciones || (action === 'Aprobado' ? 'Aprobado vía portal externo' : 'Rechazado vía portal externo')
                        });
                    } catch (notifyErr) {
                        console.error('Failed to send approval notification:', notifyErr);
                    }
                })() : Promise.resolve(null),

                // 3. Eventos Facture (Recibo de Bienes + Aceptación)
                (async () => {
                    try {
                        const { triggerFactureEventForInvoice } = await import('@/lib/facture');
                        return await triggerFactureEventForInvoice(itemId, action, { observaciones });
                    } catch (factureErr: any) {
                        console.error('Failed to trigger Facture event:', factureErr);
                        return { success: false, error: factureErr?.message };
                    }
                })()
            ]);

            if (sapSettled.status === 'fulfilled') sapResult = sapSettled.value;
            if (factureSettled.status === 'fulfilled') factureResult = factureSettled.value;

            return NextResponse.json({ success: true, sap: sapResult, facture: factureResult });
        }

        // ─── FLUJO LEGACY SHAREPOINT (IDs cortos de SharePoint) ───
        const updatePayload: any = {};

        updatePayload.Aprobacion_Doliente = action;

        if (action === 'Aprobado') {
            updatePayload.FechaAprobacion = new Date().toISOString();
        }

        if (observaciones) {
            updatePayload.Observaciones = observaciones;
        }
        
        if (anticipo) {
            updatePayload.tiene_anticipo = anticipo;
        }

        if (cleanValor !== null) {
            updatePayload.Valortotal = cleanValor;
        }

        if (jsonDist) {
            updatePayload.centro_costos = jsonDist;
        }

        // 1. Sync to Supabase directly (Primary Source of Truth)
        let consecutivoReal = itemId;
        let proveedorReal = "Proveedor Desconocido";
        let responsableReal = "Responsable Desconocido";

        try {
            const supabaseUpdate: any = {
                Aprobacion_Doliente: action,
                updated_at: new Date().toISOString()
            };
            if (updatePayload.FechaAprobacion) {
                supabaseUpdate.FechaAprobacion = updatePayload.FechaAprobacion;
            }
            if (cleanValor !== null) {
                supabaseUpdate["Valor_total"] = cleanValor;
            }
            if (observaciones) {
                supabaseUpdate.Observaciones = observaciones;
            }
            if (anticipo) {
                supabaseUpdate.tiene_anticipo = anticipo;
            }
            if (updatePayload.centro_costos) {
                supabaseUpdate.centro_costos = updatePayload.centro_costos;
                supabaseUpdate.tablaCostos = jsonDist; // Keep full version in Supabase
            }

            const { data: supaUpdated, error: supaErr } = await supabase
                .from('Registro_Facturas')
                .update(supabaseUpdate)
                .eq('ID', Number(itemId))
                .select('Consecutivo, Proveedor, Responsable_de_Autorizar')
                .single();
            
            if (supaErr) throw supaErr;

            if (supaUpdated) {
                if (supaUpdated.Consecutivo) consecutivoReal = supaUpdated.Consecutivo;
                if (supaUpdated.Proveedor) proveedorReal = supaUpdated.Proveedor;
                if (supaUpdated.Responsable_de_Autorizar) responsableReal = supaUpdated.Responsable_de_Autorizar;
            }
            console.log(`Supabase updated for Registro_Facturas item ${itemId}`);
        } catch (supaErr) {
            console.error('Failed to update Supabase:', supaErr);
        }

        // 2. Best-effort update to SharePoint (Legacy, decoupled)
        let spItem: any = null;
        try {
            console.log(`Sending optional PATCH to SharePoint item ${itemId} in list ${listId}`);
            await client.api(`/sites/${siteId}/lists/${listId}/items/${itemId}/fields`).patch(updatePayload);
            spItem = await client.api(`/sites/${siteId}/lists/${listId}/items/${itemId}/fields`).get();
            if (spItem?.Consecutivo) consecutivoReal = spItem.Consecutivo;
            if (spItem?.Proveedor) proveedorReal = spItem.Proveedor;
            if (spItem?.Responsable_de_Autorizar) responsableReal = spItem.Responsable_de_Autorizar;
        } catch (spErr: any) {
            console.warn('SharePoint update skipped or failed (decoupled):', spErr?.message);
        }

        // Ejecutar en paralelo: Creación de borrador SAP, Notificación a Teams y Eventos Facture
        let sapResult: any = null;
        let factureResult: any = null;

        const [sapSettled, _notifySettled, factureSettled] = await Promise.allSettled([
            // 4. Trigger SAP Draft Creation on Approval
            (action === 'Aprobado') ? (async () => {
                try {
                    console.log(`Externo Accion: Triggering SAP Draft for item ${itemId} (Consecutivo: ${consecutivoReal})...`);
                    return await createSapDraft({
                        nit: nit || "",
                        total: cleanValor !== null ? cleanValor : (valor || "0"),
                        distribuciones: distribuciones || [],
                        anticipo: anticipo === 'Con anticipo' ? 't' : 'f',
                        observations: observaciones || 'Aprobado vía portal externo',
                        nroFactura: nroFactura || itemId,
                        docTypeDesc: isDocSoporte ? 'DOCUMENTO SOPORTE' : 'FACTURA',
                        itemId: String(itemId),
                        consecutivo: consecutivoReal,
                        proveedorName: proveedorReal,
                        seriesName: isDocSoporte ? 'DSE3' : undefined
                    });
                } catch (sapErr: any) {
                    console.error('Failed to trigger SAP Draft registration:', sapErr.message);
                    try {
                        await supabase.from('log_errores_sap').insert({
                            factura_id: Number(itemId),
                            nro_factura: nroFactura || String(itemId),
                            proveedor: proveedorReal,
                            error_mensaje: sapErr.message,
                            detalles: sapErr
                        });
                    } catch (logErr) {}
                    return { success: false, error: sapErr.message };
                }
            })() : Promise.resolve(null),

            // 5. Enviar Notificación por Webhook de Power Automate
            (action === 'Aprobado' || action === 'Rechazado') ? (async () => {
                try {
                    const { sendApprovalNotification } = await import('@/lib/sendApprovalNotification');
                    await sendApprovalNotification({
                        factura: nroFactura || String(itemId),
                        proveedor: proveedorReal,
                        nit: nit || "",
                        responsable_aprobacion: responsableReal || spItem?.Responsable_de_Autorizar || "Responsable Desconocido",
                        estado_aprobacion: action === 'Aprobado' ? "Aprobada" : "Rechazada",
                        observaciones: observaciones || (action === 'Aprobado' ? 'Aprobado vía portal externo' : 'Rechazado vía portal externo')
                    });
                } catch (notifyErr) {
                    console.error('Failed to send approval notification:', notifyErr);
                }
            })() : Promise.resolve(null),

            // 6. Enviar evento a Facture (Aprobado o Rechazado) únicamente si es Registro_de_Facturas
            (!isDocSoporte && (listName === 'Registro_de_Facturas' || listName === 'Registro_Facturas')) ? (async () => {
                try {
                    const { triggerFactureEventForInvoice } = await import('@/lib/facture');
                    return await triggerFactureEventForInvoice(itemId, action, {
                        responsableName: responsableReal || spItem?.Responsable_de_Autorizar,
                        observaciones
                    });
                } catch (factureErr: any) {
                    console.error('Failed to trigger Facture event:', factureErr);
                    return { success: false, error: factureErr?.message };
                }
            })() : Promise.resolve(null)
        ]);

        if (sapSettled.status === 'fulfilled') sapResult = sapSettled.value;
        if (factureSettled.status === 'fulfilled') factureResult = factureSettled.value;

        return NextResponse.json({ success: true, sap: sapResult, facture: factureResult });
    } catch (error: any) {
        console.error('Error in externo-accion API:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

