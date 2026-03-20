import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as msal from '@azure/msal-node';

// ─── MSAL config ──────────────────────────────────────────────────────────
const msalConfig = {
    auth: {
        clientId: process.env.AZURE_CLIENT_ID!,
        authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
        clientSecret: process.env.AZURE_CLIENT_SECRET!,
    },
};
const cca = new msal.ConfidentialClientApplication(msalConfig);

async function getSharePointToken() {
    // Use SharePoint-specific scope for REST API access
    const response = await cca.acquireTokenByClientCredential({
        scopes: ['https://firplaksa.sharepoint.com/.default'],
    });
    return response!.accessToken!;
}

// ─── Supabase client ───────────────────────────────────────────────────────
const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

const BUCKET = 'Facturas';
const SP_BASE = 'https://firplaksa.sharepoint.com/sites/FPKContabilidad';
const LIST_NAME = 'Registro_de_Facturas';

export async function POST(req: Request) {
    try {
        const body = await req.json().catch(() => ({}));
        const limit: number = body.limit ?? 50;
        const offset: number = body.offset ?? 0;

        // 1. Get access token for SharePoint REST API
        const token = await getSharePointToken();
        const headers = {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json;odata=nometadata',
        };

        // 2. Fetch rows with attachments not yet processed
        const { data: facturas, error: dbError } = await supabaseAdmin
            .from('Registro_Facturas')
            .select('ID, sharepoint_id, "Datos adjuntos"')
            .gt('"Datos adjuntos"', 0)
            .is('documentos', null)
            .order('ID', { ascending: true })
            .range(offset, offset + limit - 1);

        if (dbError) throw dbError;
        if (!facturas || facturas.length === 0) {
            return NextResponse.json({
                success: true,
                message: 'No hay facturas pendientes de procesar.',
                processed: 0, total: 0,
            });
        }

        let processed = 0;
        let skipped = 0;
        const results: Array<{ id: number; urls: string[] }> = [];

        for (const factura of facturas) {
            const spItemId = factura.sharepoint_id ?? String(factura.ID);

            try {
                // 3. Fetch attachment file list via SharePoint REST API
                const attachUrl =
                    `${SP_BASE}/_api/web/lists/getbytitle('${LIST_NAME}')/items(${spItemId})/AttachmentFiles`;
                const attachRes = await fetch(attachUrl, { headers });

                if (!attachRes.ok) {
                    console.warn(`Attachments fetch failed for ${factura.ID}: ${attachRes.status} ${attachRes.statusText}`);
                    skipped++;
                    continue;
                }

                const attachData = await attachRes.json();
                const attachments: any[] = attachData.value ?? [];

                if (attachments.length === 0) {
                    skipped++;
                    continue;
                }

                const uploadedUrls: string[] = [];

                for (const attachment of attachments) {
                    const fileName: string = attachment.FileName;
                    // FileName can include special chars — sanitize for storage path
                    const safeName = `${factura.ID}/${Date.now()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

                    // 4. Download the file using the REST API download URL
                    const downloadUrl: string = attachment.ServerRelativeUrl
                        ? `https://firplaksa.sharepoint.com${attachment.ServerRelativeUrl}`
                        : `${SP_BASE}/_api/web/GetFileByServerRelativePath(decodedurl='${encodeURIComponent(attachment.ServerRelativeUrl || '')}')/OpenBinaryStream`;

                    const fileResponse = await fetch(downloadUrl, { headers });
                    if (!fileResponse.ok) {
                        console.warn(`Failed to download ${fileName} for factura ${factura.ID}: ${fileResponse.status}`);
                        continue;
                    }

                    const buffer = await fileResponse.arrayBuffer();
                    // Detect content type by extension
                    const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
                    const contentTypeMap: Record<string, string> = {
                        pdf: 'application/pdf',
                        xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                        xls: 'application/vnd.ms-excel',
                        png: 'image/png',
                        jpg: 'image/jpeg',
                        jpeg: 'image/jpeg',
                        gif: 'image/gif',
                        tiff: 'image/tiff',
                    };
                    const contentType = contentTypeMap[ext] || 'application/octet-stream';

                    // 5. Upload to Supabase Storage
                    const { error: uploadError } = await supabaseAdmin.storage
                        .from(BUCKET)
                        .upload(safeName, Buffer.from(buffer), { contentType, upsert: true });

                    if (uploadError) {
                        console.warn(`Upload failed for ${fileName} (factura ${factura.ID}):`, uploadError.message);
                        continue;
                    }

                    // 6. Get public URL
                    const { data: publicUrlData } = supabaseAdmin.storage
                        .from(BUCKET)
                        .getPublicUrl(safeName);

                    uploadedUrls.push(publicUrlData.publicUrl);
                }

                if (uploadedUrls.length === 0) {
                    skipped++;
                    continue;
                }

                // 7. Save URL(s) in documentos column
                const docValue = uploadedUrls.length === 1
                    ? uploadedUrls[0]
                    : JSON.stringify(uploadedUrls);

                const { error: updateError } = await supabaseAdmin
                    .from('Registro_Facturas')
                    .update({ documentos: docValue })
                    .eq('ID', factura.ID);

                if (updateError) {
                    console.warn(`DB update failed for factura ${factura.ID}:`, updateError.message);
                    continue;
                }

                results.push({ id: factura.ID, urls: uploadedUrls });
                processed++;

            } catch (itemError: any) {
                console.warn(`Error processing factura ${factura.ID}:`, itemError.message);
                skipped++;
            }
        }

        return NextResponse.json({
            success: true,
            message: `Adjuntos sincronizados: ${processed} procesadas, ${skipped} omitidas.`,
            processed,
            skipped,
            total: facturas.length,
            results,
        });

    } catch (error: any) {
        console.error('Sync attachments error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
