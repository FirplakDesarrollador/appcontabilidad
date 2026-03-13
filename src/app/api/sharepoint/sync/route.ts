import { NextResponse } from 'next/server';
import { fetchAllSharePointItems } from '@/lib/sharepoint';
import { supabase } from '@/lib/supabaseClient';

export async function POST() {
    try {
        console.log('Syncing SharePoint to Supabase...');
        const spItems = await fetchAllSharePointItems();

        // Map SharePoint fields to Supabase columns
        const mappedItems = spItems.map(item => ({
            ID: Number(item.id),
            sharepoint_id: String(item.id),
            Nit: item.Nit || item.Title, // 'Title' often holds the NIT in this list
            Proveedor: item.Proveedor,
            Nro_Factura: item.Nro_Factura,
            Aprobacion_Doliente: item.Aprobacion_Doliente,
            Gestion_Contabilidad: item.Gestion_Contabilidad,
            Observaciones: item.Observaciones,
            Consecutivo: item.Consecutivo,
            // Try different possible internal names for the responsible person
            Responsable_de_Autorizar: item.Responsable_de_Autorizar || 
                                     item.ResponsabledeAutorizar || 
                                     item.Responsable_x0020_de_x0020_Autor ||
                                     item.DigitadoPor, // Fallback to DigitadoPor if nothing else
            FechaAprobacion: item.FechaAprobacion,
            centro_costos: item.centro_costos,
            "Valor total": item["Valor total"] || item.Valor_total || item.Valortotal,
            tiene_anticipo: item.tiene_anticipo,
            Creado: item.Created || item.Creado,
            "Creado por": item["Creado por"] || item.Creado_por,
            CUFE: item.CUFE,
            InformeRecepcion: item.InformeRecepcion,
            FechaProcesado: item.FechaProcesado,
            DigitadoPor: item.DigitadoPor,
            "Datos adjuntos": item["Datos adjuntos"] || item.Datos_adjuntos,
            tablaCostos: item.tablaCostos,
            Procesado: item.Procesado ? String(item.Procesado) : null,
            Modificado: item.Modified || item.Modificado,
            "Modificado por": item["Modificado por"] || item.Modificado_por,
            fp: item.fp,
        }));

        // Deduplicate items by Nro_Factura to avoid "ON CONFLICT DO UPDATE command cannot affect row a second time"
        const uniqueItemsMap = new Map();
        mappedItems.forEach(item => {
            if (item.Nro_Factura) {
                // Keep the latest one if there are duplicates (SharePoint ID is usually sequential)
                uniqueItemsMap.set(item.Nro_Factura, item);
            }
        });
        const deduplicatedItems = Array.from(uniqueItemsMap.values());

        // Upsert into Supabase in batches of 500 to avoid request limits
        const batchSize = 500;
        let totalUpserted = 0;

        for (let i = 0; i < deduplicatedItems.length; i += batchSize) {
            const batch = deduplicatedItems.slice(i, i + batchSize);
            const { error } = await supabase
                .from('Registro_Facturas')
                .upsert(batch, { onConflict: 'Nro_Factura' });

            if (error) {
                console.error(`Error upserting batch ${i / batchSize + 1}:`, error);
                throw error;
            }
            totalUpserted += batch.length;
            console.log(`Upserted ${totalUpserted} items into Supabase...`);
        }

        return NextResponse.json({
            success: true,
            message: `Sincronización completada: ${totalUpserted} registros procesados.`
        });

    } catch (error: any) {
        console.error('SharePoint sync API error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
