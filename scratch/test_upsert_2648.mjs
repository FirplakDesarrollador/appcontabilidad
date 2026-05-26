import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    'https://zohdtksgxhbheaftgmsi.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvaGR0a3NneGhiaGVhZnRnbXNpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTcyMjk2MTE1MSwiZXhwIjoyMDM4NTM3MTUxfQ.Y-OdRzGTe0llD1VRPYxyUIo1man7MCeABlMrZVuAqus'
);

async function test() {
    const data = {
        id: 2648,
        sharepoint_id: "2648",
        nit: "444444781",
        proveedor: "1520 MAIN STREET",
        valor_total: 0,
        consecutivo: "S/N",
        aprobacion_doliente: "Aprobado",
        gestion_contabilidad: "Pendiente",
        observaciones: null,
        responsable_nombre: "Esteban Muñoz García",
        tiene_anticipo: "Con anticipo",
        centro_costos: '[{"centroCosto":"GV-CAOBR - COSTA ATLANTICA OBRAS","cuenta":"52054505 - AUXILIO ALIMENTACION","valor":"0"}]',
        updated_at: new Date().toISOString()
    };

    console.log('Upserting...', data);
    const { data: resData, error } = await supabase
        .from('Documento_Soporte')
        .upsert(data, { onConflict: 'id' })
        .select();

    if (error) {
        console.error('Upsert failed:', error);
    } else {
        console.log('Upsert succeeded! Returned data:', resData);
    }
}

test();
