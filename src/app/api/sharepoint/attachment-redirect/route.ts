import { NextRequest, NextResponse } from 'next/server';
import { getSharePointInvoiceById, getGraphClient } from '@/lib/sharepoint';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const itemId = searchParams.get('itemId');

    if (!itemId) return new Response('ID de item faltante', { status: 400 });

    try {
        // 1. Prioridad 1: Buscar en Supabase (Archivos ya migrados)
        const { data: dbInv } = await supabase
            .from('Registro_Facturas')
            .select('documentos, Nit, Nro_Factura, Created')
            .eq('ID', itemId)
            .single();

        if (dbInv?.documentos) {
            let storageUrl = dbInv.documentos;
            if (storageUrl.startsWith('[')) {
                try {
                    const docs = JSON.parse(storageUrl);
                    storageUrl = docs.find((d: string) => d.toLowerCase().endsWith('.pdf')) || docs[0];
                } catch (e) {}
            }

            if (storageUrl.includes('/storage/v1/object/public/facturas-documentos/')) {
                const storagePath = decodeURIComponent(storageUrl.split('/facturas-documentos/')[1]);
                console.log(`[Proxy] Serving from Supabase: ${storagePath}`);
                
                const { data, error } = await supabase.storage.from('facturas-documentos').download(storagePath);
                if (!error && data) {
                    const response = new NextResponse(data);
                    response.headers.set('Content-Type', storagePath.toLowerCase().endsWith('.xml') ? 'text/xml' : 'application/pdf');
                    response.headers.set('Content-Disposition', `inline; filename="${storagePath.split('/').pop()}"`);
                    return response;
                }
            }
        }

        // 2. Prioridad 2: Buscar en tiempo real en SharePoint 'Reenvio facture' (ITPowerApps)
        // Usamos la misma lógica que el botón de prueba pero dinamizada por el itemId
        const nit = dbInv?.Nit || '';
        const nroFactura = dbInv?.Nro_Factura || '';
        const fecha = dbInv?.Created ? dbInv.Created.split('T')[0] : '';

        if (nit && nroFactura) {
            console.log(`[Proxy] Searching SharePoint for Factura: ${nroFactura}, NIT: ${nit}`);
            const client = await getGraphClient();
            const site = await client.api('/sites/firplaksa.sharepoint.com:/sites/ITPowerApps').get();
            const siteId = site.id;

            // Búsqueda profunda en la carpeta de reenvío
            const cleanNit = nit.replace(/[^0-9]/g, '');
            const query = nroFactura;
            const searchRes = await client.api(`/sites/${siteId}/drive/root:/Reenvio facture:/search(q='${query}')`).get();
            
            const folders = (searchRes.value || []).filter((f: any) => f.folder);
            const match = folders.find((f: any) => f.name.includes(nroFactura) && f.name.includes(cleanNit));

            if (match) {
                console.log(`[Proxy] Found folder in SharePoint: ${match.name}. Fetching PDF...`);
                const children = await client.api(`/drives/${match.parentReference.driveId}/items/${match.id}/children`).get();
                const pdf = children.value.find((c: any) => c.name.toLowerCase().endsWith('.pdf'));

                if (pdf) {
                    const content = await client.api(`/drives/${match.parentReference.driveId}/items/${pdf.id}/content`).get();
                    const chunks = [];
                    for await (const chunk of content) chunks.push(chunk);
                    const buffer = Buffer.concat(chunks);

                    const response = new NextResponse(buffer);
                    response.headers.set('Content-Type', 'application/pdf');
                    response.headers.set('Content-Disposition', `inline; filename="${pdf.name}"`);
                    return response;
                }
            }
        }

        // 3. Fallback Final: Redirigir a SharePoint si falla el proxy
        const baseUrl = 'https://firplaksa.sharepoint.com/sites/FPKContabilidad';
        return NextResponse.redirect(`${baseUrl}/Lists/Registro_de_Facturas/DispForm.aspx?ID=${itemId}`);

    } catch (error: any) {
        console.error('[Proxy Error]:', error.message);
        return new Response(`Error: ${error.message}`, { status: 500 });
    }
}
