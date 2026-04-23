import { NextRequest, NextResponse } from 'next/server';
import { getGraphClient, createSharePointFolder, uploadFileToSharePoint, createSharePointListItem } from '@/lib/sharepoint';

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        
        const nroFactura = formData.get('nroFactura') as string;
        const nit = formData.get('nit') as string;
        const proveedor = formData.get('proveedor') as string;
        const responsableEmail = formData.get('responsableEmail') as string;
        const file = formData.get('file') as File;

        if (!nroFactura || !nit || !file) {
            return NextResponse.json({ error: 'Faltan campos obligatorios (Número, NIT o Archivo)' }, { status: 400 });
        }

        const client = await getGraphClient();

        // 1. Obtener Site ID de FPKContabilidad (para la lista)
        const siteFPK = await client.api('/sites/firplaksa.sharepoint.com:/sites/FPKContabilidad').get();
        const siteIdFPK = siteFPK.id;

        // 2. Verificar si la factura ya existe para este proveedor (NIT)
        // Buscamos en la lista Registro_de_Facturas
        const existingItems = await client.api(`/sites/${siteIdFPK}/lists/Registro_de_Facturas/items`)
            .header('Prefer', 'HonorNonIndexedQueriesWarningMayFailRandomly')
            .expand('fields')
            .filter(`fields/Nro_Factura eq '${nroFactura}' and fields/Title eq '${nit}'`)
            .get();

        if (existingItems.value && existingItems.value.length > 0) {
            return NextResponse.json({ 
                error: 'DUPLICATED', 
                message: `La factura ${nroFactura} ya está registrada para el proveedor con NIT ${nit}.` 
            }, { status: 400 });
        }

        // 3. Obtener Site ID de ITPowerApps (para el PDF)
        const siteIT = await client.api('/sites/firplaksa.sharepoint.com:/sites/ITPowerApps').get();
        const siteIdIT = siteIT.id;

        // 3. Crear carpeta en ITPowerApps/Reenvio facture
        // Formato: FACTURA-UBL(NIT;NRO;FECHA)
        const folderName = `FACTURA-UBL(${nit};${nroFactura};${new Date().toISOString().split('T')[0]})`;
        const folder = await createSharePointFolder(siteIdIT, 'Reenvio facture', folderName);
        const folderId = folder.id;

        // 4. Subir PDF a la carpeta
        const fileBuffer = Buffer.from(await file.arrayBuffer());
        await uploadFileToSharePoint(siteIdIT, folderId, file.name, fileBuffer);

        // 5. Resolver Responsable (Lookup ID)
        let responsableLookupId = null;
        if (responsableEmail) {
            try {
                const userRes = await client.api(`/sites/${siteIdFPK}/lists('User Information List')/items`)
                    .header('Prefer', 'HonorNonIndexedQueriesWarningMayFailRandomly')
                    .expand('fields($select=id,EMail)')
                    .filter(`fields/EMail eq '${responsableEmail}'`)
                    .get();
                
                if (userRes.value && userRes.value.length > 0) {
                    responsableLookupId = userRes.value[0].id;
                }
            } catch (e) {
                console.warn('No se pudo resolver el responsable por email:', responsableEmail);
            }
        }

        // 6. Crear ítem en la lista Registro_de_Facturas
        const fields: Record<string, any> = {
            Title: nit, 
            Nro_Factura: nroFactura,
            Proveedor: proveedor,
            Aprobacion_Doliente: 'Por Aprobar',
            Gestion_Contabilidad: 'Pendiente'
        };

        if (responsableLookupId) {
            fields['ResponsabledeAutorizarLookupId'] = responsableLookupId;
        }

        const newItem = await createSharePointListItem(siteIdFPK, 'Registro_de_Facturas', fields);
        const newItemId = newItem.id;

        // 7. Adjuntar el archivo al ítem de la lista
        try {
            await client.api(`/sites/${siteIdFPK}/lists/Registro_de_Facturas/items/${newItemId}/attachments`).post({
                name: file.name,
                contentBytes: fileBuffer.toString('base64')
            });
        } catch (attachError) {
            console.error('Error al adjuntar archivo al ítem de SharePoint:', attachError);
            // No fallamos el proceso completo si falla el adjunto, ya que el archivo está en la carpeta de IT
        }

        return NextResponse.json({ 
            success: true, 
            item: newItem,
            folder: folderName
        });

    } catch (error: any) {
        console.error('Error in create-invoice API:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
