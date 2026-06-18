import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    'https://zohdtksgxhbheaftgmsi.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvaGR0a3NneGhiaGVhZnRnbXNpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTcyMjk2MTE1MSwiZXhwIjoyMDM4NTM3MTUxfQ.Y-OdRzGTe0llD1VRPYxyUIo1man7MCeABlMrZVuAqus'
);

async function test() {
    try {
        console.log('Fetching items from API...');
        const res = await fetch('http://localhost:3000/api/sharepoint/documentos/all?refresh=true');
        const data = await res.json();
        const items = data.items;
        console.log('Fetched items:', items.length);

        const upsertData = items.map((item) => ({
            id: Number(item.id),
            sharepoint_id: String(item.id),
            nit: item.Title || "N/A",
            proveedor: item.tsic || "N/A",
            valor_total: item.Valortotal || 0,
            consecutivo: item.Consecutivo_Doc_Soporte ? String(item.Consecutivo_Doc_Soporte) : "S/N",
            aprobacion_doliente: item.AprobacionDoliente || "Pendiente",
            gestion_contabilidad: item.Gestion_Contabilidad || "Pendiente",
            observaciones: item.Observaciones || null,
            responsable_nombre: item.Responsable_de_Autorizar || "Sin asignar",
            tiene_anticipo: item.tiene_anticipo || null,
            centro_costos: item.centro_costos || null,
            updated_at: new Date().toISOString()
        }));

        console.log('Performing bulk upsert of', upsertData.length, 'items...');
        const { error } = await supabase
            .from('Documento_Soporte')
            .upsert(upsertData, { onConflict: 'id' });

        if (error) {
            console.error('Bulk upsert failed:', error);
        } else {
            console.log('Bulk upsert succeeded!');
        }
    } catch (e) {
        console.error('Fatal error:', e);
    }
}

test();
