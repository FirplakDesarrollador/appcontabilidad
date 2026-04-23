import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getGraphClient, createSharePointFolder, uploadFileToSharePoint, createSharePointListItem, getSharePointRESTToken } from '@/lib/sharepoint';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

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

        // Normalizar NIT para la carpeta y búsqueda (quitar puntos, guiones y DV si es necesario)
        const cleanNit = nit.split('-')[0].replace(/[^0-9]/g, '');

        // 3. Crear carpeta en ITPowerApps/Reenvio facture
        // Formato: FACTURA-UBL(NIT;NRO;FECHA)
        // Usamos el NIT normalizado para consistencia con el proxy
        const folderName = `FACTURA-UBL(${cleanNit};${nroFactura};${new Date().toISOString().split('T')[0]})`;
        const folder = await createSharePointFolder(siteIdIT, 'Reenvio facture', folderName);
        const folderId = folder.id;

        // 4. Subir PDF a la carpeta
        const fileBuffer = Buffer.from(await file.arrayBuffer());
        const uploadedFile = await uploadFileToSharePoint(siteIdIT, folderId, file.name, fileBuffer);
        const fileUrl = uploadedFile.webUrl || `https://firplaksa.sharepoint.com/sites/ITPowerApps/Reenvio%20facture/${encodeURIComponent(folderName)}/${encodeURIComponent(file.name)}`;

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

        const fields: Record<string, any> = {
            Title: nit, 
            Nro_Factura: nroFactura,
            Proveedor: proveedor,
            Aprobacion_Doliente: 'Por Aprobar',
            Gestion_Contabilidad: 'Pendiente',
            fp: fileUrl
        };

        if (responsableLookupId) {
            fields['ResponsabledeAutorizarLookupId'] = responsableLookupId;
        }

        const newItem = await createSharePointListItem(siteIdFPK, 'Registro_de_Facturas', fields);
        const newItemId = newItem.id;

        // 7. Adjuntar el archivo al ítem de la lista usando la API de REST (más confiable para adjuntos)
        try {
            const restToken = await getSharePointRESTToken();
            if (restToken) {
                const spBaseUrl = 'https://firplaksa.sharepoint.com/sites/FPKContabilidad';
                // El nombre del archivo debe estar escapado para OData (comillas simples dobles)
                const escapedFileName = file.name.replace(/'/g, "''");
                // Pero el resto del nombre puede tener espacios, así que usamos encodeURIComponent para la URL completa del endpoint si es necesario, 
                // aunque SharePoint suele preferir el nombre tal cual dentro de las comillas de la función add.
                const attachUrl = `${spBaseUrl}/_api/web/lists/getbytitle('Registro_de_Facturas')/items(${newItemId})/AttachmentFiles/add(FileName='${escapedFileName}')`;
                
                console.log(`[SharePoint] Attaching file to item ${newItemId} via REST...`);

                // A veces SharePoint requiere X-RequestDigest incluso con Bearer Token para adjuntos
                let digest = "";
                try {
                    const digestRes = await fetch(`${spBaseUrl}/_api/contextinfo`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${restToken}`,
                            'Accept': 'application/json;odata=verbose',
                        }
                    });
                    if (digestRes.ok) {
                        const digestData = await digestRes.json();
                        digest = digestData.d.GetContextWebInformation.FormDigestValue;
                    }
                } catch (e) {
                    console.warn('[SharePoint] Could not fetch digest, proceeding without it...');
                }
                
                const attachRes = await fetch(attachUrl, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${restToken}`,
                        'Accept': 'application/json;odata=verbose',
                        'Content-Type': file.type || 'application/pdf',
                        ...(digest ? { 'X-RequestDigest': digest } : {})
                    },
                    body: fileBuffer
                });

                if (!attachRes.ok) {
                    const errorText = await attachRes.text();
                    console.error('[SharePoint REST Error] Status:', attachRes.status, 'Body:', errorText);
                    // Si falla por falta de digest, intentar obtenerlo (aunque con OAuth no suele ser necesario)
                } else {
                    console.log('[SharePoint] File attached successfully to item', newItemId);
                }
            }
        } catch (attachError) {
            console.error('Error al adjuntar archivo al ítem de SharePoint:', attachError);
        }

        // 8. Upsert en Supabase para visibilidad inmediata
        try {
            const invoiceData = {
                ID: Number(newItemId),
                sharepoint_id: String(newItemId),
                Nit: nit,
                Proveedor: proveedor,
                Nro_Factura: nroFactura,
                Aprobacion_Doliente: 'Por Aprobar',
                Gestion_Contabilidad: 'Pendiente',
                fp: fileUrl,
                documentos: fileUrl,
                "Datos adjuntos": 1,
                Creado: new Date().toISOString(),
            };

            const { error: supabaseError } = await supabaseAdmin
                .from('Registro_Facturas')
                .upsert(invoiceData, { onConflict: 'ID' });

            if (supabaseError) {
                console.error('Error al sincronizar con Supabase inmediatamente:', supabaseError.message);
            }
        } catch (supabaseCatchError) {
            console.error('Error fatal al sincronizar con Supabase:', supabaseCatchError);
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
