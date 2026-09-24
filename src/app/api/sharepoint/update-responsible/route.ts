import { NextRequest, NextResponse } from 'next/server';
import { getGraphClient } from '@/lib/sharepoint';
import { sendReassignmentNotification } from '@/lib/sendReassignmentNotification';
import { supabase } from '@/lib/supabaseClient';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

export async function POST(req: NextRequest) {
    try {
        const {
            itemId,
            userEmail,
            userName,
            listName = 'Registro_de_Facturas',
            assignedByName,
            invoiceNumber,
            providerName
        } = await req.json();

        if (!itemId || !userEmail) {
            return NextResponse.json({ error: 'Missing itemId or userEmail' }, { status: 400 });
        }

        if (listName === 'Documento_Soporte') {
            const { error: supaErr } = await supabase
                .from('Documento_Soporte')
                .update({
                    responsable_id: userEmail,
                    responsable_nombre: userName,
                    updated_at: new Date().toISOString()
                })
                .eq('id', Number(itemId));
                
            if (supaErr) throw new Error(supaErr.message);
            console.log(`Successfully updated responsible for Documento_Soporte item ${itemId} in Supabase`);
            
            const notificationSent = await sendReassignmentNotification({
                itemId,
                recipientEmail: userEmail,
                recipientName: userName,
                assignedByName,
                invoiceNumber,
                providerName,
                listName
            });
            return NextResponse.json({ success: true, notificationSent });
        }

        // 1. Actualizar Supabase PRIMERO (Sistema principal)
        let itemNit = null;
        let itemProveedor = providerName;
        let sharepointIdToUse = null;

        if (listName === 'Documento_Soporte') {
            const { data: supaDoc, error: supaErr } = await supabaseAdmin
                .from('Documento_Soporte')
                .update({
                    responsable_id: userEmail,
                    responsable_nombre: userName,
                    updated_at: new Date().toISOString()
                })
                .eq('id', Number(itemId))
                .select('nit, proveedor')
                .maybeSingle();

            if (supaErr) throw new Error(`Error actualizando base de datos: ${supaErr.message}`);
            if (supaDoc) {
                itemNit = supaDoc.nit;
                itemProveedor = supaDoc.proveedor || itemProveedor;
            }
            console.log(`Supabase Documento_Soporte responsible updated for item ${itemId}`);
        } else {
            const { data: itemData, error: supaErr } = await supabaseAdmin
                .from('Registro_Facturas')
                .update({
                    Responsable_de_Autorizar: userName,
                    updated_at: new Date().toISOString()
                })
                .eq('ID', Number(itemId))
                .select('Nit, Proveedor, sharepoint_id')
                .maybeSingle();

            if (supaErr) throw new Error(`Error actualizando base de datos: ${supaErr.message}`);
            if (itemData) {
                itemNit = itemData.Nit;
                itemProveedor = itemData.Proveedor || itemProveedor;
                sharepointIdToUse = itemData.sharepoint_id || (Number(itemId) < 100000000 ? itemId : null);
            }
            console.log(`Supabase Registro_Facturas responsible updated for item ${itemId}`);
        }

        // Auto-registrar o actualizar proveedor en Proveedores_con_Responsable
        if (itemNit && userName) {
            try {
                const baseNit = itemNit.includes('-') ? itemNit.split('-')[0] : itemNit;
                const { data: existingProvider, error: lookupError } = await supabaseAdmin
                    .from("Proveedores_con_Responsable")
                    .select('"Nit", "Responsable"')
                    .or(`Nit.ilike.${baseNit}%,Nit.ilike.${itemNit}%`)
                    .limit(1);

                if (!lookupError && (!existingProvider || existingProvider.length === 0)) {
                    await supabaseAdmin.from("Proveedores_con_Responsable").insert({
                        "Nit": itemNit,
                        "Nombre de socio de negocios": itemProveedor || "Proveedor Desconocido",
                        "Responsable": userName,
                        "Autorizador": userName,
                        "Correo": userEmail,
                        "Creado": new Date().toISOString()
                    });
                    console.log(`[Supabase] Auto-registrado nuevo proveedor con responsable: ${itemNit} - ${userName}`);
                } else if (existingProvider && existingProvider.length > 0) {
                    await supabaseAdmin
                        .from("Proveedores_con_Responsable")
                        .update({
                            "Responsable": userName,
                            "Autorizador": userName,
                            "Correo": userEmail,
                            "Modificado": new Date().toISOString()
                        })
                        .eq("Nit", existingProvider[0].Nit);
                    console.log(`[Supabase] Actualizado responsable de proveedor existente: ${existingProvider[0].Nit} -> ${userName}`);
                }
            } catch (providerErr) {
                console.error("[Supabase] Error registrando/actualizando Proveedor_con_Responsable:", providerErr);
            }
        }

        // 2. Actualización opcional a SharePoint (desacoplada, sólo si tiene ID válido)
        if (sharepointIdToUse) {
            try {
                const client = await getGraphClient();
                const siteResponse = await client.api('/sites/firplaksa.sharepoint.com:/sites/FPKContabilidad').get();
                const siteId = siteResponse.id;
                const listsResponse = await client.api(`/sites/${siteId}/lists`).get();
                const list = listsResponse.value.find((l: any) => l.name === listName || l.displayName === listName);

                if (list) {
                    let userInfoRes;
                    try {
                        userInfoRes = await client.api(`/sites/${siteId}/lists('User Information List')/items`)
                            .header('Prefer', 'HonorNonIndexedQueriesWarningMayFailRandomly')
                            .expand('fields($select=id,EMail,Title)')
                            .filter(`fields/EMail eq '${userEmail}'`)
                            .get();
                    } catch (e: any) {
                        console.warn('Filtered search failed, falling back to full list search:', e.message);
                    }

                    let sharepointUserId = null;
                    if (userInfoRes && userInfoRes.value && userInfoRes.value.length > 0) {
                        sharepointUserId = userInfoRes.value[0].id;
                    } else {
                        const allUsers = await client.api(`/sites/${siteId}/lists('User Information List')/items`)
                            .expand('fields($select=id,EMail,Title)')
                            .get();
                        const foundUser = allUsers.value.find((u: any) =>
                            u.fields.EMail?.toLowerCase() === userEmail.toLowerCase() ||
                            u.fields.Title?.toLowerCase() === userName?.toLowerCase()
                        );
                        if (foundUser) sharepointUserId = foundUser.id;
                    }

                    if (sharepointUserId) {
                        const idFieldsToTry = [
                            'ResponsabledeAutorizarLookupId', 
                            'Responsable_de_AutorizarLookupId',
                            'ResponsableAprobarLookupId'
                        ];

                        for (const fieldName of idFieldsToTry) {
                            try {
                                await client.api(`/sites/${siteId}/lists/${list.id}/items/${sharepointIdToUse}/fields`).patch({
                                    [fieldName]: sharepointUserId
                                });
                                console.log(`Successfully updated ${fieldName} for item ${sharepointIdToUse} in SharePoint`);
                                break;
                            } catch (e: any) {
                                console.warn(`Field ${fieldName} error: ${e.message}`);
                            }
                        }
                    }
                }
            } catch (spErr: any) {
                console.warn('SharePoint update skipped or failed (decoupled):', spErr?.message);
            }
        }

        const notificationSent = await sendReassignmentNotification({
            itemId,
            recipientEmail: userEmail,
            recipientName: userName,
            assignedByName,
            invoiceNumber,
            providerName,
            listName
        });

        return NextResponse.json({ success: true, notificationSent });
    } catch (error: any) {
        console.error('Error updating responsible:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
