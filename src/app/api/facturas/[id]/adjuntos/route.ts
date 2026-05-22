import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const BUCKET_NAME = "adjuntos_facturas";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface ManualAttachment {
    name: string;
    url: string;
    path: string;
    type: string;
    size: number;
    uploadedAt: string;
}

function sanitizePathPart(value: string) {
    return value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\w.\- ]+/g, "")
        .trim()
        .replace(/\s+/g, "_");
}

function normalizeAttachments(value: unknown): ManualAttachment[] {
    if (!value) return [];
    if (Array.isArray(value)) return value as ManualAttachment[];
    if (typeof value === "string") {
        try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }
    return [];
}

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const formData = await req.formData();
        const invoiceNumber = String(formData.get("invoiceNumber") || id);
        const files = formData.getAll("files").filter((item): item is File => item instanceof File);

        if (!id || files.length === 0) {
            return NextResponse.json({ error: "Missing invoice id or files" }, { status: 400 });
        }

        const { data: currentInvoice, error: fetchError } = await supabase
            .from("Registro_Facturas")
            .select("ID, adjuntos_url")
            .or(`ID.eq.${id},sharepoint_id.eq.${id}`)
            .maybeSingle();

        if (fetchError) throw fetchError;
        if (!currentInvoice) {
            return NextResponse.json({ error: "Factura no encontrada en Supabase" }, { status: 404 });
        }

        const folderName = sanitizePathPart(invoiceNumber || id);
        const uploadedAttachments: ManualAttachment[] = [];

        for (const file of files) {
            const safeName = sanitizePathPart(file.name);
            const path = `${folderName}/${safeName}`;
            const bytes = Buffer.from(await file.arrayBuffer());

            const { error: uploadError } = await supabase.storage
                .from(BUCKET_NAME)
                .upload(path, bytes, {
                    contentType: file.type || "application/octet-stream",
                    upsert: true,
                });

            if (uploadError) throw uploadError;

            const { data: publicUrlData } = supabase.storage
                .from(BUCKET_NAME)
                .getPublicUrl(path);

            uploadedAttachments.push({
                name: file.name,
                url: publicUrlData.publicUrl,
                path,
                type: file.type || "application/octet-stream",
                size: file.size,
                uploadedAt: new Date().toISOString(),
            });
        }

        const existingAttachments = normalizeAttachments(currentInvoice.adjuntos_url);
        const mergedByPath = new Map<string, ManualAttachment>();
        [...existingAttachments, ...uploadedAttachments].forEach((attachment) => {
            mergedByPath.set(attachment.path || attachment.url, attachment);
        });

        const adjuntos_url = Array.from(mergedByPath.values());
        const { error: updateError } = await supabase
            .from("Registro_Facturas")
            .update({ adjuntos_url })
            .eq("ID", currentInvoice.ID);

        if (updateError) throw updateError;

        return NextResponse.json({
            success: true,
            attachments: adjuntos_url,
            uploaded: uploadedAttachments,
        });
    } catch (error: any) {
        console.error("Error uploading invoice attachments:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const { path, url } = await req.json();

        if (!id || (!path && !url)) {
            return NextResponse.json({ error: "Missing invoice id or attachment reference" }, { status: 400 });
        }

        const { data: currentInvoice, error: fetchError } = await supabase
            .from("Registro_Facturas")
            .select("ID, adjuntos_url")
            .or(`ID.eq.${id},sharepoint_id.eq.${id}`)
            .maybeSingle();

        if (fetchError) throw fetchError;
        if (!currentInvoice) {
            return NextResponse.json({ error: "Factura no encontrada en Supabase" }, { status: 404 });
        }

        const existingAttachments = normalizeAttachments(currentInvoice.adjuntos_url);
        const attachmentToRemove = existingAttachments.find((attachment) =>
            (path && attachment.path === path) || (url && attachment.url === url)
        );

        const adjuntos_url = existingAttachments.filter((attachment) =>
            !((path && attachment.path === path) || (url && attachment.url === url))
        );

        const { error: updateError } = await supabase
            .from("Registro_Facturas")
            .update({ adjuntos_url })
            .eq("ID", currentInvoice.ID);

        if (updateError) throw updateError;

        if (attachmentToRemove?.path) {
            const { error: removeError } = await supabase.storage
                .from(BUCKET_NAME)
                .remove([attachmentToRemove.path]);

            if (removeError) {
                console.warn("Attachment metadata removed, but storage object deletion failed:", removeError.message);
            }
        }

        return NextResponse.json({
            success: true,
            attachments: adjuntos_url,
        });
    } catch (error: any) {
        console.error("Error deleting invoice attachment:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
