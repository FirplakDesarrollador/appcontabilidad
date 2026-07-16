import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as msal from '@azure/msal-node';
import { Client } from '@microsoft/microsoft-graph-client';

// ─── SharePoint Graph Client ───────────────────────────────────────────────
const msalConfig = {
    auth: {
        clientId: process.env.AZURE_CLIENT_ID!,
        authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
        clientSecret: process.env.AZURE_CLIENT_SECRET!,
    },
};
const cca = new msal.ConfidentialClientApplication(msalConfig);

async function getGraphClient() {
    const response = await cca.acquireTokenByClientCredential({
        scopes: ['https://graph.microsoft.com/.default'],
    });
    return Client.init({
        authProvider: (done) => done(null, response!.accessToken!),
    });
}

// ─── Supabase Service Client ───────────────────────────────────────────────
const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

const BUCKET = 'Facturas';
const SHAREPOINT_HOST = 'firplaksa.sharepoint.com';
const SHAREPOINT_SITE = 'FPKContabilidad';
const LIST_NAME = 'Registro_de_Facturas';

export async function POST(req: Request) {
    try {
        const body = await req.json().catch(() => ({}));
        const limit: number = body.limit ?? 20;
        const offset: number = body.offset ?? 0;

        console.log(`[SYNC] Starting batch sync: offset=${offset}, limit=${limit}`);

        const client = await getGraphClient();

        // 1. Resolve Site and List IDs
        const siteResponse = await client.api(`/sites/${SHAREPOINT_HOST}:/sites/${SHAREPOINT_SITE}`).get();
        const siteId = siteResponse.id;

        const listsResponse = await client.api(`/sites/${siteId}/lists`).get();
        const list = listsResponse.value.find((l: any) => l.name === LIST_NAME || l.displayName === LIST_NAME);
        if (!list) throw new Error(`SharePoint list "${LIST_NAME}" not found`);
        const listId = list.id;

        // 2. Fetch specific batch items from SharePoint
        // We use $orderby=id desc to get NEWEST invoices first
        console.log(`[SYNC] Fetching metadata from SharePoint (offset=${offset}, limit=${limit})...`);
        
        // Note: SharePoint 'items' endpoint pagination is best done via nextLink, 
        // but for specific offset/limit we can use $top and then skip manually or use $skip if supported.
        // However, $orderby is crucial here.
        let nextLink = `/sites/${siteId}/lists/${listId}/items?expand=fields&top=${limit + offset}&$orderby=id desc`;
        
        const response = await client.api(nextLink).get();
        const allItems = response.value || [];
        
        // Skip the offset to get the specific batch
        const spBatch = allItems.slice(offset, offset + limit);
        
        console.log(`[SYNC] Found ${spBatch.length} items to process in this batch (from ID ${spBatch[0]?.id} down).`);

        if (spBatch.length === 0) {
            return NextResponse.json({ success: true, message: 'No more items to sync', processed: 0, totalBatch: 0 });
        }

        let totalProcessed = 0;

        for (const item of spBatch) {
            const fields = item.fields;
            const spItemId = item.id;

            // a. Prepare Metadata
            // Detect attachments presence
            const hasAttachmentsFlag = fields.Attachments === true || fields['{HasAttachments}'] === true || Number(fields.Datos_adjuntos) > 0;

            const invoiceData: any = {
                ID: Number(spItemId),
                sharepoint_id: String(spItemId),
                Nit: fields.Nit ?? fields.Title ?? fields.LinkTitle ?? null,
                Proveedor: fields.Proveedor ?? null,
                Nro_Factura: fields.Nro_Factura ?? null,
                Aprobacion_Doliente: fields.Aprobacion_Doliente ?? null,
                Gestion_Contabilidad: fields.Gestion_Contabilidad ?? null,
                Observaciones: fields.Observaciones ?? null,
                Consecutivo: fields.Consecutivo ?? null,
                Responsable_de_Autorizar: fields.Responsable_de_Autorizar ?? null,
                FechaAprobacion: fields.FechaAprobacion ?? null,
                centro_costos: fields.centro_costos ?? null,
                Valor_total: fields["Valor_x0020_total"] ?? fields["Valor total"] ?? fields.Valor_total ?? null,
                tiene_anticipo: fields.tiene_anticipo ?? null,
                Creado: fields.Created ?? fields.Creado ?? null,
                Creado_por: fields.AuthorLookupId ? String(fields.AuthorLookupId) : (fields["Creado por"] ?? fields.Creado_por ?? null),
                CUFE: fields.CUFE ?? null,
                InformeRecepcion: fields.InformeRecepcion ?? null,
                FechaProcesado: fields.FechaProcesado ?? null,
                DigitadoPor: fields.DigitadoPor ?? null,
                Datos_adjuntos: hasAttachmentsFlag ? 1 : 0,
                tablaCostos: fields.tablaCostos ?? null,
                Procesado: fields.Procesado != null ? String(fields.Procesado) : null,
                Modificado: fields.Modified ?? fields.Modificado ?? null,
                Modificado_por: fields.EditorLookupId ? String(fields.EditorLookupId) : (fields["Modificado por"] ?? fields.Modificado_por ?? null),
                fp: fields.fp ?? null,
            };

            // b. Handle Attachments
            let documentUrl = null;

            if (hasAttachmentsFlag) {
                console.log(`[SYNC] Item ${spItemId} has attachments. Fetching...`);
                try {
                    const attachmentsRes = await client.api(`/sites/${siteId}/lists/${listId}/items/${spItemId}/attachments`).get();
                    const attachments = attachmentsRes.value || [];
                    console.log(`[SYNC] Item ${spItemId}: Found ${attachments.length} attachment(s).`);

                    if (attachments.length > 0) {
                        const uploadedUrls = [];
                        for (const att of attachments) {
                            const fileName = att.name;
                            const safeFileName = `${spItemId}/${Date.now()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

                            console.log(`[SYNC] Downloading attachment: ${fileName}...`);

                            // Use the content directly if possible, or fetch via Graph
                            const tokenResponse = await cca.acquireTokenByClientCredential({
                                scopes: ['https://graph.microsoft.com/.default'],
                            });

                            // The direct URL for list item attachment content is:
                            // /sites/{site-id}/lists/{list-id}/items/{item-id}/attachments/{attachment-id}/$value
                            const fileRes = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${listId}/items/${spItemId}/attachments/${att.id}/$value`, {
                                headers: { Authorization: `Bearer ${tokenResponse!.accessToken!}` }
                            });

                            if (fileRes.ok) {
                                const buffer = await fileRes.arrayBuffer();
                                const contentType = fileRes.headers.get('content-type') || 'application/octet-stream';

                                console.log(`[SYNC] Uploading ${fileName} to Supabase bucket...`);
                                const { error: uploadError } = await supabaseAdmin.storage
                                    .from(BUCKET)
                                    .upload(safeFileName, Buffer.from(buffer), {
                                        contentType,
                                        upsert: true
                                    });

                                if (uploadError) {
                                    console.error(`[SYNC] Upload error for ${fileName}:`, uploadError.message);
                                } else {
                                    const { data: publicUrl } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(safeFileName);
                                    uploadedUrls.push(publicUrl.publicUrl);
                                    console.log(`[SYNC] Successfully uploaded: ${publicUrl.publicUrl}`);
                                }
                            } else {
                                console.error(`[SYNC] Failed to download attachment ${fileName}: Status ${fileRes.status}`);
                            }
                        }
                        if (uploadedUrls.length > 0) {
                            documentUrl = uploadedUrls.length === 1 ? uploadedUrls[0] : JSON.stringify(uploadedUrls);
                        }
                    }
                } catch (e: any) {
                    console.error(`[SYNC] Error processing attachments for item ${spItemId}:`, e.message);
                }
            }

            invoiceData.documentos = documentUrl;

            // c. Upsert to Supabase
            const { error: upsertError } = await supabaseAdmin
                .from('Registro_Facturas')
                .upsert(invoiceData, { onConflict: 'ID' });

            if (upsertError) {
                console.error(`[SYNC] Error upserting invoice ${spItemId}:`, upsertError.message);
            } else {
                totalProcessed++;
                
                // --- Auto-approval detection ---
                try {
                    const { data: checkData } = await supabaseAdmin
                        .from('Registro_Facturas')
                        .select('Aprobacion_Doliente, centro_costos')
                        .eq('ID', Number(spItemId))
                        .single();
                        
                    if (checkData && checkData.Aprobacion_Doliente === 'Aprobado' && invoiceData.Aprobacion_Doliente !== 'Aprobado') {
                        console.log(`[Auto-Approve] Invoice ${spItemId} auto-approved by DB trigger.`);
                        
                        try {
                            await client.api(`/sites/${siteId}/lists/${listId}/items/${spItemId}/fields`).patch({
                                Aprobacion_Doliente: 'Aprobado',
                                Observaciones: 'Aprobado automáticamente',
                                centro_costos: checkData.centro_costos
                            });
                        } catch(spErr) {
                            console.error('[Auto-Approve] Error patching SharePoint:', spErr);
                        }
                        
                        try {
                            const { createSapDraft } = await import('@/lib/sap');
                            await createSapDraft({
                                nit: invoiceData.Nit || "",
                                total: invoiceData.Valor_total || "0",
                                distribuciones: checkData.centro_costos ? JSON.parse(checkData.centro_costos) : [],
                                anticipo: 'f',
                                observations: 'Aprobado automáticamente por regla de proveedor',
                                nroFactura: invoiceData.Nro_Factura || String(spItemId),
                                docTypeDesc: 'FACTURA',
                                itemId: String(spItemId),
                                consecutivo: invoiceData.Consecutivo || String(spItemId),
                                proveedorName: invoiceData.Proveedor || "Proveedor Desconocido"
                            });
                        } catch (sapErr: any) {
                            console.error('[Auto-Approve] Error en SAP:', sapErr);
                            await supabaseAdmin.from('log_errores_sap').insert({
                                factura_id: Number(spItemId),
                                nro_factura: invoiceData.Nro_Factura || String(spItemId),
                                proveedor: invoiceData.Proveedor,
                                error_mensaje: sapErr.message,
                                detalles: sapErr
                            });
                        }
                    }
                } catch(e: any) {
                    console.error('[Auto-Approve] Error in post-sync auto-approve logic:', e);
                }
                // -------------------------------
            }
        }

        return NextResponse.json({
            success: true,
            processed: totalProcessed,
            nextOffset: offset + spBatch.length,
            totalBatch: spBatch.length
        });

    } catch (error: any) {
        console.error('[SYNC] Fatal error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
