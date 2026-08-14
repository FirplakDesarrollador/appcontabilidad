import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const {
            ids,
            responsable,
            autorizador,
            correo,
            source = "firplak",
            user_email
        } = body;

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return NextResponse.json({ error: "Lista de IDs inválida o vacía" }, { status: 400 });
        }

        if (!responsable) {
            return NextResponse.json({ error: "Debe especificar un responsable" }, { status: 400 });
        }

        const now = new Date();
        const formattedDate = `${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear()} ${now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;

        if (source === "viventta") {
            const { error } = await supabaseAdmin
                .from("Proveedores_Viventta")
                .update({
                    "Responsables": responsable.trim()
                })
                .in("ID", ids);

            if (error) throw error;
            return NextResponse.json({ success: true, count: ids.length });
        }

        const updatePayload: any = {
            "Responsable": responsable.trim(),
            "Autorizador": autorizador?.trim() || responsable.trim(),
            "Modificado": formattedDate,
            "Modificado por": user_email || "Usuario del Sistema (Lote)"
        };

        if (correo) {
            updatePayload["Correo"] = correo.trim();
        }

        const { error } = await supabaseAdmin
            .from("Proveedores_con_Responsable")
            .update(updatePayload)
            .in("id", ids);

        if (error) throw error;

        return NextResponse.json({ success: true, count: ids.length });
    } catch (err: any) {
        console.error("Error in POST /api/proveedores-responsables/batch:", err);
        return NextResponse.json({ error: err.message || "Error al actualizar proveedores en lote" }, { status: 500 });
    }
}
