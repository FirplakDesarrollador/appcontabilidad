import { NextRequest, NextResponse } from 'next/server';
import { getGraphClient } from '@/lib/sharepoint';

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const itemId = searchParams.get('itemId');

    if (!itemId) return new Response('ID de item faltante', { status: 400 });

    try {
        console.log(`[Proxy] Starting direct SharePoint PDF fetch for Item ID: ${itemId}`);
        const client = await getGraphClient();

        // 1. Obtener Metadatos (Nit, Nro_Factura) desde la lista original (FPKContabilidad)
        const siteFPK = await client.api('/sites/firplaksa.sharepoint.com:/sites/FPKContabilidad').get();
        const siteIdFPK = siteFPK.id;
        
        // Buscamos la lista
        const listsRes = await client.api(`/sites/${siteIdFPK}/lists`).get();
        const list = listsRes.value.find((l: any) => l.name === 'Registro_de_Facturas' || l.displayName === 'Registro_de_Facturas');
        if (!list) throw new Error('Lista Registro_de_Facturas no encontrada');

        // Obtenemos los campos del ítem
        const itemRes = await client.api(`/sites/${siteIdFPK}/lists/${list.id}/items/${itemId}/fields`).get();
        const nit = itemRes.Nit || '';
        const nroFactura = itemRes.Nro_Factura || '';

        if (!nit || !nroFactura) {
            console.error(`[Proxy] Metadata missing in SP: Nit="${nit}", Nro_Factura="${nroFactura}"`);
            // Redirigir como fallback si no hay metadatos para buscar
            return NextResponse.redirect(`https://firplaksa.sharepoint.com/sites/FPKContabilidad/Lists/Registro_de_Facturas/DispForm.aspx?ID=${itemId}`);
        }

        console.log(`[Proxy] Found Metadata: Factura=${nroFactura}, NIT=${nit}`);

        // 2. Buscar en ITPowerApps -> Reenvio facture
        const siteIT = await client.api('/sites/firplaksa.sharepoint.com:/sites/ITPowerApps').get();
        const siteIdIT = siteIT.id;

        const cleanNit = nit.replace(/[^0-9]/g, '');
        const simpleNro = nroFactura.replace(/^0+/, ''); // Quitar ceros a la izquierda
        
        console.log(`[Proxy] Searching IT PowerApps for carpeta con: "${simpleNro}"`);
        
        // Buscamos ítems que coincidan con el número de factura
        const searchRes = await client.api(`/sites/${siteIdIT}/drive/root:/Reenvio facture:/search(q='${simpleNro}')`).get();
        
        // Filtramos por la nomenclatura exacta: FACTURA-UBL(NIT;NRO;...
        const match = (searchRes.value || []).find((f: any) => {
            if (!f.folder) return false;
            const name = f.name.toUpperCase();
            return name.includes('FACTURA-UBL') && 
                   (name.includes(cleanNit) || name.includes(nit.toUpperCase())) && 
                   (name.includes(`;${nroFactura};`) || name.includes(`;${simpleNro};`) || name.includes(`(${cleanNit};${simpleNro}`));
        });

        if (match) {
            console.log(`[Proxy] Match found in IT PowerApps: ${match.name}`);
            
            // Listamos hijos para encontrar el PDF
            const children = await client.api(`/drives/${match.parentReference.driveId}/items/${match.id}/children`).get();
            const pdfFile = children.value.find((c: any) => c.name.toLowerCase().endsWith('.pdf'));

            if (pdfFile) {
                console.log(`[Proxy] Serving PDF: ${pdfFile.name}`);
                const contentStream = await client.api(`/drives/${match.parentReference.driveId}/items/${pdfFile.id}/content`).get();
                
                let buffer: Buffer;
                if (contentStream instanceof Buffer) {
                    buffer = contentStream;
                } else {
                    const chunks = [];
                    for await (const chunk of contentStream) chunks.push(chunk);
                    buffer = Buffer.concat(chunks);
                }

                const response = new NextResponse(new Uint8Array(buffer));
                response.headers.set('Content-Type', 'application/pdf');
                response.headers.set('Content-Disposition', `inline; filename="${pdfFile.name}"`);
                return response;
            } else {
                console.warn(`[Proxy] Folder found but no PDF inside: ${match.name}`);
            }
        } else {
            console.warn(`[Proxy] No folder match found in IT PowerApps for ${nroFactura}`);
        }

        // 3. Fallback Final: Si nada funciona, redirigir al formulario de SharePoint
        const baseUrl = 'https://firplaksa.sharepoint.com/sites/FPKContabilidad';
        return NextResponse.redirect(`${baseUrl}/Lists/Registro_de_Facturas/DispForm.aspx?ID=${itemId}`);

    } catch (error: any) {
        console.error('[Proxy Error]:', error.message);
        return new Response(`Error al recuperar el PDF desde SharePoint: ${error.message}`, { status: 500 });
    }
}
