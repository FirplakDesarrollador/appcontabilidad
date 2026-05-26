import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';
import { getSharePointInvoiceById } from '@/lib/sharepoint';
import { createSapDraft } from '@/lib/sap';

export async function POST(req: NextRequest) {
    try {
        const { invoiceId } = await req.json();

        if (!invoiceId) {
            return NextResponse.json({ success: false, error: 'Missing invoiceId' }, { status: 400 });
        }

        console.log(`[Manual SAP Draft] Triggering for invoice ID: ${invoiceId}`);

        // 1. Fetch invoice data (EXCLUSIVELY from SharePoint as requested)
        console.log(`[Manual SAP Draft] Fetching from SharePoint...`);
        let invoice: any = null;
        
        try {
            const spItem = await getSharePointInvoiceById(String(invoiceId));
            if (!spItem) {
                throw new Error(`Invoice ${invoiceId} not found in SharePoint`);
            }

            // Normalize fields from SharePoint (Support for multiple field name variants)
            let nitValue = spItem.Nit || spItem.Nit_x0020_ || spItem["Nit "] || spItem.Title || "N/A";
            nitValue = String(nitValue).replace(/[.\s]/g, '').trim(); // Normalizar NIT: quitar puntos y espacios, mantener guion
            const montoValue = spItem.Valortotal ?? spItem.Valor_x0020_total ?? spItem["Valor total"] ?? spItem.Monto ?? 0;
            const nroFactura = spItem.Nro_Factura || spItem.Nro_x002e__x0020_Factura || spItem.Nro_Factura_x0020_ || "S/N";
            
            // Map SharePoint fields to the internal object format
            invoice = {
                id: spItem.id,
                Nro_Factura: nroFactura,
                Proveedor: spItem.Proveedor || "Proveedor en SharePoint",
                Nit: String(nitValue),
                Responsable_de_Autorizar: spItem.Responsable_de_Autorizar,
                Observaciones: spItem.Observaciones || 'Sincronización manual desde portal de aprobación',
                centro_costos: (typeof spItem.centro_costos === 'string' && spItem.centro_costos)
                    || (typeof spItem.Centro_x0020_de_x0020_costos === 'string' && spItem.Centro_x0020_de_x0020_costos)
                    || (typeof spItem.tablaCostos === 'string' && spItem.tablaCostos)
                    || "[]",
                "Valor total": String(montoValue),
                tiene_anticipo: spItem.tiene_anticipo === 't' || spItem.tiene_anticipo === true || spItem.tiene_anticipo === 'true' || spItem.Tiene_x0020_anticipo === 't',
                Consecutivo: spItem.Consecutivo || String(invoiceId)
            };

            console.log(`[Manual SAP Draft] SharePoint Item ${invoiceId} loaded successfully.`);

        } catch (spErr: any) {
            console.error(`[Manual SAP Draft] SharePoint fetch error:`, spErr.message);
            throw new Error(`Failed to retrieve invoice from SharePoint: ${spErr.message}`);
        }

        // 2. Prepare distribution lines
        const consecutivoReal = invoice.Consecutivo || invoiceId;
        const proveedorReal = invoice.Proveedor || "Proveedor Desconocido";

        // 3. Prepare distribution lines
        let distribuciones: any[] = [];
        try {
            let raw = invoice.centro_costos;
            
            // Parse if it's a string
            if (typeof raw === 'string') {
                raw = JSON.parse(raw);
            }
            
            // If still a string after first parse (double-encoded), parse again
            if (typeof raw === 'string') {
                raw = JSON.parse(raw);
            }
            
            // Ensure it's an array
            if (!Array.isArray(raw)) {
                raw = raw ? [raw] : [];
            }
            
            console.log("[Manual SAP Draft] Raw distribution array:", JSON.stringify(raw, null, 2));
            
            // Normalize to what createSapDraft expects (centroCostos)
            distribuciones = raw.map((d: any) => ({
                centroCostos: d.centroCostos || d.centroCosto || d.centro_costos || d.CentroCostos || d.TableCostos || '',
                cuenta: d.cuenta || d.Cuenta || '',
                valor: d.valor || d.Valor || d.monto || 0
            }));
            
            console.log(`[Manual SAP Draft] Normalized ${distribuciones.length} distribution lines from SharePoint.`);
        } catch (e) {
            console.error("[Manual SAP Draft] Error parsing centro_costos from SharePoint:", e);
        }

        // Fallback: try reading from Supabase if SharePoint didn't have distribuciones
        if (distribuciones.length === 0) {
            try {
                console.log(`[Manual SAP Draft] Trying Supabase fallback for invoice ${invoiceId}...`);
                const { data: supaRecord } = await supabase
                    .from('Registro_Facturas')
                    .select('distribuciones, centro_costos')
                    .eq('sharepoint_id', String(invoiceId))
                    .single();
                
                if (supaRecord) {
                    let rawSupa = supaRecord.distribuciones || supaRecord.centro_costos;
                    if (typeof rawSupa === 'string') rawSupa = JSON.parse(rawSupa);
                    if (typeof rawSupa === 'string') rawSupa = JSON.parse(rawSupa);
                    if (!Array.isArray(rawSupa)) rawSupa = rawSupa ? [rawSupa] : [];
                    
                    distribuciones = rawSupa.map((d: any) => ({
                        centroCostos: d.centroCostos || d.centroCosto || d.centro_costos || '',
                        cuenta: d.cuenta || d.Cuenta || '',
                        valor: d.valor || d.Valor || d.monto || 0
                    }));
                    console.log(`[Manual SAP Draft] Got ${distribuciones.length} lines from Supabase fallback.`);
                }
            } catch (supaErr) {
                console.error("[Manual SAP Draft] Supabase fallback error:", supaErr);
            }
        }

        if (distribuciones.length === 0) {
            return NextResponse.json({ 
                success: false, 
                error: 'No se encontraron centros de costos configurados para esta factura.' 
            }, { status: 400 });
        }

        // 4. Trigger SAP Draft Creation
        let sapResult = null;
        try {
            console.log("[Manual SAP Draft] Payload distribuciones:", JSON.stringify(distribuciones, null, 2));
            sapResult = await createSapDraft({
                nit: invoice.Nit!,
                total: invoice["Valor total"]!,
                distribuciones: distribuciones,
                anticipo: invoice.tiene_anticipo ? 't' : 'f',
                observations: invoice.Observaciones || 'Sincronización manual desde portal de aprobación',
                nroFactura: invoice.Nro_Factura!,
                itemId: consecutivoReal,
                proveedorName: proveedorReal
            });

            return NextResponse.json({ 
                success: true, 
                message: 'Documento preliminar creado exitosamente en SAP',
                sap: sapResult 
            });

        } catch (sapErr: any) {
            console.error('[Manual SAP Draft] SAP fail:', sapErr.message);
            
            // LOG ERROR TO SUPABASE
            try {
                await supabase.from('log_errores_sap').insert({
                    factura_id: Number(invoiceId),
                    nro_factura: invoice.Nro_Factura || String(invoiceId),
                    proveedor: proveedorReal,
                    error_mensaje: sapErr.message,
                    detalles: sapErr
                });
            } catch (logErr) {
                console.error('[Manual SAP Draft] Failed to log error to DB:', logErr);
            }

            return NextResponse.json({ 
                success: false, 
                error: sapErr.message 
            }, { status: 500 });
        }

    } catch (error: any) {
        console.error('[Manual SAP Draft] General API error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
