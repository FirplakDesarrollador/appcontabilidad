export interface RegistroFactura {
    ID: number;
    Nit: string | null;
    Proveedor: string | null;
    Nro_Factura: string | null;
    Aprobacion_Doliente: string | null;
    Gestion_Contabilidad: string | null;
    Observaciones: string | null;
    Consecutivo: string | null;
    Responsable_de_Autorizar: string | null;
    FechaAprobacion: string | null;
    centro_costos: string | null;
    Valor_total: string | null;
    tiene_anticipo: string | null;
    Creado: string | null;
    Creado_por: string | null;
    CUFE: string | null;
    InformeRecepcion: string | null;
    FechaProcesado: string | null;
    DigitadoPor: string | null;
    Datos_adjuntos: number | null;
    tablaCostos: string | null;
    Procesado: string | null;
    Modificado: string | null;
    Modificado_por: string | null;
    fp: string | null;
    notificar_reasignacion: boolean | null;
    notificacionContabilidadEnviada: string | null;
    sharepoint_id: string | null;
    documentos: string | null;
    updated_at: string | null;
}

export interface FacturaPendiente {
    ID: number;
    "Tipo_de_documento": string | null;
    "CUFE/CUDE": string | null;
    Folio: string | null;
    Prefijo: string | null;
    "Fecha_Emision": string | null;
    "Fecha_Recepcion": string | null;
    "NIT_Emisor": string | null;
    "Nombre_Emisor": string | null;
    IVA: string | null;
    INC: string | null;
    Total: string | null;
}
