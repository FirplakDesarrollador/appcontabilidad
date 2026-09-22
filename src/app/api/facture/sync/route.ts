import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  try {
    let body = {};
    try {
      body = await req.json();
    } catch (_e) {
      // Body es opcional
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://zohdtksgxhbheaftgmsi.supabase.co";
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvaGR0a3NneGhiaGVhZnRnbXNpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTcyMjk2MTE1MSwiZXhwIjoyMDM4NTM3MTUxfQ.Y-OdRzGTe0llD1VRPYxyUIo1man7MCeABlMrZVuAqus";
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log("[api/facture/sync] Invocando Edge Function 'sincronizar-con-facture'...");

    const { data, error } = await supabase.functions.invoke('sincronizar-con-facture', {
      body
    });

    if (error) {
      console.error("[api/facture/sync] Error invocando Edge Function:", error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || { success: true });
  } catch (error: any) {
    console.error("Error en /api/facture/sync:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Error interno del servidor" },
      { status: 500 }
    );
  }
}

export async function GET() {
  return POST(new NextRequest("https://localhost/api/facture/sync", { method: "POST" }));
}
