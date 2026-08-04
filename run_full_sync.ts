const { fetchAllSharePointItems } = require('./src/lib/sharepoint');
const { createClient } = require('@supabase/supabase-js');

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function run() {
    console.log('[FULL-SYNC] Starting full one-time synchronization from SharePoint...');
    const spItems = await fetchAllSharePointItems('Registro_de_Facturas');
    console.log(`[FULL-SYNC] Retrieved ${spItems.length} items from SharePoint.`);
    
    const batchSize = 100;
    let inserted = 0;
    
    for (let i = 0; i < spItems.length; i += batchSize) {
        const chunk = spItems.slice(i, i + batchSize);
        const mappedChunk = chunk.map((item) => {
            const hasAttachmentsFlag = item.Attachments === true || Number(item.Datos_adjuntos) > 0 || !!item.fp || !!item.documentos;
            
            return {
                ID: Number(item.id),
                sharepoint_id: String(item.id),
                Nit: item.Nit ?? item.Title ?? item.LinkTitle ?? null,
                Proveedor: item.Proveedor ?? null,
                Nro_Factura: item.Nro_Factura ?? null,
                Valor_antes_de_IVA: item.Valor_antes_de_IVA ?? item.Valor_Factura ?? null,
                IVA: item.IVA ?? null,
                Total_Factura: item.Total_Factura ?? null,
                Fecha_Factura: item.Fecha_Factura ?? null,
                Vencimiento: item.Vencimiento ?? null,
                Orden_de_Compra: item.Orden_de_Compra ?? null,
                Aprobacion_Doliente: item.Aprobacion_Doliente ?? null,
                AprobadorLookupId: item.AprobadorLookupId ? String(item.AprobadorLookupId) : (item.Aprobador ?? null),
                Observacion_Doliente: item.Observacion_Doliente ?? null,
                Gestion_Contabilidad: item.Gestion_Contabilidad ?? null,
                Observacion_Contabilidad: item.Observacion_Contabilidad ?? null,
                Creado: item.Created ?? item.Creado ?? null,
                Creado_por: item.AuthorLookupId ? String(item.AuthorLookupId) : (item["Creado por"] ?? item.Creado_por ?? null),
                CUFE: item.CUFE ?? null,
                InformeRecepcion: item.InformeRecepcion ?? null,
                FechaProcesado: item.FechaProcesado ?? null,
                DigitadoPor: (item.DigitadoPor && item.DigitadoPor !== 'SharePoint App') ? item.DigitadoPor : undefined,
                Datos_adjuntos: hasAttachmentsFlag ? 1 : 0,
                tablaCostos: item.tablaCostos ?? null,
                Procesado: item.Procesado != null ? String(item.Procesado) : null,
                Modificado: item.Modified ?? item.Modificado ?? null,
                Modificado_por: item.EditorLookupId ? String(item.EditorLookupId) : (item["Modificado por"] ?? item.Modificado_por ?? null),
                fp: item.fp ?? null,
                documentos: item.fp ?? item.documentos ?? null,
                updated_at: new Date().toISOString()
            };
        });
        
        await supabaseAdmin.from('Registro_Facturas').upsert(mappedChunk, { onConflict: 'ID' });
        inserted += chunk.length;
        console.log(`Upserted ${inserted}`);
    }
    console.log("Done");
}
run().catch(console.error);
