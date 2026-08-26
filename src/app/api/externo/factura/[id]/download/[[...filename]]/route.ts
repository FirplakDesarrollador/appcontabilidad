import { NextRequest, NextResponse } from 'next/server';
import { getGraphClient, findExternalInvoiceDocument, getSharePointInvoiceById } from '@/lib/sharepoint';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (serviceKey && serviceKey !== 'REEMPLAZAR_CON_TU_SERVICE_ROLE_KEY') ? serviceKey : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// In-memory cache for recent PDF downloads (5 min TTL) to avoid repeated SharePoint / Graph API calls
interface CachedFile {
    buffer: ArrayBuffer;
    fileName: string;
    timestamp: number;
}
const pdfBufferCache = new Map<string, CachedFile>();
const CACHE_TTL_MS = 5 * 60 * 1000;

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
        const cacheKey = `pdf_${itemId}_${requestFileName || 'default'}`;
        const cached = pdfBufferCache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp) < CACHE_TTL_MS) {
            const isDownload = searchParams.get('download') === 'true';
            const dispositionType = isDownload ? 'attachment' : 'inline';
            const encodedFileName = encodeURIComponent(cached.fileName);
            return new NextResponse(cached.buffer, {
                headers: {
                    'Content-Type': 'application/pdf',
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
                .select('ID, Nit, Proveedor, Nro_Factura, Consecutivo, fp, documentos')
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
        let finalFileName = `${customFileName}.pdf`;

        // 2. Direct storage URL (Supabase Storage) - Super fast (~30ms)
        const directUrl = invoiceDetails.fp || invoiceDetails.documentos;
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
        if (!fileBuffer && nroFactura && nitValue !== 'N/A') {
            console.log(`[Direct Download] Searching for ${nroFactura} in ITPowerApps...`);
            const client = await getGraphClient();
            const externalDoc = await findExternalInvoiceDocument(nitValue, nroFactura, "");
            
            if (externalDoc) {
                console.log(`[Direct Download] Found external doc: ${externalDoc.fileName}. Fetching content...`);
                try {
                    const response = await client.api(`/drives/${externalDoc.driveId}/items/${externalDoc.id}/content`).get();
                    if (response) {
                        fileBuffer = response;
                        console.log(`[Direct Download] Successfully fetched ${externalDoc.fileName} from ITPowerApps, outputting as ${finalFileName}`);
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
            console.warn(`[Direct Download] PDF not found for item ${itemId} after all attempts.`);
            return NextResponse.json({ error: 'No se ha encontrado factura en PDF' }, { status: 404 });
        }

        // Ensure PDF extension if missing
        if (!finalFileName.toLowerCase().endsWith('.pdf')) {
            finalFileName = finalFileName.includes('.') 
                ? finalFileName.replace(/\.[^/.]+$/, ".pdf")
                : `${finalFileName}.pdf`;
        }

        // Store in memory cache (cleanup if cache grows large)
        if (pdfBufferCache.size > 50) {
            const oldestKey = pdfBufferCache.keys().next().value;
            if (oldestKey) pdfBufferCache.delete(oldestKey);
        }
        pdfBufferCache.set(cacheKey, {
            buffer: fileBuffer,
            fileName: finalFileName,
            timestamp: Date.now()
        });

        // 5. Serve the file
        const isDownload = req.nextUrl.searchParams.get('download') === 'true';
        const dispositionType = isDownload ? 'attachment' : 'inline';
        const encodedFileName = encodeURIComponent(finalFileName);
        return new NextResponse(fileBuffer, {
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `${dispositionType}; filename="${finalFileName.replace(/["\\]/g, '')}"; filename*=UTF-8''${encodedFileName}`,
                'Cache-Control': 'public, max-age=600, stale-while-revalidate=86400',
            },
        });

    } catch (error: any) {
        console.error('Error in direct download:', error);
        return NextResponse.json({ error: error.message || 'Error al procesar la descarga' }, { status: 500 });
    }
}
