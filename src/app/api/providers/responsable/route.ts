import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: NextRequest) {
    const supabaseUrl = process.env.SERVICIOS_SUPABASE_URL;
    const supabaseKey = process.env.SERVICIOS_SUPABASE_KEY;

    if (!supabaseUrl || !supabaseKey) {
        console.error("Missing SERVICIOS_SUPABASE_URL or SERVICIOS_SUPABASE_KEY");
        return NextResponse.json({ error: "Configuración de Supabase faltante" }, { status: 500 });
    }

    // Connect to the "Servicios y comercial" Supabase project where Proveedores_con_Responsable lives
    const supabaseServicios = createClient(supabaseUrl, supabaseKey);

    const { searchParams } = new URL(req.url);
    const nit = searchParams.get("nit");

    if (!nit) {
        return NextResponse.json({ error: "NIT requerido" }, { status: 400 });
    }

    try {
        // Search by NIT - the NIT in the table may include the check digit (e.g. "830051440-7")
        // so we search with both exact match and prefix match
        const { data, error } = await supabaseServicios
            .from("Proveedores_con_Responsable")
            .select('"Nit", "Nombre de socio de negocios", "Responsable", "Autorizador", "Correo"')
            .or(`Nit.eq.${nit},Nit.like.${nit}%,Nit.like.${nit}-%`)
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
