import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { itemId, userName, userEmail } = body;

        if (!itemId || !userName) {
            return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 });
        }

        const { error } = await supabase
            .from('Facturas_Viventta')
            .update({
                Responsable_de_Autorizar: userName,
                Responsable_email: userEmail || ''
            })
            .eq('id', itemId);

        if (error) {
            throw error;
        }

        // Auto-registrar proveedor en Proveedores_Viventta si no existe
        try {
            const { data: itemData } = await supabase
                .from('Facturas_Viventta')
                .select('Nit, Proveedor')
                .eq('id', itemId)
                .single();

            if (itemData && itemData.Nit) {
                const baseNit = itemData.Nit.includes('-') ? itemData.Nit.split('-')[0] : itemData.Nit;
                const { data: existingProvider, error: lookupError } = await supabase
                    .from("Proveedores_Viventta")
                    .select('"Nit"')
                    .like("Nit", `${baseNit}%`)
                    .limit(1);

                if (!lookupError && (!existingProvider || existingProvider.length === 0)) {
                    await supabase.from("Proveedores_Viventta").insert({
                        "Nit": itemData.Nit,
                        "Nombre de socio de negocios": itemData.Proveedor || "Proveedor Desconocido",
                        "Responsable": userName,
                        "Autorizador": userName,
                        "Correo": userEmail,
                        "Creado": new Date().toISOString()
                    });
                    console.log(`[Supabase Viventta] Auto-registrado nuevo proveedor con responsable: ${itemData.Nit} - ${userName}`);
                }
            }
        } catch (providerErr) {
            console.error("[Supabase Viventta] Error registrando Proveedor_Viventta automáticamente:", providerErr);
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Error in facturas-viventta/update-responsible:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
