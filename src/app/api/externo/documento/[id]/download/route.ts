import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export const dynamic = 'force-dynamic';

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: itemId } = await params;
        const { searchParams } = new URL(req.url);
        const requestFileName = searchParams.get('file');

        if (!itemId) {
            return NextResponse.json({ error: 'Missing itemId' }, { status: 400 });
        }

        const { data: dbDoc, error } = await supabase
            .from('Documento_Soporte')
            .select('pdf_url, adjunto, consecutivo, proveedor')
            .eq('id', Number(itemId))
            .maybeSingle();

        if (error || !dbDoc) {
            return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 });
        }

        const pdfUrl = dbDoc.pdf_url || dbDoc.adjunto;

        if (!pdfUrl) {
            return NextResponse.json({ error: 'No se ha encontrado documento en PDF' }, { status: 404 });
        }

        // Fetch the file from the public URL to return it as an attachment blob
        const fileResponse = await fetch(pdfUrl);
        if (!fileResponse.ok) {
            throw new Error(`Failed to fetch file from storage: ${fileResponse.statusText}`);
        }

        const fileBuffer = await fileResponse.arrayBuffer();

        let finalFileName = requestFileName || `documento_${dbDoc.consecutivo || itemId}.pdf`;
        
        if (dbDoc.proveedor) {
            const cleanProvider = dbDoc.proveedor.replace(/[<>:"/\\|?*]/g, '').trim();
            finalFileName = `RAD ${cleanProvider} DOC SOPORTE.pdf`;
        } else if (!finalFileName.toLowerCase().endsWith('.pdf')) {
            finalFileName = finalFileName.includes('.') 
                ? finalFileName.replace(/\.[^/.]+$/, ".pdf")
                : `${finalFileName}.pdf`;
        }

        const isDownload = searchParams.get('download') === 'true';
        const encodedFileName = encodeURIComponent(finalFileName);

        return new NextResponse(fileBuffer, {
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `${isDownload ? 'attachment' : 'inline'}; filename="${finalFileName.replace(/["\\]/g, '')}"; filename*=UTF-8''${encodedFileName}`,
                'Cache-Control': 'no-store',
            },
        });

    } catch (error: any) {
        console.error('Error in document download:', error);
        return NextResponse.json({ error: error.message || 'Error al procesar la descarga' }, { status: 500 });
    }
}
