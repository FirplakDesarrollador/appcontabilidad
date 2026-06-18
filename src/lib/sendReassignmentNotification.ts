interface ReassignmentNotificationInput {
  itemId: string | number;
  recipientEmail: string;
  recipientName?: string;
  assignedByName?: string;
  invoiceNumber?: string;
  providerName?: string;
  listName?: string;
}

const APP_BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://appcontabilidad.vercel.app";

export async function sendReassignmentNotification({
  itemId,
  recipientEmail,
  recipientName,
  assignedByName,
  invoiceNumber,
  providerName,
  listName = "Registro_de_Facturas",
}: ReassignmentNotificationInput) {
  const url = process.env.POWER_AUTOMATE_REASSIGNMENT_WEBHOOK_URL;

  if (!url) {
    console.warn("POWER_AUTOMATE_REASSIGNMENT_WEBHOOK_URL is not configured. Skipping reassignment notification.");
    return false;
  }

  const isSupportDocument = listName === "Documento_Soporte";
  const documentType = isSupportDocument ? "documento soporte" : "factura";
  const externalPath = isSupportDocument ? "documento" : "factura";
  const linkUrl = `${APP_BASE_URL}/externo/${externalPath}/${itemId}`;
  const linkLabel = `Abrir ${documentType}`;
  const displayNumber = invoiceNumber || String(itemId);
  const actor = assignedByName || "El equipo de contabilidad";
  const greeting = recipientName ? `Hola ${recipientName}, ` : "";
  const providerText = providerName ? ` del proveedor ${providerName}` : "";

  const payload = {
    titulo: `Te reasignaron la ${documentType} ${displayNumber}`,
    contenido: `${greeting}${actor} te ha asignado la ${documentType} ${displayNumber}${providerText}. Por favor revisala en el portal de aprobacion.`,
    link: `<a href="${linkUrl}">${linkLabel}</a>`,
    responsable: recipientEmail,
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.error("Failed to trigger Power Automate reassignment flow:", await response.text());
      return false;
    }

    console.log(`Power Automate reassignment flow triggered for ${documentType} ${displayNumber}`);
    return true;
  } catch (error) {
    console.error("Error triggering Power Automate reassignment flow:", error);
    return false;
  }
}
