import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const nit = searchParams.get("nit");

    if (!nit) {
        return NextResponse.json({ error: "NIT requerido" }, { status: 400 });
    }

    try {
        // Extract base NIT without the check digit
        const baseNit = nit.includes('-') ? nit.split('-')[0] : nit;

        // Search by NIT - the NIT in the table may include the check digit (e.g. "830051440-7")
        // or just the base. We search with exact match and prefix match using the base NIT
        const { data, error } = await supabase
            .from("Proveedores_con_Responsable")
            .select('"Nit", "Nombre de socio de negocios", "Responsable", "Autorizador", "Correo"')
            .or(`Nit.eq.${nit},Nit.eq.${baseNit},Nit.like.${baseNit}-%,Nit.like.${baseNit}%`)
            .limit(1);

        if (error) {
            console.error("Error querying Proveedores_con_Responsable:", error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        if (!data || data.length === 0) {
            return NextResponse.json({ found: false });
        }

        const row = data[0];
        return NextResponse.json({
            found: true,
            responsable: row.Responsable || row.Autorizador || "",
            correo: row.Correo || "",
            proveedor: row["Nombre de socio de negocios"] || ""
        });
    } catch (err: any) {
        console.error("Error in responsable lookup:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
