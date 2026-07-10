import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function main() {
    try {
        const idsToUpdate = [51164, 51166, 51167, 51168];
        console.log(`Force updating IDs ${idsToUpdate.join(', ')} to 'Por Aprobar' in Supabase...`);
        
        const { data, error } = await supabase
            .from('Registro_Facturas')
            .update({ Aprobacion_Doliente: 'Por Aprobar' })
            .in('ID', idsToUpdate)
            .select('ID, Aprobacion_Doliente');
            
        if (error) throw error;
        
        console.log("Update result:");
        console.log(data);
    } catch (e) {
        console.error("Error:", e);
    }
}

main();
