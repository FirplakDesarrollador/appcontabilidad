import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Initialize a Supabase admin client (Service Role)
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false,
    },
});

export async function GET(request: Request) {
    if (!supabaseServiceKey || supabaseServiceKey === "REEMPLAZAR_CON_TU_SERVICE_ROLE_KEY") {
        return NextResponse.json(
            { error: "Service Role Key no configurada en .env.local" },
            { status: 500 }
        );
    }

    try {
        // First get all users from auth.users (requires service role)
        const { data: { users }, error: authError } = await supabaseAdmin.auth.admin.listUsers();
        if (authError) throw authError;

        // Then get all roles from user_roles
        const { data: rolesData, error: rolesError } = await supabaseAdmin
            .from("user_roles")
            .select("*");
        
        if (rolesError) throw rolesError;

        // Combine the data
        const combinedUsers = users.map((u) => {
            const userRole = rolesData.find((r) => r.user_id === u.id);
            return {
                id: u.id,
                email: u.email,
                created_at: u.created_at,
                last_sign_in_at: u.last_sign_in_at,
                role: userRole ? userRole.role : "viewer", // Default to viewer if not in table
            };
        });

        return NextResponse.json(combinedUsers);
    } catch (error: any) {
        console.error("Error fetching users:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(request: Request) {
    if (!supabaseServiceKey || supabaseServiceKey === "REEMPLAZAR_CON_TU_SERVICE_ROLE_KEY") {
        return NextResponse.json(
            { error: "Service Role Key no configurada en .env.local" },
            { status: 500 }
        );
    }

    try {
        const body = await request.json();
        const { userId, role } = body;

        if (!userId || !role) {
            return NextResponse.json({ error: "Faltan parámetros" }, { status: 400 });
        }

        // Upsert the role in user_roles table
        const { error } = await supabaseAdmin
            .from("user_roles")
            .upsert({ user_id: userId, role: role, updated_at: new Date().toISOString() });

        if (error) throw error;

        return NextResponse.json({ success: true, message: "Rol actualizado correctamente" });
    } catch (error: any) {
        console.error("Error updating user role:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
