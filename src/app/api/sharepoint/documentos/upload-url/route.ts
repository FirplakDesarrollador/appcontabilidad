import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const BUCKET = 'documento_soporte';
const MAX_FILES = 15;

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

/**
 * Genera URLs de subida firmadas para que el navegador suba los archivos
 * DIRECTAMENTE a Supabase Storage. Así evitamos el límite de ~4.5 MB que
 * Vercel impone al cuerpo de las funciones serverless.
 */
export async function POST(req: NextRequest) {
    try {
        const { files } = await req.json();

        if (!Array.isArray(files) || files.length === 0 || files.length > MAX_FILES) {
            return NextResponse.json({ success: false, error: 'Lista de archivos inválida' }, { status: 400 });
        }

        const batchId = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        const uploads: { path: string; token: string; signedUrl: string; publicUrl: string }[] = [];

        for (let i = 0; i < files.length; i++) {
            const name = String(files[i]?.name || 'archivo');
            const ext = (name.split('.').pop() || 'pdf').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || 'pdf';
            const path = `${batchId}_${i}.${ext}`;

            const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUploadUrl(path);
            if (error || !data) {
                console.error('[Doc Soporte] Error creando URL firmada:', error?.message);
                return NextResponse.json({ success: false, error: 'No se pudo preparar la subida del archivo' }, { status: 500 });
            }

            const { data: urlData } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
            uploads.push({ path, token: data.token, signedUrl: data.signedUrl, publicUrl: urlData.publicUrl });
        }

        return NextResponse.json({ success: true, uploads });
    } catch (error: any) {
        console.error('[Doc Soporte] upload-url error:', error);
        return NextResponse.json({ success: false, error: error.message || 'Error desconocido' }, { status: 500 });
    }
}
