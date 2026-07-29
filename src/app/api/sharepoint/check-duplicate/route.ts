
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const nit = searchParams.get('nit');
        const nroFactura = searchParams.get('nroFactura');

        if (!nit || !nroFactura) {
            return NextResponse.json({ exists: false });
        }

        const normalizedNit = nit.replace(/[^0-9]/g, '');
        const normalizedNro = nroFactura.trim().toUpperCase();

        // Traemos candidatos por coincidencia parcial (ilike) y comparamos exacto
        // ya normalizado en JS: la comparacion exacta contra SharePoint fallaba
        // con espacios sueltos o NIT con/sin digito de verificacion.
        const { data: candidates, error } = await supabaseAdmin
            .from('Registro_Facturas')
            .select('ID, Nit, Nro_Factura')
            .ilike('Nro_Factura', `%${normalizedNro}%`);

        if (error) throw error;

        const exists = (candidates || []).some(c =>
            (c.Nro_Factura || '').trim().toUpperCase() === normalizedNro &&
            (c.Nit || '').replace(/[^0-9]/g, '') === normalizedNit
        );

        return NextResponse.json({
            exists,
            message: exists ? `La factura ${nroFactura} ya está registrada para este proveedor.` : null
        });

    } catch (error: any) {
        console.error('Error checking duplicate:', error);
        return NextResponse.json({ exists: false, error: error.message }, { status: 500 });
    }
}
