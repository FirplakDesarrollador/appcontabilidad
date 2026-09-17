import { createClient } from '@supabase/supabase-js';

export interface ReceiveGoodsPayload {
  motive?: string;
  sourceDelivery?: string;
  canal?: string;
  medio?: string;
  receiverDocumentType?: string;
  receiverDocumentNumber: string;
  receiverName: string;
  receiverLastName: string;
  receiverJobTitle?: string;
  receiverOrganizationDepartment?: string;
  receiveDateTime?: string;
}

export interface AcceptPayload {
  motive?: string;
  sourceDelivery?: string;
  canal?: string;
  medio?: string;
}

export interface FactureResponse {
  success: boolean;
  data?: any;
  error?: string;
  status?: number;
}

const INBOX_BASE_URL = "https://fone-reception-inbox-pro.azurewebsites.net";
const CONSTANT_ID = "0b409936-666f-4a61-8efd-a9c400d9fa7f";

/**
 * Obtiene el token JWT de autenticación de Facture
 */
export async function getFactureAuthToken(): Promise<string> {
  const loginUrl = "https://api.facture.co/PLColab.Identity/Auth/Login";
  const user = process.env.FACTURE_API_USER || "890927404";
  const pass = process.env.FACTURE_API_PASSWORD || "|uLuG&W@SDUdQ26";

  const res = await fetch(loginUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      u: user,
      p: pass,
      ft: "issuer|Receiver"
    })
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Error de autenticación en Facture (${res.status}): ${errorText}`);
  }

  const data = await res.json();
  const token = data.accessToken || data.token || (typeof data === 'string' ? data : data.jwt);

  if (!token) {
    throw new Error("No se obtuvo accessToken en la respuesta de Facture.");
  }

  return token;
}

/**
 * Envía el evento RECEIVEGOODS (Recibo de Bienes y Servicios) a Facture
 * @param documentTokenBase64 Token Base64 del LDF del documento en Facture
 * @param payload Datos del receptor y entrega
 * @param authToken Token JWT opcional (si no se especifica, se obtiene automáticamente)
 */
export async function sendReceiveGoods(
  documentTokenBase64: string,
  payload: ReceiveGoodsPayload,
  authToken?: string
): Promise<FactureResponse> {
  try {
    const token = authToken || (await getFactureAuthToken());
    const url = `https://reception-domain-service.facture.co/PLColab.Documents/Document/RECEIVEGOODS/${encodeURIComponent(documentTokenBase64)}`;

    const bodyData = {
      motive: payload.motive || "Otro",
      sourceDelivery: payload.sourceDelivery || "INBOX",
      canal: payload.canal || "INBOX",
      medio: payload.medio || process.env.FACTURE_MEDIO_EMAIL || "tu_correo@factureinbox.co",
      receiverDocumentType: payload.receiverDocumentType || "CC",
      receiverDocumentNumber: payload.receiverDocumentNumber,
      receiverName: payload.receiverName,
      receiverLastName: payload.receiverLastName,
      receiverJobTitle: payload.receiverJobTitle || "",
      receiverOrganizationDepartment: payload.receiverOrganizationDepartment || "",
      receiveDateTime: payload.receiveDateTime || new Date().toISOString()
    };

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Origin": "https://plataforma.facture.co",
        "Referer": "https://plataforma.facture.co/",
        "reception": "true",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify(bodyData)
    });

    const responseData = await res.json().catch(() => null);

    if (!res.ok || (responseData && responseData.isSuccess === false)) {
      return {
        success: false,
        status: res.status,
        error: responseData?.eventItems?.[0]?.shortDescription || responseData?.message || `Facture API returned status ${res.status}`,
        data: responseData
      };
    }

    return {
      success: true,
      status: res.status,
      data: responseData
    };
  } catch (error: any) {
    return {
      success: false,
      error: error?.message || "Error al comunicarse con la API de Facture"
    };
  }
}

/**
 * Envía el evento ACCEPT/V2 (Aceptación del Documento) a Facture
 * @param documentTokenBase64 Token Base64 del LDF del documento en Facture
 * @param payload Datos de la aceptación
 * @param authToken Token JWT opcional (si no se especifica, se obtiene automáticamente)
 */
