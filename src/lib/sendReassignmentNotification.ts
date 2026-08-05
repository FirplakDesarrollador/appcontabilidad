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

  let documentType = "factura";
  let externalPath = "factura";

  if (listName === "Documento_Soporte") {
    documentType = "documento soporte";
    externalPath = "documento";
  } else if (listName === "Radicados_de_importacion") {
    documentType = "radicado de importación";
    externalPath = "radicado";
  } else if (listName === "Facturas_Viventta") {
    documentType = "factura Viventta";
    externalPath = "factura-viventta";
  }

  const linkUrl = `${APP_BASE_URL}/externo/${externalPath}/${itemId}?responsable=${encodeURIComponent(recipientEmail)}`;
  const linkLabel = `Abrir ${documentType}`;
  const displayNumber = invoiceNumber || String(itemId);
  const actor = assignedByName || "El equipo de contabilidad";
  const greeting = recipientName ? `Hola ${recipientName}, ` : "";
  const providerText = providerName ? ` del proveedor ${providerName}` : "";

  const payload = {
    titulo: `Te reasignaron ${documentType.startsWith("f") || documentType.startsWith("d") ? "la" : "el"} ${documentType} ${displayNumber}`,
    contenido: `${greeting}${actor} te ha asignado ${documentType.startsWith("f") || documentType.startsWith("d") ? "la" : "el"} ${documentType} ${displayNumber}${providerText}. Por favor revísalo en el portal de aprobación.`,
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
