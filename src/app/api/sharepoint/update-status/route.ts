import { NextRequest, NextResponse } from 'next/server';
import { getGraphClient } from '@/lib/sharepoint';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: NextRequest) {
    try {
        const { itemId, status, listName = 'Registro_de_Facturas', field = 'Aprobacion_Doliente', procesadoPor } = await req.json();

        if (!itemId || !status) {
            return NextResponse.json({ error: 'Missing itemId or status' }, { status: 400 });
        }

        if (listName === 'Documento_Soporte') {
            const updatePayload: any = {
                updated_at: new Date().toISOString()
            };
            
            if (field === 'Gestion_Contabilidad') {
                updatePayload.gestion_contabilidad = status;
                if (status === 'Procesado') {
                    updatePayload.FechaProcesado = new Date().toISOString();
                    if (procesadoPor) {
                        updatePayload.ProcesadoPor = procesadoPor;
                        updatePayload.DigitadoPor = procesadoPor;
                    }
                }
            } else if (field === 'Observaciones') {
                updatePayload.observaciones = status;
            } else {
                updatePayload.aprobacion_doliente = status;
                updatePayload.fecha_aprobacion = new Date().toISOString();
                if (status === 'Aprobado') {
                    updatePayload.gestion_contabilidad = 'Por Procesar';
                }
            }

            const { error: supaErr } = await supabaseAdmin
                .from('Documento_Soporte')
                .update(updatePayload)
                .eq('id', Number(itemId));
                
            if (supaErr) throw new Error(supaErr.message);
            console.log(`Successfully updated status for Documento_Soporte item ${itemId} in Supabase`);
            return NextResponse.json({ success: true });
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

        const updateData: any = {};
        if (field === 'Gestion_Contabilidad') {
            updateData.Gestion_Contabilidad = status;
            if (status === 'Procesado') {
                updateData.FechaProcesado = new Date().toISOString();
                if (procesadoPor) {
                    updateData.DigitadoPor = procesadoPor;
                }
            }
        } else if (field === 'Observaciones') {
            updateData.Observaciones = status;
        } else {
            updateData.Aprobacion_Doliente = status;
            if (status === 'Aprobado') {
                updateData.Gestion_Contabilidad = 'Por Procesar';
            }
            updateData.FechaAprobacion = new Date().toISOString();
        }

        // 3. Update SharePoint
        await client.api(`/sites/${siteId}/lists/${listId}/items/${itemId}/fields`).patch(updateData);

        console.log(`Successfully updated status for item ${itemId} in SharePoint`);

        // 4. Update Supabase (using admin client to bypass RLS)
        try {
            const supaUpdate: any = {
                updated_at: new Date().toISOString()
            };
            if (field === 'Gestion_Contabilidad') {
                supaUpdate.Gestion_Contabilidad = status;
                if (status === 'Procesado') {
                    supaUpdate.FechaProcesado = new Date().toISOString();
                    supaUpdate.Procesado = 'true';
                    if (procesadoPor) {
                        // NOTA: Registro_Facturas no tiene columna ProcesadoPor (solo
                        // DigitadoPor). Incluirla hacia que PostgREST rechazara TODO
                        // el update con "column does not exist", y el error quedaba
                        // atrapado en el catch de abajo sin avisar al usuario -- la
                        // factura nunca se guardaba como Procesado pese a mostrar
                        // "exito".
                        supaUpdate.DigitadoPor = procesadoPor;
                    }
                }
            } else if (field === 'Observaciones') {
                supaUpdate.Observaciones = status;
            } else {
                supaUpdate.Aprobacion_Doliente = status;
                supaUpdate.FechaAprobacion = updateData.FechaAprobacion;
                if (status === 'Aprobado') {
                    supaUpdate.Gestion_Contabilidad = 'Por Procesar';
                }
            }

            const supaTable = listName === 'Radicados de importación'
                ? 'Radicados_de_importacion'
                : listName === 'Registro_de_Facturas'
                    ? 'Registro_Facturas'
                    : listName;

            const { error: supaErr, count } = await supabaseAdmin
                .from(supaTable)
                .update(supaUpdate)
                .eq(listName === 'Registro_de_Facturas' ? 'ID' : 'id', Number(itemId));

            if (supaErr) {
                console.error(`[update-status] Supabase update FAILED for ${supaTable} ID ${itemId}:`, supaErr.message);
                return NextResponse.json({
                    error: `Se actualizo en SharePoint pero fallo el guardado en la base de datos: ${supaErr.message}`
                }, { status: 500 });
            } else {
                console.log(`[update-status] Supabase update OK for ${supaTable} ID ${itemId} — field=${field} status=${status}`);
            }
        } catch (supaErr: any) {
            console.error('[update-status] Failed to update Supabase cache:', supaErr);
            return NextResponse.json({
                error: `Se actualizo en SharePoint pero fallo el guardado en la base de datos: ${supaErr?.message || supaErr}`
            }, { status: 500 });
        }

        // 5. Auto-crear draft en SAP cuando se aprueba manualmente
        let sapAutoResult: any = null;
        if (field === 'Aprobacion_Doliente' && status === 'Aprobado') {
            try {
                const supaTable = listName === 'Radicados de importación'
                    ? 'Radicados_de_importacion'
                    : listName === 'Registro_de_Facturas'
                        ? 'Registro_Facturas'
                        : listName;
                const idCol = listName === 'Registro_de_Facturas' ? 'ID' : 'id';

                const { data: invoiceData } = await supabaseAdmin
                    .from(supaTable)
                    .select('*')
                    .eq(idCol, Number(itemId))
                    .single();

                if (invoiceData) {
                    // Extraer datos según el tipo de lista
                    let nit: string, total: string, proveedor: string, nroFactura: string,
                        consecutivo: string, observaciones: string, tieneAnticipo: boolean,
                        centroCostosRaw: any;

                    if (supaTable === 'Radicados_de_importacion') {
                        nit = String(invoiceData.Nit || '').replace(/[\.\s]/g, '').trim();
                        total = String(invoiceData.Monto || 0);
                        proveedor = invoiceData.Proveedor || 'Proveedor Desconocido';
                        nroFactura = invoiceData.Nro_Factura || 'S/N';
                        consecutivo = invoiceData.Consecutivo || String(itemId);
                        observaciones = invoiceData.Observaciones || 'Aprobado manualmente';
                        tieneAnticipo = false;
                        centroCostosRaw = invoiceData.centro_costos;
                    } else {
                        nit = String(invoiceData.Nit || invoiceData.Title || '').replace(/[\.\s]/g, '').trim();
                        total = String(invoiceData.Valor_total ?? invoiceData['Valor total'] ?? invoiceData.Monto ?? 0);
                        proveedor = invoiceData.Proveedor || 'Proveedor Desconocido';
                        nroFactura = invoiceData.Nro_Factura || 'S/N';
                        consecutivo = invoiceData.Consecutivo || String(itemId);
                        observaciones = invoiceData.Observaciones || 'Aprobado manualmente';
                        tieneAnticipo = invoiceData.tiene_anticipo === 't' || invoiceData.tiene_anticipo === true || invoiceData.tiene_anticipo === 'true';
                        centroCostosRaw = invoiceData.centro_costos || invoiceData.tablaCostos;
                    }

                    // Parsear distribuciones del centro de costos
                    let distribuciones: any[] = [];

                    if (supaTable === 'Radicados_de_importacion' && (!centroCostosRaw || centroCostosRaw === '[]')) {
                        distribuciones = [{
                            cuenta: '14650505',
                            centroCostos: '',
                            valor: Number(total) || 0
                        }];
                    } else if (centroCostosRaw) {
                        try {
                            let parsed = typeof centroCostosRaw === 'string' ? JSON.parse(centroCostosRaw) : centroCostosRaw;
                            if (typeof parsed === 'string') parsed = JSON.parse(parsed);
                            if (!Array.isArray(parsed)) parsed = parsed ? [parsed] : [];
                            distribuciones = parsed.map((d: any) => ({
                                centroCostos: d.centroCostos || d.centroCosto || d.centro_costos || '',
                                cuenta: d.cuenta || d.Cuenta || '',
                                valor: d.valor || d.Valor || d.monto || 0
                            }));
                        } catch (parseErr) {
                            console.error('[update-status] Error parsing centro_costos for SAP:', parseErr);
                        }
                    }

                    if (distribuciones.length > 0) {
                        const { createSapDraft } = await import('@/lib/sap');
                        const isImport = supaTable === 'Radicados_de_importacion';
                        const docCurrency = isImport ? 'USD' : undefined;
                        const docTypeDesc = isImport ? 'RADICADO IMPORTACION' : 'FACTURA';

                        sapAutoResult = await createSapDraft({
                            nit,
                            total,
                            distribuciones,
                            anticipo: tieneAnticipo ? 't' : 'f',
                            observations: observaciones,
                            nroFactura,
                            docTypeDesc,
                            itemId: String(itemId),
                            consecutivo,
                            proveedorName: proveedor,
                            docCurrency
                        });

                        console.log(`[update-status] ✅ SAP draft auto-creado al aprobar factura ${itemId} — DocEntry: ${sapAutoResult?.draftId}`);
                    } else {
                        console.warn(`[update-status] Factura ${itemId} aprobada pero sin centro de costos — SAP no se creó automáticamente`);
                    }
                }
            } catch (sapErr: any) {
                console.error(`[update-status] Error auto-creando draft SAP al aprobar factura ${itemId}:`, sapErr.message);
                // Registrar en log de errores pero NO fallar la aprobación
                try {
                    await supabaseAdmin.from('log_errores_sap').insert({
                        factura_id: Number(itemId),
                        nro_factura: String(itemId),
                        proveedor: 'N/A',
                        error_mensaje: `Auto-SAP al aprobar: ${sapErr.message}`,
                        detalles: sapErr
                    });
                } catch (logErr) {
                    console.error('[update-status] Error logging SAP error:', logErr);
                }
            }
        }

        return NextResponse.json({ 
            success: true,
            ...(sapAutoResult ? { sapDraft: sapAutoResult } : {})
        });
    } catch (error: any) {
        console.error('Error updating status:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

