export async function sendApprovalNotification(invoiceData: {
  factura: string;
  proveedor: string;
  nit: string;
  responsable_aprobacion: string;
  estado_aprobacion: "Aprobada" | "Rechazada";
  observaciones: string;
}) {
  const url = "https://defaultfa1de04f47804d83a94293c7ae8dee.9d.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/e91e6909b02442958d9215da81d493f7/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=pT-wyoV_ltEExFuqeCwSlA9DXOJ0bVtVghFPr_IF1jc";

  try {
    console.log("SENDING EMAIL PAYLOAD:", JSON.stringify(invoiceData, null, 2));
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(invoiceData),
    });

    console.log("POWER AUTOMATE RESPONSE STATUS:", response.status);

    if (!response.ok) {
      console.error("Failed to trigger Power Automate approval email flow:", await response.text());
      return false;
    }

    console.log(`Power Automate approval email flow triggered successfully for invoice ${invoiceData.factura}`);
    return true;
  } catch (error) {
    console.error("Error triggering Power Automate approval email flow:", error);
    return false;
  }
}
