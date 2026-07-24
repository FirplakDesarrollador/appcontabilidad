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

        // 3. Build filename: RAD (numero de consecutivo) (nombre del proveedor) (numero de factura)
        const consecutivo = radicado.Consecutivo || "";
        const proveedor = radicado.Proveedor || "";
        const nroFactura = radicado.Nro_Factura || "";
        
        let finalFileName = `RAD ${consecutivo} ${proveedor} ${nroFactura}`.replace(/\s+/g, ' ').trim();
        if (!finalFileName.toLowerCase().endsWith('.pdf')) {
            finalFileName = `${finalFileName}.pdf`;
        }

        const isDownload = req.nextUrl.searchParams.get('download') === 'true';
        const dispositionType = isDownload ? 'attachment' : 'inline';
        const encodedFileName = encodeURIComponent(finalFileName);

        // 4. Return as attachment
        return new NextResponse(fileBuffer, {
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `${dispositionType}; filename="${finalFileName.replace(/["\\]/g, '')}"; filename*=UTF-8''${encodedFileName}`,
                'Cache-Control': 'no-store',
            },
        });

    } catch (error: any) {
        console.error('Error in radicado download:', error);
        return NextResponse.json({ error: error.message || 'Error al procesar la descarga' }, { status: 500 });
    }
}
