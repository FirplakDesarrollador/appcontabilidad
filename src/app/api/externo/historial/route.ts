import { NextRequest, NextResponse } from 'next/server';
import { fetchAllSharePointItems } from '@/lib/sharepoint';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function normalizeStr(str: string): string {
    return (str || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

function matchesResponsable(respParam: string, name?: string | null, email?: string | null): boolean {
    const target = normalizeStr(respParam);
    if (!target) return false;
    
    const n = normalizeStr(name || '');
    const e = normalizeStr(email || '');

    if (n === target || e === target) return true;
    if (n && (n.includes(target) || target.includes(n))) return true;
    if (e && (e.includes(target) || target.includes(e))) return true;

    const tokens = target.split(/\s+/).filter(t => t.length > 2);
    if (tokens.length >= 2 && tokens.every(tok => n.includes(tok))) return true;

    return false;
}

function isProcessedStatus(statusRaw?: string | null): boolean {
    if (!statusRaw) return false;
    const status = normalizeStr(statusRaw);
    return status.includes('aprobado') || status.includes('rechazado');
}

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const responsable = searchParams.get('responsable');

        if (!responsable) {
            return NextResponse.json({ error: 'Missing responsable parameter' }, { status: 400 });
        }

        // Fetch from the 3 approval sources concurrently
        const [
            spFacturasResult,
            supabaseFacturasResult,
            docSoporteResult,
            viventtaResult
        ] = await Promise.allSettled([
            fetchAllSharePointItems('Registro_de_Facturas'),
            supabaseAdmin.from('Registro_Facturas').select('*'),
            supabaseAdmin.from('Documento_Soporte').select('*'),
            supabaseAdmin.from('Facturas_Viventta').select('*')
        ]);

        const historyItems: any[] = [];

        // 1. Facturas Firplak
        let facturasList: any[] = [];
        if (spFacturasResult.status === 'fulfilled' && spFacturasResult.value && spFacturasResult.value.length > 0) {
            facturasList = spFacturasResult.value;
        } else if (supabaseFacturasResult.status === 'fulfilled' && supabaseFacturasResult.value.data) {
            facturasList = supabaseFacturasResult.value.data;
        }

        for (const item of facturasList) {
            const respName = item.Responsable_de_Autorizar || item.Responsable_x0020_de_x0020_Auto || item.responsable_nombre;
            const respEmail = item.Responsable_email || item.Responsable_x0020_email || item.Email_Responsable;
            const status = item.Aprobacion_Doliente || item.AprobacionDoliente || "";

            if (matchesResponsable(responsable, respName, respEmail) && isProcessedStatus(status)) {
                const nitValue = item.Title || item.Nit_x0020_ || item["Nit "] || item.Nit || "N/A";
                const valorTotal = item.Valortotal ?? item.Valor_x0020_total ?? item["Valor total"] ?? item.Monto ?? 0;
                
                historyItems.push({
                    id: String(item.id || item.ID),
                    proveedor: item.Proveedor || item.tsic || item.Nombre_proveedor || item.Razon_social || "N/A",
                    nit: nitValue,
                    valorTotal: valorTotal.toString(),
                    nroFactura: item.Nro_Factura || item.Factura || "N/A",
                    consecutivo: item.Consecutivo || item.consecutivo || "",
                    fechaRegistro: item.Created || item.Creado || item.OData__RegistrationDate,
                    fechaAprobacion: item.FechaAprobacion || item.Modified || item.updated_at || null,
                    aprobacionDoliente: status,
                    responsableActual: respName || "No asignado",
                    tipo: "FACTURA",
                    modulo: "Aprobación de facturas",
                    moneda: "COP",
                    url: `/externo/factura/${item.id || item.ID}?readonly=true`
                });
            }
        }

        // 2. Documentos Soporte
        if (docSoporteResult.status === 'fulfilled' && docSoporteResult.value.data) {
            for (const item of docSoporteResult.value.data) {
                const respName = item.responsable_nombre || item.Responsable_de_Autorizar;
                const respEmail = item.responsable_email || item.Responsable_email;
                const status = item.aprobacion_doliente || item.Aprobacion_Doliente || "";

                if (matchesResponsable(responsable, respName, respEmail) && isProcessedStatus(status)) {
                    historyItems.push({
                        id: String(item.id),
                        proveedor: item.proveedor || item.Proveedor || "N/A",
                        nit: item.nit || item.Nit || "N/A",
                        valorTotal: (item.valor_total ?? item.Valor_total ?? 0).toString(),
                        nroFactura: item.consecutivo ? String(item.consecutivo) : (item.nro_factura || "S/N"),
                        consecutivo: item.consecutivo ? String(item.consecutivo) : "",
                        fechaRegistro: item.fecha_creacion || item.created_at,
                        fechaAprobacion: item.fecha_aprobacion || item.updated_at || null,
                        aprobacionDoliente: status,
                        responsableActual: respName || "No asignado",
                        tipo: "DOCUMENTO SOPORTE",
                        modulo: "Aprobación de docs soporte",
                        moneda: "COP",
                        url: `/externo/documento/${item.id}?readonly=true`
                    });
                }
            }
        }

        // 3. Facturas Viventta
        if (viventtaResult.status === 'fulfilled' && viventtaResult.value.data) {
            for (const item of viventtaResult.value.data) {
                const respName = item.Responsable_de_Autorizar || item.responsable_nombre;
                const respEmail = item.Responsable_email || item.responsable_email;
                const status = item.Aprobacion_Doliente || "";

                if (matchesResponsable(responsable, respName, respEmail) && isProcessedStatus(status)) {
                    historyItems.push({
                        id: String(item.id),
                        proveedor: item.Proveedor || "N/A",
                        nit: item.Nit || "N/A",
                        valorTotal: (item.Valor_total ?? item.Monto ?? 0).toString(),
                        nroFactura: item.Nro_Factura || item.Consecutivo || "N/A",
                        consecutivo: item.Consecutivo || "",
                        fechaRegistro: item.Creado || item.created_at,
                        fechaAprobacion: item.FechaAprobacion || item.updated_at || null,
                        aprobacionDoliente: status,
                        responsableActual: respName || "No asignado",
                        tipo: "FACTURA VIVENTTA",
                        modulo: "Facturas Viventta",
                        moneda: "COP",
                        url: `/externo/factura-viventta/${item.id}?readonly=true`
                    });
                }
            }
        }

        // Sort by fechaAprobacion or fechaRegistro descending
        historyItems.sort((a, b) => {
            const dateA = a.fechaAprobacion ? new Date(a.fechaAprobacion).getTime() : (a.fechaRegistro ? new Date(a.fechaRegistro).getTime() : 0);
            const dateB = b.fechaAprobacion ? new Date(b.fechaAprobacion).getTime() : (b.fechaRegistro ? new Date(b.fechaRegistro).getTime() : 0);
            return dateB - dateA;
        });

        return NextResponse.json({
            success: true,
            total: historyItems.length,
            items: historyItems,
            countsByModule: {
                facturas: historyItems.filter(i => i.tipo === 'FACTURA').length,
                docSoporte: historyItems.filter(i => i.tipo === 'DOCUMENTO SOPORTE').length,
                viventta: historyItems.filter(i => i.tipo === 'FACTURA VIVENTTA').length,
            }
        });

    } catch (error: any) {
        console.error('Error fetching historial items for approval modules:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
