import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { updateSharePointInvoiceStatus } from '@/lib/sharepoint';

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

        // 1. Fetch invoice data to identify it in SharePoint and for emails
        const { data: invoice, error: fetchError } = await supabase
            .from('Registro_Facturas')
            .select('Nro_Factura, Proveedor, Nit, Responsable_de_Autorizar, Observaciones')
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

        // 3. Update SharePoint and trigger Email (Async/background)
        try {
            await updateSharePointInvoiceStatus(invoice.Nro_Factura!, action);
            

            
        } catch (spError) {
            console.error('Failed to sync with SharePoint or Trigger Notifications:', spError);
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Public action API error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
