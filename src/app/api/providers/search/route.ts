import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const query = searchParams.get('q');
        const limit = parseInt(searchParams.get('limit') || '20');
        const page = parseInt(searchParams.get('page') || '0');
        let tableName = searchParams.get('table');
        if (!['Proveedores_Viventta', 'Proveedores_con_Responsable'].includes(tableName as string)) {
            tableName = 'proveedores';
        }

        let supabaseQuery = supabase.from(tableName as string);

        if (tableName === 'Proveedores_Viventta') {
            supabaseQuery = supabaseQuery
                .select('"BP Name", "BP Code", "ID", "Responsables"')
                .order('BP Name', { ascending: true });

            if (query && query.length > 0) {
                supabaseQuery = supabaseQuery.or(`"BP Name".ilike.%${query}%,"BP Code".ilike.%${query}%`);
            }
        } else if (tableName === 'Proveedores_con_Responsable') {
            supabaseQuery = supabaseQuery
                .select('"Nit", "Nombre de socio de negocios", "Responsable", "Autorizador"')
                .order('Nombre de socio de negocios', { ascending: true });

            if (query && query.length > 0) {
                supabaseQuery = supabaseQuery.or(`"Nombre de socio de negocios".ilike.%${query}%,"Nit".ilike.%${query}%`);
            }
        } else {
            supabaseQuery = supabaseQuery
                .select('razon_social, numero_identificacion')
                .order('razon_social', { ascending: true });

            if (query && query.length > 0) {
                supabaseQuery = supabaseQuery.or(`razon_social.ilike.%${query}%,numero_identificacion.ilike.%${query}%`);
            }
        }

        const from = page * limit;
        const to = from + limit - 1;

        const { data, error, count } = await supabaseQuery
            .range(from, to);

        if (error) throw error;

        // Normalize response
        const normalizedData = data.map((d: any) => ({
            razon_social: d['BP Name'] || d['Nombre de socio de negocios'] || d.razon_social,
            numero_identificacion: d['BP Code'] || d['Nit'] || d.numero_identificacion,
            identific_: d['ID'] || undefined,
            responsable: d['Responsables'] || d['Responsable'] || d['Autorizador'] || d.aprobado_por || undefined
        }));

        return NextResponse.json({ 
            providers: normalizedData,
            hasMore: data.length === limit
        });
    } catch (error: any) {
        console.error('Error searching providers:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
