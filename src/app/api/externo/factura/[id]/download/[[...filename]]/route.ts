import { NextRequest, NextResponse } from 'next/server';
import { getGraphClient, findExternalInvoiceDocument, getSharePointInvoiceById } from '@/lib/sharepoint';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (serviceKey && serviceKey !== 'REEMPLAZAR_CON_TU_SERVICE_ROLE_KEY') ? serviceKey : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// In-memory cache for recent downloads (5 min TTL) to avoid repeated SharePoint / Graph API calls
interface CachedFile {
    buffer: ArrayBuffer;
    fileName: string;
    mimeType: string;
    timestamp: number;
}
const fileBufferCache = new Map<string, CachedFile>();
const CACHE_TTL_MS = 5 * 60 * 1000;

function detectFileTypeAndMime(buffer: ArrayBuffer, hints: (string | undefined | null)[]): { ext: string; mimeType: string } {
    const bytes = new Uint8Array(buffer.slice(0, 8));
    const hintStr = hints.filter(Boolean).join(' ').toLowerCase();

    // Check magic bytes
    // PDF: %PDF- (0x25, 0x50, 0x44, 0x46)
    if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
        return { ext: 'pdf', mimeType: 'application/pdf' };
    }

    // Excel 97-2003 (.xls): D0 CF 11 E0 A1 B1 1A E1
    if (bytes[0] === 0xD0 && bytes[1] === 0xCF && bytes[2] === 0x11 && bytes[3] === 0xE0) {
        return { ext: 'xls', mimeType: 'application/vnd.ms-excel' };
    }

    // ZIP archive (.xlsx, .docx, .zip): PK\x03\x04 (0x50, 0x4B, 0x03, 0x04)
    if (bytes[0] === 0x50 && bytes[1] === 0x4B && bytes[2] === 0x03 && bytes[3] === 0x04) {
        if (hintStr.includes('.docx')) {
            return { ext: 'docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
        }
        // Default to xlsx for spreadsheets or if hint includes xlsx
        return { ext: 'xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
    }

    // PNG: 89 50 4E 47
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
        return { ext: 'png', mimeType: 'image/png' };
    }

    // JPEG: FF D8 FF
    if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
        return { ext: 'jpg', mimeType: 'image/jpeg' };
    }

    // Fallback using hints
    if (hintStr.includes('.xlsx')) {
        return { ext: 'xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
    }
    if (hintStr.includes('.xls')) {
        return { ext: 'xls', mimeType: 'application/vnd.ms-excel' };
    }
    if (hintStr.includes('.csv')) {
        return { ext: 'csv', mimeType: 'text/csv' };
    }
    if (hintStr.includes('.png')) {
        return { ext: 'png', mimeType: 'image/png' };
    }
    if (hintStr.includes('.jpg') || hintStr.includes('.jpeg')) {
        return { ext: 'jpg', mimeType: 'image/jpeg' };
    }
    if (hintStr.includes('.pdf')) {
        return { ext: 'pdf', mimeType: 'application/pdf' };
    }

    return { ext: 'pdf', mimeType: 'application/pdf' };
}

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: itemId } = await params;
        const { searchParams } = new URL(req.url);
        const requestFileName = searchParams.get('rawFile') || searchParams.get('file');

        if (!itemId) {
            return NextResponse.json({ error: 'Missing itemId' }, { status: 400 });
        }

        // 0. Check memory cache first
        const cacheKey = `file_${itemId}_${requestFileName || 'default'}`;
        const cached = fileBufferCache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp) < CACHE_TTL_MS) {
            const isDownload = searchParams.get('download') === 'true';
            const dispositionType = isDownload ? 'attachment' : 'inline';
            const encodedFileName = encodeURIComponent(cached.fileName);
            return new NextResponse(cached.buffer, {
                headers: {
                    'Content-Type': cached.mimeType || 'application/octet-stream',
                    'Content-Disposition': `${dispositionType}; filename="${cached.fileName.replace(/["\\]/g, '')}"; filename*=UTF-8''${encodedFileName}`,
                    'Cache-Control': 'public, max-age=600, stale-while-revalidate=86400',
                },
            });
        }

        // 1. FAST-PATH: Query Supabase metadata first (takes ~5-15ms vs 800ms Graph API)
        let invoiceDetails: any = null;
        try {
            const { data: dbInvoice } = await supabase
                .from('Registro_Facturas')
                .select('ID, Nit, Proveedor, Nro_Factura, Consecutivo, fp, documentos, adjuntos_url')
                .or(`ID.eq.${isNaN(Number(itemId)) ? 0 : itemId},sharepoint_id.eq.${itemId}`)
                .maybeSingle();
            
            if (dbInvoice) {
                invoiceDetails = dbInvoice;
            }
        } catch (dbErr) {
            console.warn('[Direct Download] Error reading from Supabase, falling back to SharePoint API:', dbErr);
        }

        // If not in Supabase, fallback to SharePoint API
        if (!invoiceDetails) {
            invoiceDetails = await getSharePointInvoiceById(itemId);
        }
        
        const nitValue = invoiceDetails.Nit || invoiceDetails.Title || invoiceDetails.Nit_x0020_ || invoiceDetails["Nit "] || "N/A";
        const nroFactura = invoiceDetails.Nro_Factura;
        const consecutivo = invoiceDetails.Consecutivo || "";
        const proveedor = invoiceDetails.Proveedor || "";
        const nroFacturaStr = invoiceDetails.Nro_Factura || "";
        
        let customFileName = `RAD ${consecutivo} ${proveedor} ${nroFacturaStr}`.replace(/\s+/g, ' ').trim();
        let fileBuffer: ArrayBuffer | null = null;

        // 2. Direct storage URL (Supabase Storage) - Super fast (~30ms)
        let directUrl = invoiceDetails.fp || invoiceDetails.documentos;
        if (!directUrl && invoiceDetails.adjuntos_url) {
            try {
                const adj = typeof invoiceDetails.adjuntos_url === 'string'
                    ? JSON.parse(invoiceDetails.adjuntos_url)
                    : invoiceDetails.adjuntos_url;
                if (Array.isArray(adj) && adj.length > 0) {
                    directUrl = adj[0].url || adj[0].serverRelativeUrl;
                }
            } catch {}
        }

        if (typeof directUrl === 'string' && /^https?:\/\//i.test(directUrl) && !directUrl.includes('sharepoint.com')) {
            console.log(`[Direct Download] Fetching from direct storage URL for item ${itemId}...`);
            try {
                const directRes = await fetch(directUrl);
                if (directRes.ok) {
                    fileBuffer = await directRes.arrayBuffer();
                    console.log(`[Direct Download] Successfully fetched file from direct storage URL`);
                }
            } catch (directErr) {
                console.error(`[Direct Download] Failed to fetch from direct storage URL:`, directErr);
            }
        }

        // 3. Try ITPowerApps / Graph API if not already fetched
        let externalFileName = '';
        if (!fileBuffer && nroFactura && nitValue !== 'N/A') {
            console.log(`[Direct Download] Searching for ${nroFactura} in ITPowerApps...`);
            const externalDoc = await findExternalInvoiceDocument(nitValue, nroFactura, "");
            
            if (externalDoc) {
                externalFileName = externalDoc.fileName || '';
                console.log(`[Direct Download] Found external doc: ${externalFileName}. Fetching content...`);
                try {
                    // Prefer the direct download URL (avoids extra Graph API round-trip)
                    if (externalDoc.downloadUrl) {
                        const dlRes = await fetch(externalDoc.downloadUrl);
                        if (dlRes.ok) {
                            fileBuffer = await dlRes.arrayBuffer();
                        }
                    }
                    // Fallback to Graph API content endpoint
                    if (!fileBuffer) {
                        const client = await getGraphClient();
                        const response = await client.api(`/drives/${externalDoc.driveId}/items/${externalDoc.id}/content`).get();
                        if (response) {
                            fileBuffer = response;
                        }
                    }
                    if (fileBuffer) {
                        console.log(`[Direct Download] Successfully fetched ${externalDoc.fileName} from ITPowerApps`);
                    }
                } catch (extErr) {
                    console.error(`[Direct Download] Failed to fetch content from ITPowerApps:`, extErr);
                }
            }
        }

        // 4. Fallback to FPKContabilidad Attachments
        if (!fileBuffer && requestFileName && requestFileName !== 'Ver en SharePoint') {
            console.log(`[Direct Download] Falling back to FPKContabilidad attachments for ${requestFileName}...`);
            try {
                const client = await getGraphClient();
                const siteResponse = await client.api('/sites/firplaksa.sharepoint.com:/sites/FPKContabilidad').get();
                const siteId = siteResponse.id;
                const listsResponse = await client.api(`/sites/${siteId}/lists`).get();
                const list = listsResponse.value.find((l: any) => l.name === 'Registro_de_Facturas' || l.displayName === 'Registro_de_Facturas');
                
                if (list) {
                    const attResponse = await client.api(`/sites/${siteId}/lists/${list.id}/items/${itemId}/attachments/${requestFileName}/$value`).get();
                    if (attResponse) {
                        fileBuffer = attResponse;
                        console.log(`[Direct Download] Successfully fetched attachment from FPKContabilidad`);
                    }
                }
            } catch (attErr) {
                console.warn(`[Direct Download] Failed to fetch attachment from FPKContabilidad:`, attErr);
            }
        }

        if (!fileBuffer) {
            console.warn(`[Direct Download] Archivo no encontrado para item ${itemId} tras todos los intentos.`);
            return NextResponse.json({ error: 'No se ha encontrado el archivo de la factura' }, { status: 404 });
        }

        // Detect dynamic file type and MIME type
        const detected = detectFileTypeAndMime(fileBuffer, [requestFileName, directUrl, externalFileName]);
        const baseName = customFileName.includes('.') ? customFileName.replace(/\.[^/.]+$/, '') : customFileName;
        const finalFileName = `${baseName || 'Factura'}.${detected.ext}`;

        // Store in memory cache (cleanup if cache grows large)
        if (fileBufferCache.size > 50) {
            const oldestKey = fileBufferCache.keys().next().value;
            if (oldestKey) fileBufferCache.delete(oldestKey);
        }
        fileBufferCache.set(cacheKey, {
            buffer: fileBuffer,
            fileName: finalFileName,
            mimeType: detected.mimeType,
            timestamp: Date.now()
        });

        // 5. Serve the file
        const isDownload = req.nextUrl.searchParams.get('download') === 'true';
        const dispositionType = isDownload ? 'attachment' : 'inline';
        const encodedFileName = encodeURIComponent(finalFileName);
        return new NextResponse(fileBuffer, {
            headers: {
                'Content-Type': detected.mimeType,
                'Content-Disposition': `${dispositionType}; filename="${finalFileName.replace(/["\\]/g, '')}"; filename*=UTF-8''${encodedFileName}`,
                'Cache-Control': 'public, max-age=600, stale-while-revalidate=86400',
            },
        });

    } catch (error: any) {
        console.error('Error in direct download:', error);
        return NextResponse.json({ error: error.message || 'Error al procesar la descarga' }, { status: 500 });
    }
}
