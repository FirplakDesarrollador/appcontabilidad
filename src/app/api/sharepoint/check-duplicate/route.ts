
import { NextRequest, NextResponse } from 'next/server';
import { getGraphClient } from '@/lib/sharepoint';

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const nit = searchParams.get('nit');
        const nroFactura = searchParams.get('nroFactura');

        if (!nit || !nroFactura) {
            return NextResponse.json({ exists: false });
        }

        const client = await getGraphClient();
        const siteFPK = await client.api('/sites/firplaksa.sharepoint.com:/sites/FPKContabilidad').get();
        const siteIdFPK = siteFPK.id;

        const existingItems = await client.api(`/sites/${siteIdFPK}/lists/Registro_de_Facturas/items`)
            .header('Prefer', 'HonorNonIndexedQueriesWarningMayFailRandomly')
            .expand('fields')
            .filter(`fields/Nro_Factura eq '${nroFactura}' and fields/Title eq '${nit}'`)
            .get();

        const exists = existingItems.value && existingItems.value.length > 0;

        return NextResponse.json({ 
            exists,
            message: exists ? `La factura ${nroFactura} ya está registrada para este proveedor.` : null
        });

    } catch (error: any) {
        console.error('Error checking duplicate:', error);
        return NextResponse.json({ exists: false, error: error.message }, { status: 500 });
    }
}
