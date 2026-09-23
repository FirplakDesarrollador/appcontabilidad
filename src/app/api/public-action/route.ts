import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createSapDraft } from '@/lib/sap';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(req: NextRequest) {
    try {
        const { id, action } = await req.json();

        if (!id || !action) {
            return NextResponse.json({ success: false, error: 'Faltan parámetros requeridos' }, { status: 400 });
        }

        if (!['Aprobado', 'Rechazado'].includes(action)) {
            return NextResponse.json({ success: false, error: 'Acción no válida' }, { status: 400 });
        }

        // 1. Fetch invoice data from Supabase (fuente de verdad)
        const { data: invoice, error: fetchError } = await supabase
            .from('Registro_Facturas')
            .select('Nro_Factura, Proveedor, Nit, Consecutivo, Responsable_de_Autorizar, Observaciones, centro_costos, Valor_total, tiene_anticipo')
            .eq('ID', id)
            .single();

        if (fetchError || !invoice) throw new Error('No se encontró la factura en la base de datos');

        // 2. Update Supabase
        const updatePayload: any = {
            Aprobacion_Doliente: action,
            Procesado: 'true',
            updated_at: new Date().toISOString()
        };
        if (action === 'Aprobado') {
            updatePayload.FechaAprobacion = new Date().toISOString();
        }

        const { error: updateError } = await supabase
            .from('Registro_Facturas')
            .update(updatePayload)
            .eq('ID', id);

        if (updateError) throw updateError;

        const consecutivoReal = invoice.Consecutivo || id;
        const proveedorReal = invoice.Proveedor || "Proveedor Desconocido";

        // 3. Trigger SAP Draft on Approval
        let sapResult = null;
        if (action === 'Aprobado') {
            console.log(`Public Action: Triggering SAP Draft for invoice ${invoice.Nro_Factura}`);

            let distribuciones = [];
            try {
                distribuciones = typeof invoice.centro_costos === 'string' 
                    ? JSON.parse(invoice.centro_costos) 
                    : (invoice.centro_costos || []);
            } catch (e) {
                console.error("Error parsing centro_costos for SAP:", e);
            }

            try {
                sapResult = await createSapDraft({
                    nit: invoice.Nit!,
                    total: invoice["Valor_total"]!,
                    distribuciones: distribuciones,
                    anticipo: invoice.tiene_anticipo ? 't' : 'f',
                    observations: invoice.Observaciones || 'Aprobado vía link rápido',
                    nroFactura: invoice.Nro_Factura!,
                    itemId: String(id),
                    consecutivo: consecutivoReal,
                    proveedorName: proveedorReal
                });
            } catch (sapErr: any) {
                console.error('Failed to trigger SAP Draft registration:', sapErr.message);
                sapResult = { success: false, error: sapErr.message };

                // LOG ERROR TO SUPABASE
                try {
                    await supabase.from('Log_Errores_SAP').insert({
                        factura_id: id,
                        nro_factura: invoice.Nro_Factura || id,
                        proveedor: proveedorReal,
                        error_mensaje: sapErr.message,
                        detalles: sapErr
                    });
                } catch (logErr) {
                    console.error('Failed to log SAP error to database:', logErr);
                }
            }
        }
        
        // 4. Enviar Notificación por Webhook de Power Automate
        if (action === 'Aprobado' || action === 'Rechazado') {
            try {
                const { sendApprovalNotification } = await import('@/lib/sendApprovalNotification');
                await sendApprovalNotification({
                    factura: invoice.Nro_Factura || String(id),
                    proveedor: proveedorReal,
                    nit: invoice.Nit || "",
                    responsable_aprobacion: invoice.Responsable_de_Autorizar || "Responsable Desconocido",
                    estado_aprobacion: action === 'Aprobado' ? "Aprobada" : "Rechazada",
                    observaciones: invoice.Observaciones || (action === 'Aprobado' ? 'Aprobado vía link' : 'Rechazado vía link')
                });
            } catch (notifyErr) {
                console.error('Failed to send approval notification:', notifyErr);
            }
        }

        // 5. Enviar evento Facture (Aprobado o Rechazado)
        let factureResult: any = null;
        if (action === 'Aprobado' || action === 'Rechazado') {
            try {
                const { triggerFactureEventForInvoice } = await import('@/lib/facture');
                factureResult = await triggerFactureEventForInvoice(id, action);
            } catch (factureErr: any) {
                console.error('Failed to trigger Facture event:', factureErr);
                factureResult = { success: false, error: factureErr?.message };
            }
        }

        return NextResponse.json({ 
            success: true, 
            consecutivo: consecutivoReal,
            sap: sapResult,
            facture: factureResult
        });
    } catch (error: any) {
        console.error('Public action API error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

