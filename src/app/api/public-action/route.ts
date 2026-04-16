import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { updateSharePointInvoiceStatus } from '@/lib/sharepoint';
import { createSapDraft } from '@/lib/sap';

// Use the service role key for backend operations if necessary, 
// or the anon key if RLS allows the update.
// For this specific task, we'll use the regular client but ensure we have environment variables.
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

        // 1. Fetch invoice data to identify it in SharePoint and for SAP
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

        // 3. Update SharePoint and trigger SAP Draft (Async/background-ish)
        let sapResult = null;
        try {
            await updateSharePointInvoiceStatus(invoice.Nro_Factura!, action);
            
            // Trigger SAP Draft if approved
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

                sapResult = await createSapDraft({
                    nit: invoice.Nit!,
                    total: invoice["Valor total"]!,
                    distribuciones: distribuciones,
                    anticipo: invoice.tiene_anticipo ? 't' : 'f',
                    observations: `Proveedor: ${invoice.Proveedor || 'N/A'} - ${invoice.Observaciones || 'Aprobado vía link de aprobación rápida'}`,
                    nroFactura: invoice.Nro_Factura!,
                    itemId: invoice.Consecutivo
                });
            }
        } catch (spError) {
            console.error('Failed to sync with SharePoint or Trigger SAP:', spError);
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
