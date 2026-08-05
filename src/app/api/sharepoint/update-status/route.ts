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
                // SharePoint ya se actualizo (paso 3), pero el cache de Supabase que
                // lee la app no quedo al dia. Antes esto se tragaba en silencio y la
                // API respondia {success:true} igual, asi que el usuario nunca se
                // enteraba de que la factura no quedaba guardada como Procesado.
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

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Error updating status:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