export async function sendAcceptDocument(
  documentTokenBase64: string,
  payload?: AcceptPayload,
  authToken?: string
): Promise<FactureResponse> {
  try {
    const token = authToken || (await getFactureAuthToken());
    const url = `https://reception-domain-service.facture.co/PLColab.Documents/Document/ACCEPT/V2/${encodeURIComponent(documentTokenBase64)}`;

    const bodyData = {
      motive: payload?.motive || "Aceptación",
      sourceDelivery: payload?.sourceDelivery || "INBOX",
      canal: payload?.canal || "INBOX",
      medio: payload?.medio || process.env.FACTURE_MEDIO_EMAIL || "tu_correo@factureinbox.co"
    };

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Origin": "https://plataforma.facture.co",
        "Referer": "https://plataforma.facture.co/",
        "reception": "true",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify(bodyData)
    });

    const responseData = await res.json().catch(() => null);

    if (!res.ok || (responseData && responseData.isSuccess === false)) {
      return {
        success: false,
        status: res.status,
        error: responseData?.eventItems?.[0]?.shortDescription || responseData?.message || `Facture API returned status ${res.status}`,
        data: responseData
      };
    }

    return {
      success: true,
      status: res.status,
      data: responseData
    };
  } catch (error: any) {
    return {
      success: false,
      error: error?.message || "Error al comunicarse con la API de Aceptación de Facture"
    };
  }
}

/**
 * Dispara automáticamente la secuencia completa (RECEIVEGOODS + ACCEPT/V2) para una factura aprobada de Registro_Facturas.
 * Exclusivo para Facturas de Proveedores (Registro_Facturas).
 */
