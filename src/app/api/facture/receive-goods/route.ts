import { NextRequest, NextResponse } from "next/server";
import { sendReceiveGoods, ReceiveGoodsPayload } from "@/lib/facture";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { documentTokenBase64, ...payload }: { documentTokenBase64: string } & ReceiveGoodsPayload = body;

    if (!documentTokenBase64) {
      return NextResponse.json(
        { success: false, error: "El parámetro documentTokenBase64 es requerido." },
        { status: 400 }
      );
    }

    if (!payload.receiverDocumentNumber || !payload.receiverName || !payload.receiverLastName) {
      return NextResponse.json(
        {
          success: false,
          error: "Los campos receiverDocumentNumber, receiverName y receiverLastName son requeridos."
        },
        { status: 400 }
      );
    }

    const result = await sendReceiveGoods(documentTokenBase64, payload);

    if (!result.success) {
      return NextResponse.json(result, { status: result.status || 500 });
    }

    return NextResponse.json(result, { status: 200 });
  } catch (error: any) {
    console.error("Error en /api/facture/receive-goods:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Error interno del servidor" },
      { status: 500 }
    );
  }
}
