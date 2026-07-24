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

        // Build a nice display filename
        const consecutivo = invoice.Consecutivo || '';
        const proveedor = invoice.Proveedor || '';
        const nroFactura = invoice.Nro_Factura || '';
        let finalFileName = `RAD ${consecutivo} ${proveedor} ${nroFactura}`.replace(/\s+/g, ' ').trim();
        if (!finalFileName.toLowerCase().endsWith('.pdf')) {
            finalFileName = `${finalFileName}.pdf`;
        }

        // Fetch the PDF from Supabase Storage (public URL)
        const pdfResponse = await fetch(pdfUrl);

        if (!pdfResponse.ok) {
            return NextResponse.json({ error: 'No se pudo obtener el archivo PDF' }, { status: 404 });
        }

        const fileBuffer = await pdfResponse.arrayBuffer();

        const encodedFileName = encodeURIComponent(finalFileName);
        return new NextResponse(fileBuffer, {
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `inline; filename="${finalFileName.replace(/["\\]/g, '')}"; filename*=UTF-8''${encodedFileName}`,
                'Cache-Control': 'public, max-age=300',
            },
        });

    } catch (error: any) {
        console.error('Error in Viventta download:', error);
        return NextResponse.json({ error: error.message || 'Error al procesar la descarga' }, { status: 500 });
    }
}
