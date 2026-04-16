import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { updateSharePointInvoiceStatus } from '@/lib/sharepoint';
import { createSapDraft } from '@/lib/sap';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
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

        // 1. Fetch invoice data
        const { data: invoice, error: fetchError } = await supabase
            .from('Registro_Facturas')
            .select('Nro_Factura, Proveedor, Nit, Responsable_de_Autorizar, Observaciones, centro_costos, "Valor total", tiene_anticipo')
            .eq('ID', id)
            .single();

        if (fetchError || !invoice) throw new Error('No se encontró la factura en la base de datos');

        // 2. Update Supabase
        const { error: updateError } = await supabase
            .from('Registro_Facturas')
            .update({
                Aprobacion_Doliente: action,
                FechaProcesado: new Date().toISOString(),
                Procesado: 'true'
            })
            .eq('ID', id);

        if (updateError) throw updateError;

        // 3. Update SharePoint and trigger SAP
        let sapResult = null;
        try {
            await updateSharePointInvoiceStatus(invoice.Nro_Factura!, action);
            
            if (action === 'Aprobado') {
                console.log(`Public Action: Triggering SAP Draft for invoice ${invoice.Nro_Factura}`);
                
                const { getSharePointInvoiceById } = await import('@/lib/sharepoint');
                const spItem = await getSharePointInvoiceById(id);
                const consecutivoReal = spItem.Consecutivo || id;
                const proveedorReal = spItem.Proveedor || invoice.Proveedor || "Proveedor Desconocido";

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
                        total: invoice["Valor total"]!,
                        distribuciones: distribuciones,
                        anticipo: invoice.tiene_anticipo ? 't' : 'f',
                        observations: invoice.Observaciones || 'Aprobado vía link rápido',
                        nroFactura: invoice.Nro_Factura!,
                        itemId: consecutivoReal,
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
        } catch (spError: any) {
            console.error('Action processing failed:', spError.message);
            // We don't return 500 here if Supabase already updated successfully,
            // but we inform the user about the partial failure.
            return NextResponse.json({ 
                success: true, 
                warning: `Acción registrada en portal, pero falló sincronización: ${spError.message}` 
            });
        }

        return NextResponse.json({ 
            success: true, 
            sap: sapResult 
        });
    } catch (error: any) {
        console.error('Public action API error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
