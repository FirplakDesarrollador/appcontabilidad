import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export const dynamic = 'force-dynamic';

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: itemId } = await params;

        if (!itemId) {
            return NextResponse.json({ error: 'Missing itemId' }, { status: 400 });
        }

        // 1. Fetch radicado from Supabase
        const { data: radicado, error } = await supabase
            .from('Radicados_de_importacion')
            .select('adjuntos_url, Consecutivo, Proveedor, Nro_Factura')
            .eq('id', itemId)
            .maybeSingle();

        if (error || !radicado) {
            return NextResponse.json({ error: 'Radicado no encontrado' }, { status: 404 });
        }

        const pdfUrl = radicado.adjuntos_url;

        if (!pdfUrl) {
            return NextResponse.json({ error: 'No se ha encontrado documento adjunto' }, { status: 404 });
        }

        // 2. Fetch the file from the public URL
        const fileResponse = await fetch(pdfUrl);
        if (!fileResponse.ok) {
            throw new Error(`Failed to fetch file from storage: ${fileResponse.statusText}`);
        }

        const fileBuffer = await fileResponse.arrayBuffer();

        // 3. Detect extension from the storage URL or Content-Type
        let ext = 'pdf';
        try {
            const urlPath = new URL(pdfUrl).pathname;
            const lastPart = urlPath.split('/').pop() || '';
            const match = lastPart.match(/\.([a-zA-Z0-9]+)(?:[?#]|$)/);
            if (match) {
                ext = match[1].toLowerCase();
            }
        } catch {
            const match = pdfUrl.match(/\.([a-zA-Z0-9]+)(?:[?#]|$)/);
            if (match) {
                ext = match[1].toLowerCase();
            }
        }

        const mimeTypes: Record<string, string> = {
            pdf: 'application/pdf',
            xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            xls: 'application/vnd.ms-excel',
            docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            doc: 'application/msword',
            xml: 'application/xml',
            zip: 'application/zip',
            rar: 'application/x-rar-compressed',
            '7z': 'application/x-7z-compressed',
            png: 'image/png',
            jpg: 'image/jpeg',
            jpeg: 'image/jpeg',
            txt: 'text/plain',
            csv: 'text/csv',
        };

        const contentType = mimeTypes[ext] || fileResponse.headers.get('content-type') || 'application/octet-stream';
        const canViewInline = ['pdf', 'png', 'jpg', 'jpeg', 'txt'].includes(ext);

        // 4. Build filename: RAD (numero de consecutivo) (nombre del proveedor) (numero de factura)
        const consecutivo = radicado.Consecutivo || "";
        const proveedor = (radicado.Proveedor || "").replace(/[<>:"/\\|?*]/g, '').trim();
        const nroFactura = (radicado.Nro_Factura || "").replace(/[<>:"/\\|?*]/g, '').trim();
        
        let baseName = `RAD ${consecutivo} ${proveedor} ${nroFactura}`.replace(/\s+/g, ' ').trim();
        if (!baseName) baseName = `RAD_${itemId}`;
        const finalFileName = `${baseName}.${ext}`;

        const isDownload = req.nextUrl.searchParams.get('download') === 'true';
        const dispositionType = (isDownload || !canViewInline) ? 'attachment' : 'inline';
        const encodedFileName = encodeURIComponent(finalFileName);

        // 5. Return file with proper headers
        return new NextResponse(fileBuffer, {
            headers: {
                'Content-Type': contentType,
                'Content-Disposition': `${dispositionType}; filename="${finalFileName.replace(/["\\]/g, '')}"; filename*=UTF-8''${encodedFileName}`,
                'Cache-Control': 'no-store',
            },
        });

    } catch (error: any) {
        console.error('Error in radicado download:', error);
        return NextResponse.json({ error: error.message || 'Error al procesar la descarga' }, { status: 500 });
    }
}

