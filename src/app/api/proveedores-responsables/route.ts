import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const search = searchParams.get("search")?.trim() || "";
        const status = searchParams.get("status") || "all"; // 'all' | 'with_responsible' | 'without_responsible'
        const source = searchParams.get("source") || "firplak"; // 'firplak' | 'viventta'
        const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
        const pageSizeParam = searchParams.get("pageSize") || "25";
        const isExportAll = pageSizeParam === "all";
        const pageSize = isExportAll ? 5000 : Math.min(100, Math.max(1, parseInt(pageSizeParam, 10)));
        const sortBy = searchParams.get("sortBy") || "Nombre de socio de negocios";
        const sortOrder = searchParams.get("sortOrder") === "desc" ? false : true;

        if (source === "viventta") {
            let query = supabaseAdmin
                .from("Proveedores_Viventta")
                .select('*', { count: 'exact' });

            if (search) {
                query = query.or(`"BP Name".ilike.%${search}%,"BP Code".ilike.%${search}%,"Responsables".ilike.%${search}%`);
            }

            if (status === "with_responsible") {
                query = query.not("Responsables", "is", null).neq("Responsables", "");
            } else if (status === "without_responsible") {
                query = query.or('Responsables.is.null,Responsables.eq.""');
            }

            const sortCol = sortBy === "razon_social" || sortBy === "Nombre de socio de negocios" 
                ? "BP Name" 
                : sortBy === "nit" 
                ? "BP Code" 
                : sortBy === "responsable" 
                ? "Responsables" 
                : "ID";

            query = query.order(sortCol, { ascending: sortOrder });

            const from = (page - 1) * pageSize;
            const to = from + pageSize - 1;
            const { data, count, error } = await query.range(from, to);

            if (error) throw error;

            const normalizedItems = (data || []).map((row: any) => ({
                id: row.ID,
                source: 'viventta',
                nit: row['BP Code'] || '',
                codigo_sn: row['BP Code'] || '',
                razon_social: row['BP Name'] || '',
                responsable: row['Responsables'] || '',
                autorizador: row['Responsables'] || '',
                correo: '',
                telefono: '',
                notificar: 'False',
                modificado: null,
                modificado_por: null,
                creado: null
            }));

            // Calculate quick global stats
            const [totalRes, withRes, totalVivRes] = await Promise.all([
                supabaseAdmin.from("Proveedores_con_Responsable").select('*', { count: 'exact', head: true }),
                supabaseAdmin.from("Proveedores_con_Responsable").select('*', { count: 'exact', head: true }).not("Responsable", "is", null).neq("Responsable", ""),
                supabaseAdmin.from("Proveedores_Viventta").select('*', { count: 'exact', head: true })
            ]);

            const totalFirplak = totalRes.count || 0;
            const withResp = withRes.count || 0;
            const withoutResp = Math.max(0, totalFirplak - withResp);
            const totalViventta = totalVivRes.count || 0;

            return NextResponse.json({
                items: normalizedItems,
                total: count || 0,
                page,
                pageSize,
                totalPages: Math.ceil((count || 0) / pageSize),
                stats: {
                    totalFirplak,
                    withResponsibleFirplak: withResp,
                    withoutResponsibleFirplak: withoutResp,
                    totalViventta
                }
            });
        }

        // Default: Firplak (Proveedores_con_Responsable)
        let query = supabaseAdmin
            .from("Proveedores_con_Responsable")
            .select('*', { count: 'exact' });

        if (search) {
            query = query.or(
                `"Nit".ilike.%${search}%,"Nombre de socio de negocios".ilike.%${search}%,"Responsable".ilike.%${search}%,"Autorizador".ilike.%${search}%,"Correo".ilike.%${search}%,"Código SN".ilike.%${search}%`
            );
        }

        if (status === "with_responsible") {
            query = query.not("Responsable", "is", null).neq("Responsable", "");
        } else if (status === "without_responsible") {
            query = query.or('Responsable.is.null,Responsable.eq.""');
        }

        // Map sort column
        let sortCol = "Nombre de socio de negocios";
        if (sortBy === "nit" || sortBy === "Nit") sortCol = "Nit";
        else if (sortBy === "codigo_sn" || sortBy === "Código SN") sortCol = "Código SN";
        else if (sortBy === "responsable" || sortBy === "Responsable") sortCol = "Responsable";
        else if (sortBy === "autorizador" || sortBy === "Autorizador") sortCol = "Autorizador";
        else if (sortBy === "correo" || sortBy === "Correo") sortCol = "Correo";
        else if (sortBy === "id") sortCol = "id";

        query = query.order(sortCol, { ascending: sortOrder });

        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;
        const { data, count, error } = await query.range(from, to);

        if (error) throw error;

        const normalizedItems = (data || []).map((row: any) => ({
            id: row.id,
            source: 'firplak',
            nit: row.Nit || '',
            codigo_sn: row['Código SN'] || '',
            razon_social: row['Nombre de socio de negocios'] || '',
            responsable: row.Responsable || '',
            autorizador: row.Autorizador || row.Responsable || '',
            correo: row.Correo || '',
            telefono: row['Numero de telefono'] || '',
            notificar: String(row.Notificar).toLowerCase() === 'true' || row.Notificar === true ? 'True' : 'False',
            modificado: row.Modificado || null,
            modificado_por: row['Modificado por'] || null,
            creado: row.Creado || null
        }));

        // Fetch quick global stats
        const [totalRes, withRes, totalVivRes] = await Promise.all([
            supabaseAdmin.from("Proveedores_con_Responsable").select('*', { count: 'exact', head: true }),
            supabaseAdmin.from("Proveedores_con_Responsable").select('*', { count: 'exact', head: true }).not("Responsable", "is", null).neq("Responsable", ""),
            supabaseAdmin.from("Proveedores_Viventta").select('*', { count: 'exact', head: true })
        ]);

        const totalFirplak = totalRes.count || 0;
        const withResp = withRes.count || 0;
        const withoutResp = Math.max(0, totalFirplak - withResp);
        const totalViventta = totalVivRes.count || 0;

        return NextResponse.json({
            items: normalizedItems,
            total: count || 0,
            page,
            pageSize,
            totalPages: Math.ceil((count || 0) / pageSize),
            stats: {
                totalFirplak,
                withResponsibleFirplak: withResp,
                withoutResponsibleFirplak: withoutResp,
                totalViventta
            }
        });
    } catch (err: any) {
        console.error("Error in GET /api/proveedores-responsables:", err);
        return NextResponse.json({ error: err.message || "Error al obtener proveedores" }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const {
            nit,
            razon_social,
            codigo_sn,
            responsable,
            autorizador,
            correo,
            telefono,
            notificar,
            source = "firplak",
            user_email
        } = body;

        if (!nit || !razon_social) {
            return NextResponse.json({ error: "El NIT y la Razón Social son requeridos" }, { status: 400 });
        }

        const now = new Date();
        const formattedDate = `${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear()} ${now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;

        if (source === "viventta") {
            const { data, error } = await supabaseAdmin
                .from("Proveedores_Viventta")
                .insert({
                    "BP Code": nit,
                    "BP Name": razon_social,
                    "Responsables": responsable || null
                })
                .select()
                .single();

            if (error) throw error;
            return NextResponse.json({ success: true, item: data });
        }

        // Firplak (Proveedores_con_Responsable)
        const insertPayload: any = {
            "Nit": nit.trim(),
            "Nombre de socio de negocios": razon_social.trim(),
            "Código SN": codigo_sn?.trim() || null,
            "Responsable": responsable?.trim() || null,
            "Autorizador": autorizador?.trim() || responsable?.trim() || null,
            "Correo": correo?.trim() || null,
            "Numero de telefono": telefono?.trim() || null,
            "Notificar": notificar ? "True" : "False",
            "Creado": formattedDate,
            "Modificado": formattedDate,
            "Modificado por": user_email || "Usuario del Sistema"
        };

        const { data, error } = await supabaseAdmin
            .from("Proveedores_con_Responsable")
            .insert(insertPayload)
            .select()
            .single();

        if (error) throw error;

        return NextResponse.json({ success: true, item: data });
    } catch (err: any) {
        console.error("Error in POST /api/proveedores-responsables:", err);
        return NextResponse.json({ error: err.message || "Error al crear proveedor" }, { status: 500 });
    }
}

export async function PUT(req: NextRequest) {
    try {
        const body = await req.json();
        const {
            id,
            nit,
            razon_social,
            codigo_sn,
            responsable,
            autorizador,
            correo,
            telefono,
            notificar,
            source = "firplak",
            user_email
        } = body;

        if (!id) {
            return NextResponse.json({ error: "ID de registro requerido" }, { status: 400 });
        }

        const now = new Date();
        const formattedDate = `${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear()} ${now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;

        if (source === "viventta") {
            const { data, error } = await supabaseAdmin
                .from("Proveedores_Viventta")
                .update({
                    "BP Code": nit,
                    "BP Name": razon_social,
                    "Responsables": responsable || null
                })
                .eq("ID", id)
                .select()
                .single();

            if (error) throw error;
            return NextResponse.json({ success: true, item: data });
        }

        const updatePayload: any = {
            "Nit": nit?.trim(),
            "Nombre de socio de negocios": razon_social?.trim(),
            "Código SN": codigo_sn?.trim() || null,
            "Responsable": responsable?.trim() || null,
            "Autorizador": autorizador?.trim() || responsable?.trim() || null,
            "Correo": correo?.trim() || null,
            "Numero de telefono": telefono?.trim() || null,
            "Notificar": notificar ? "True" : "False",
            "Modificado": formattedDate,
            "Modificado por": user_email || "Usuario del Sistema"
        };

        const { data, error } = await supabaseAdmin
            .from("Proveedores_con_Responsable")
            .update(updatePayload)
            .eq("id", id)
            .select()
            .single();

        if (error) throw error;

        return NextResponse.json({ success: true, item: data });
    } catch (err: any) {
        console.error("Error in PUT /api/proveedores-responsables:", err);
        return NextResponse.json({ error: err.message || "Error al actualizar proveedor" }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get("id");
        const source = searchParams.get("source") || "firplak";

        if (!id) {
            return NextResponse.json({ error: "ID requerido para eliminar" }, { status: 400 });
        }

        if (source === "viventta") {
            const { error } = await supabaseAdmin
                .from("Proveedores_Viventta")
                .delete()
                .eq("ID", id);

            if (error) throw error;
            return NextResponse.json({ success: true, message: "Proveedor Viventta eliminado correctamente" });
        }

        const { error } = await supabaseAdmin
            .from("Proveedores_con_Responsable")
            .delete()
            .eq("id", id);

        if (error) throw error;

        return NextResponse.json({ success: true, message: "Proveedor eliminado correctamente" });
    } catch (err: any) {
        console.error("Error in DELETE /api/proveedores-responsables:", err);
        return NextResponse.json({ error: err.message || "Error al eliminar proveedor" }, { status: 500 });
    }
}
