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

        // 1. Fetch invoice data from Supabase Registro_Facturas
        const { data: invoice, error: fetchError } = await supabase
            .from('Registro_Facturas')
            .select('Nro_Factura, Proveedor, Nit, Responsable_de_Autorizar, Observaciones, centro_costos, "Valor total", tiene_anticipo')
            .eq('ID', invoiceId)
            .single();

        if (fetchError || !invoice) {
            console.error(`[Manual SAP Draft] Supabase fetch error:`, fetchError);
            throw new Error(`Invoice ${invoiceId} not found in database`);
        }

        // 2. Fetch extra data from SharePoint (Consecutivo, Proveedor real)
        let consecutivoReal = invoiceId;
        let proveedorReal = invoice.Proveedor || "Proveedor Desconocido";
        
        try {
            const spItem = await getSharePointInvoiceById(String(invoiceId));
            consecutivoReal = spItem.Consecutivo || invoiceId;
            proveedorReal = spItem.Proveedor || invoice.Proveedor || "Proveedor Desconocido";
            console.log(`[Manual SAP Draft] SharePoint data: Consecutivo=${consecutivoReal}, Proveedor=${proveedorReal}`);
        } catch (spErr: any) {
            console.warn(`[Manual SAP Draft] Failed to fetch SharePoint data for item ${invoiceId}:`, spErr.message);
            // We continue with what we have from Supabase
        }

        // 3. Prepare distribution lines
        let distribuciones = [];
        try {
            distribuciones = typeof invoice.centro_costos === 'string' 
                ? JSON.parse(invoice.centro_costos) 
                : (invoice.centro_costos || []);
        } catch (e) {
            console.error("[Manual SAP Draft] Error parsing centro_costos:", e);
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
                await supabase.from('Log_Errores_SAP').insert({
                    factura_id: invoiceId,
                    nro_factura: invoice.Nro_Factura || invoiceId,
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