export async function triggerReceiveGoodsForInvoice(
  invoiceId: number | string,
  extraDetails?: { responsableName?: string; observaciones?: string }
): Promise<FactureResponse> {
  console.log(`[Facture] Iniciando flujo automático (Recibo + Aceptación) para factura ID ${invoiceId}...`);

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://zohdtksgxhbheaftgmsi.supabase.co";
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvaGR0a3NneGhiaGVhZnRnbXNpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTcyMjk2MTE1MSwiZXhwIjoyMDM4NTM3MTUxfQ.Y-OdRzGTe0llD1VRPYxyUIo1man7MCeABlMrZVuAqus";
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Obtener la factura de Registro_Facturas
    const { data: invoice, error: fetchErr } = await supabase
      .from('Registro_Facturas')
      .select('ID, Nro_Factura, Nit, Proveedor, Responsable_de_Autorizar, Creado, FechaAprobacion')
      .eq('ID', Number(invoiceId))
      .single();

    if (fetchErr || !invoice) {
      console.warn(`[Facture] No se encontró la factura con ID ${invoiceId} en Registro_Facturas:`, fetchErr?.message);
      return { success: false, error: `Factura ID ${invoiceId} no encontrada` };
    }

    const nroFactura = (invoice.Nro_Factura || "").trim();
    const cleanNit = (invoice.Nit || "").split('-')[0].trim().replace(/\D/g, '');

    if (!nroFactura) {
      return { success: false, error: "Nro_Factura no disponible" };
    }

    // 2. Obtener Token JWT
    const token = await getFactureAuthToken();

    // 3. Buscar la factura en el Inbox de Facture para extraer su LDF oficial
    let ldfString = "";
    try {
      const now = new Date();
      const sixtyDaysAgo = new Date();
      sixtyDaysAgo.setDate(now.getDate() - 60);
      const formatDate = (d: Date) => d.toISOString().split('T')[0] + "T00:00:00.00";

      const inboxUrl = new URL(`${INBOX_BASE_URL}/PLColab.Inbox/Notification/PRINCIPAL/With/RECEIVED;ACKNOWLEDGED;RECEIVEDGOODS/WithNot/ACCEPTED;REJECTED/${CONSTANT_ID}`);
      inboxUrl.searchParams.append("receiverStartingDate", formatDate(sixtyDaysAgo));
      inboxUrl.searchParams.append("receiverEndingDate", formatDate(now));
      inboxUrl.searchParams.append("pageIndex", "1");
      inboxUrl.searchParams.append("pageSize", "100");

      const inboxRes = await fetch(inboxUrl.toString(), {
        method: "GET",
        headers: { "Authorization": `Bearer ${token}` }
      });

      if (inboxRes.ok) {
        const inboxData = await inboxRes.json();
        const items: any[] = inboxData?.items || inboxData || [];
        const match = items.find(i => {
          const num = i.number || i.documentCode || i.ldf || "";
          return num.includes(nroFactura) || (cleanNit && i.supplierIdentification && i.supplierIdentification.includes(cleanNit));
        });
        if (match && match.ldf) {
          ldfString = match.ldf;
          console.log(`[Facture] LDF oficial encontrado en Inbox para ${nroFactura}: ${ldfString}`);
        }
      }
    } catch (inboxErr) {
      console.warn("[Facture] No se pudo consultar Inbox para LDF, se construirá candidato:", inboxErr);
    }

    // Fallback: construir LDF estándar si no se halló en Inbox
    if (!ldfString) {
      const fechaStr = invoice.Creado ? new Date(invoice.Creado).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
      ldfString = `FACTURA-UBL(${cleanNit};${nroFactura};${fechaStr};PRINCIPAL;PRINCIPAL)`;
      console.log(`[Facture] LDF construido por fallback: ${ldfString}`);
    }

    const documentTokenBase64 = Buffer.from(ldfString).toString('base64');

    // Preparar el nombre del responsable
    const fullResponsableName = extraDetails?.responsableName || invoice.Responsable_de_Autorizar || "Responsable Autorizador";
    const nameParts = fullResponsableName.trim().split(' ');
    const firstName = nameParts[0] || "Aprobador";
    const lastName = nameParts.slice(1).join(' ') || "Contabilidad";

    // 4. Paso 1: Enviar RECEIVEGOODS (Recibo de Bienes)
    const receiveResult = await sendReceiveGoods(documentTokenBase64, {
      motive: "Otro",
      sourceDelivery: "INBOX",
      canal: "INBOX",
      medio: process.env.FACTURE_MEDIO_EMAIL || "tu_correo@factureinbox.co",
      receiverDocumentType: "CC",
      receiverDocumentNumber: "123456789",
      receiverName: firstName,
      receiverLastName: lastName,
      receiverJobTitle: "Responsable de Autorizar",
      receiverOrganizationDepartment: "Contabilidad",
      receiveDateTime: new Date().toISOString()
    }, token);

    if (receiveResult.success) {
      console.log(`[Facture] ✅ Recibo de Bienes (RECEIVEGOODS) enviado con éxito para factura ${nroFactura} (ID ${invoiceId})`);
    } else {
      console.warn(`[Facture] ⚠️ Aviso/Respuesta en Recibo de Bienes para factura ${nroFactura}:`, receiveResult.error);
    }

    // 5. Paso 2: Enviar ACCEPT/V2 (Aceptación Expresa del Documento)
    console.log(`[Facture] Iniciando Paso 2: Aceptación Expresa (ACCEPT/V2) para factura ${nroFactura} (ID ${invoiceId})...`);
    const acceptResult = await sendAcceptDocument(documentTokenBase64, {
      motive: "Aceptación",
      sourceDelivery: "INBOX",
      canal: "INBOX",
      medio: process.env.FACTURE_MEDIO_EMAIL || "tu_correo@factureinbox.co"
    }, token);

    if (acceptResult.success) {
      console.log(`[Facture] ✅ Aceptación Expresa (ACCEPT/V2) enviada con éxito para factura ${nroFactura} (ID ${invoiceId})`);
    } else {
      console.warn(`[Facture] ⚠️ Aviso/Respuesta en Aceptación Expresa para factura ${nroFactura}:`, acceptResult.error);
    }

    return {
      success: receiveResult.success || acceptResult.success,
      data: { receive: receiveResult.data, accept: acceptResult.data },
      error: receiveResult.error || acceptResult.error
    };
  } catch (error: any) {
    console.error(`[Facture] Excepción en flujo automático Facture (${invoiceId}):`, error);
    return { success: false, error: error?.message || "Error al procesar eventos en Facture" };
  }
}
