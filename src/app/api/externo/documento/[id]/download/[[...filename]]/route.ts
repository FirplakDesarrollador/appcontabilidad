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
        const anexoIndex = searchParams.get('anexoIndex');

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

        let fileUrl = dbDoc.pdf_url || dbDoc.adjunto;
        let originalAnexoName = '';

        if (anexoIndex !== null) {
            const index = parseInt(anexoIndex, 10);
            if (dbDoc.adjunto) {
                try {
                    const anexos = JSON.parse(dbDoc.adjunto);
                    if (Array.isArray(anexos) && anexos[index]) {
                        fileUrl = anexos[index].url;
                        originalAnexoName = anexos[index].name || `Anexo_${index + 1}`;
                    } else {
                        return NextResponse.json({ error: 'Anexo no encontrado en el índice proporcionado' }, { status: 404 });
                    }
                } catch (e) {
                    // Si falla el parseo, tal vez sea un solo adjunto (legacy)
                    if (index === 0 && dbDoc.adjunto !== dbDoc.pdf_url) {
                        fileUrl = dbDoc.adjunto;
                        originalAnexoName = 'Anexo_Adicional';
                    } else {
                        return NextResponse.json({ error: 'Anexo no encontrado' }, { status: 404 });
                    }
                }
            } else {
                return NextResponse.json({ error: 'El documento no tiene anexos' }, { status: 404 });
            }
        }

        if (!fileUrl) {
            return NextResponse.json({ error: 'No se ha encontrado documento' }, { status: 404 });
        }

        // Fetch the file from the public URL to return it as an attachment blob
        const fileResponse = await fetch(fileUrl);
        if (!fileResponse.ok) {
            throw new Error(`Failed to fetch file from storage: ${fileResponse.statusText}`);
        }

        const fileBuffer = await fileResponse.arrayBuffer();

        let finalFileName = requestFileName || `documento_${dbDoc.consecutivo || itemId}.pdf`;
        
        if (dbDoc.proveedor) {
            const cleanProvider = dbDoc.proveedor.replace(/[<>:"/\\|?*]/g, '').trim();
            if (anexoIndex !== null) {
                finalFileName = `RAD ${cleanProvider} DOC SOPORTE - ${originalAnexoName}`;
            } else {
                finalFileName = `RAD ${cleanProvider} DOC SOPORTE.pdf`;
            }
        } else if (anexoIndex !== null) {
            finalFileName = `documento_${dbDoc.consecutivo || itemId} - ${originalAnexoName}`;
        }
        
        if (!finalFileName.toLowerCase().endsWith('.pdf') && !finalFileName.includes('.')) {
            finalFileName = `${finalFileName}.pdf`;
        }

        const isDownload = searchParams.get('download') === 'true';
        const encodedFileName = encodeURIComponent(finalFileName);
        const dispositionType = isDownload ? 'attachment' : 'inline';
        
        let contentType = 'application/pdf';
        const ext = finalFileName.split('.').pop()?.toLowerCase();
        if (ext === 'xml') contentType = 'application/xml';
        else if (ext === 'zip') contentType = 'application/zip';
        else if (ext === 'jpg' || ext === 'jpeg') contentType = 'image/jpeg';
        else if (ext === 'png') contentType = 'image/png';
        else if (ext === 'xlsx') contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

        return new NextResponse(fileBuffer, {
            headers: {
                'Content-Type': contentType,
                'Content-Disposition': `${dispositionType}; filename="${finalFileName.replace(/["\\]/g, '')}"; filename*=UTF-8''${encodedFileName}`,
                'Cache-Control': 'no-store',
            },
        });

    } catch (error: any) {
        console.error('Error in document download:', error);
        return NextResponse.json({ error: error.message || 'Error al procesar la descarga' }, { status: 500 });
    }
}
