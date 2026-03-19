import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET() {
    try {
        const BUCKET = 'Facturas';
        
        const { data: rootItems } = await supabaseAdmin.storage.from(BUCKET).list('', {
            limit: 50,
            sortBy: { column: 'name', order: 'desc' }
        });

        if (!rootItems || rootItems.length === 0) {
            return new Response('El bucket está vacío. La migración no ha subido nada todavía.', { status: 404 });
        }

        let filePath = null;
        let finalFileName = 'Factura.pdf';

        for (const item of rootItems) {
            if (item.id === null) { // Es una carpeta
                const { data: files } = await supabaseAdmin.storage.from(BUCKET).list(item.name);
                const pdf = files?.find(f => f.name.toLowerCase().endsWith('.pdf'));
                if (pdf) {
                    filePath = `${item.name}/${pdf.name}`;
                    finalFileName = pdf.name;
                    break;
                }
            } else if (item.name.toLowerCase().endsWith('.pdf')) {
                filePath = item.name;
                finalFileName = item.name;
                break;
            }
        }

        if (!filePath) {
            const folderNames = rootItems.map(i => i.name).join(', ');
            return new Response(`No se encontró ningún PDF. Items en root: ${folderNames}`, { status: 404 });
        }

        const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(filePath);
        if (error) throw error;

        // Use Uint8Array to be safe with NextResponse
        const buffer = await data.arrayBuffer();
        const response = new NextResponse(new Uint8Array(buffer));
        response.headers.set('Content-Type', 'application/pdf');
        response.headers.set('Content-Disposition', `attachment; filename="${finalFileName}"`);

        return response;

    } catch (error: any) {
        return new Response('Error: ' + error.message, { status: 500 });
    }
}
