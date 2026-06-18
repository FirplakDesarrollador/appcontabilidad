import { NextResponse } from "next/server";

const SYNC_SHAREPOINT_FUNCTION_URL =
    "https://zohdtksgxhbheaftgmsi.supabase.co/functions/v1/sync-sharepoint";

const getErrorMessage = (error: unknown) =>
    error instanceof Error ? error.message : "Error de conexion con Supabase";

const parseResponseBody = async (response: Response) => {
    const text = await response.text();
    if (!text) return null;

    try {
        return JSON.parse(text) as unknown;
    } catch {
        return { message: text };
    }
};

const getPayloadField = (data: unknown, field: "error" | "message") => {
    if (!data || typeof data !== "object") return null;
    const value = (data as Record<string, unknown>)[field];
    return typeof value === "string" ? value : null;
};

export async function POST(request: Request) {
    try {
        const authToken =
            process.env.SUPABASE_SERVICE_ROLE_KEY ||
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

        if (!authToken) {
            return NextResponse.json(
                { success: false, error: "Supabase auth token is not configured" },
                { status: 500 }
            );
        }

        const response = await fetch(SYNC_SHAREPOINT_FUNCTION_URL, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${authToken}`,
                apikey: authToken,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ source: "aprobacion-facturas" }),
            cache: "no-store",
        });

        const data = await parseResponseBody(response);
        const errorMessage = getPayloadField(data, "error");

        if (!response.ok && errorMessage === "Missing required environment variables.") {
            const origin = new URL(request.url).origin;
            const secret = process.env.CRON_SECRET;
            const fallbackUrl = new URL("/api/cron/sync-sharepoint", origin);

            if (secret) fallbackUrl.searchParams.set("secret", secret);
            fallbackUrl.searchParams.set("manual", "true");

            const fallbackResponse = await fetch(fallbackUrl, {
                method: "GET",
                cache: "no-store",
            });
            const fallbackData = await parseResponseBody(fallbackResponse);

            if (!fallbackResponse.ok) {
                return NextResponse.json(
                    {
                        success: false,
                        error: getPayloadField(fallbackData, "error") || "Error al ejecutar sincronizacion local",
                        supabaseError: errorMessage,
                        details: fallbackData,
                    },
                    { status: fallbackResponse.status }
                );
            }

            return NextResponse.json({
                success: true,
                source: "local-fallback",
                supabaseError: errorMessage,
                result: fallbackData,
            });
        }

        if (!response.ok) {
            return NextResponse.json(
                {
                    success: false,
                    error: errorMessage || getPayloadField(data, "message") || "Error al ejecutar sync-sharepoint",
                    details: data,
                },
                { status: response.status }
            );
        }

        return NextResponse.json(data || { success: true });
    } catch (error: unknown) {
        console.error("Error invoking Supabase sync-sharepoint function:", error);
        return NextResponse.json(
            { success: false, error: getErrorMessage(error) },
            { status: 500 }
        );
    }
}
