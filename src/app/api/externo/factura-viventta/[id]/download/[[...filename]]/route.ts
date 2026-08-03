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

        // Fetch the invoice from Supabase to get the PDF URL
        const { data: invoice, error } = await supabase
            .from('Facturas_Viventta')
            .select('id, Nro_Factura, Proveedor, Consecutivo, documentos, fp')
            .eq('id', itemId)
            .single();

        if (error || !invoice) {
            return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 });
        }

        const pdfUrl = invoice.documentos || invoice.fp;

        if (!pdfUrl) {
            return NextResponse.json({ error: 'No se ha encontrado factura en PDF' }, { status: 404 });
        }

        // Fetch the PDF / file from Supabase Storage (public URL)
        const fileResponse = await fetch(pdfUrl);

        if (!fileResponse.ok) {
            return NextResponse.json({ error: 'No se pudo obtener el archivo adjunto' }, { status: 404 });
        }

        const fileBuffer = await fileResponse.arrayBuffer();

        // Detect extension from the storage URL or Content-Type
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

        // Build a nice display filename
        const consecutivo = invoice.Consecutivo || '';
        const proveedor = (invoice.Proveedor || '').replace(/[<>:"/\\|?*]/g, '').trim();
        const nroFactura = (invoice.Nro_Factura || '').replace(/[<>:"/\\|?*]/g, '').trim();
        let baseName = `RAD ${consecutivo} ${proveedor} ${nroFactura}`.replace(/\s+/g, ' ').trim();
        if (!baseName) baseName = `Factura_${itemId}`;
        const finalFileName = `${baseName}.${ext}`;

        const { searchParams } = new URL(req.url);
        const isDownload = searchParams.get('download') === 'true';
        const dispositionType = (isDownload || !canViewInline) ? 'attachment' : 'inline';
        const encodedFileName = encodeURIComponent(finalFileName);

        return new NextResponse(fileBuffer, {
            headers: {
                'Content-Type': contentType,
                'Content-Disposition': `${dispositionType}; filename="${finalFileName.replace(/["\\]/g, '')}"; filename*=UTF-8''${encodedFileName}`,
                'Cache-Control': 'public, max-age=300',
            },
        });

    } catch (error: any) {
        console.error('Error in Viventta download:', error);
        return NextResponse.json({ error: error.message || 'Error al procesar la descarga' }, { status: 500 });
    }
}

