import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();

        const nroFactura = (formData.get('nroFactura') as string || '').trim();
        const nit = (formData.get('nit') as string || '').trim();
        const proveedor = (formData.get('proveedor') as string || '').trim();
        const responsableEmail = (formData.get('responsableEmail') as string || '').trim();
        const files = formData.getAll('files') as File[];
        const valorTotal = (formData.get('valorTotal') as string || '').trim();

        if (!nroFactura || !nit || !files || files.length === 0) {
            return NextResponse.json({ error: 'Faltan campos obligatorios (Número, NIT o Archivos)' }, { status: 400 });
        }

        if (!responsableEmail) {
            return NextResponse.json({ error: 'Debes seleccionar un responsable para la factura.' }, { status: 400 });
        }

        // 1. Verificar si la factura ya existe para este proveedor (NIT)
        const normalizedNit = nit.replace(/[^0-9]/g, '');
        const normalizedNro = nroFactura.toUpperCase();

        const { data: candidates, error: dupCheckError } = await supabaseAdmin
            .from('Registro_Facturas')
            .select('ID, Nit, Nro_Factura')
            .ilike('Nro_Factura', `%${normalizedNro}%`);

        if (dupCheckError) {
            console.error('Error checking for duplicates:', dupCheckError.message);
        }

        const isDuplicate = (candidates || []).some(c =>
            (c.Nro_Factura || '').trim().toUpperCase() === normalizedNro &&
            (c.Nit || '').replace(/[^0-9]/g, '') === normalizedNit
        );

        if (isDuplicate) {
            return NextResponse.json({
                error: 'DUPLICATED',
                message: `La factura ${nroFactura} ya está registrada para el proveedor con NIT ${nit}.`
            }, { status: 400 });
        }

        // Normalizar NIT para el almacenamiento
        const cleanNit = nit.split('-')[0].replace(/[^0-9]/g, '');

        // 2. Subir archivos directamente a Supabase Storage
        let firstFileUrl = "";
        const adjuntosData = [];
        
        for (let i = 0; i < files.length; i++) {
            const fileItem = files[i];
            const fileBuffer = await fileItem.arrayBuffer();
            const safeName = fileItem.name.replace(/[^a-zA-Z0-9.-]/g, '_');
            const safeNro = nroFactura.replace(/[^a-zA-Z0-9.-]/g, '_');
            const uniqueFileName = `${cleanNit}_${safeNro}_${Date.now()}_${i}_${safeName}`;
            
            const { error: uploadError } = await supabaseAdmin
                .storage
                .from('adjuntos_facturas')
                .upload(uniqueFileName, fileBuffer, {
                    contentType: fileItem.type || 'application/octet-stream',
                    upsert: true
                });

            if (uploadError) {
                console.error('[Supabase Storage] Error uploading file:', uploadError);
                throw new Error(`Error al subir el archivo ${fileItem.name}: ${uploadError.message}`);
            }

            const { data: publicUrlData } = supabaseAdmin
                .storage
                .from('adjuntos_facturas')
                .getPublicUrl(uniqueFileName);

            const fileUrl = publicUrlData.publicUrl;
            
            adjuntosData.push({
                name: fileItem.name,
                url: fileUrl,
                path: uniqueFileName
            });

            if (i === 0) {
                firstFileUrl = fileUrl;
            }
        }

        // 3. Resolver nombre del responsable desde usuarios o proveedores
        let responsableName: string | null = null;
        try {
            const { data: userMatch } = await supabaseAdmin
                .from('usuarios')
                .select('nombre')
                .ilike('correo', responsableEmail)
                .maybeSingle();

            if (userMatch?.nombre) {
                responsableName = userMatch.nombre;
            } else {
                const { data: provMatch } = await supabaseAdmin
                    .from('Proveedores_con_Responsable')
                    .select('Responsable, Autorizador')
                    .ilike('Correo', responsableEmail)
                    .limit(1);

                if (provMatch && provMatch.length > 0) {
                    responsableName = provMatch[0].Responsable || provMatch[0].Autorizador;
                }
            }
        } catch (_nameErr) {}

        if (!responsableName) {
            responsableName = responsableEmail.split('@')[0].replace('.', ' ');
        }

        // 4. Calcular siguiente consecutivo
        let nextConsecutivoNum: number | null = null;
        try {
            const { data: lastRows } = await supabaseAdmin
                .from('Registro_Facturas')
                .select('Consecutivo')
                .not('Consecutivo', 'is', null)
                .order('ID', { ascending: false })
                .limit(30);

            if (lastRows && lastRows.length > 0) {
                let maxNum = 103000;
                for (const row of lastRows) {
                    if (row.Consecutivo) {
                        const num = parseInt(String(row.Consecutivo).replace(/\D/g, ''), 10);
                        if (!isNaN(num) && num > maxNum) maxNum = num;
                    }
                }
                nextConsecutivoNum = maxNum + 1;
            }
        } catch (_cErr) {}

        // 5. Guardar en Supabase (Registro_Facturas)
        const generatedId = Number(BigInt(Date.now()) * BigInt(1000) + BigInt(Math.floor(Math.random() * 1000)));
        const isNC = nroFactura.toUpperCase().startsWith('NC');
        const tipoLabel = isNC ? 'Nota Crédito' : 'Factura';

        const invoiceData: Record<string, any> = {
            ID: generatedId,
            Consecutivo: nextConsecutivoNum ? String(nextConsecutivoNum) : null,
            Nit: cleanNit || nit,
            Proveedor: proveedor,
            Nro_Factura: nroFactura,
            Valor_total: valorTotal || '0',
            Responsable_de_Autorizar: responsableName,
            Aprobacion_Doliente: 'Por Aprobar',
            Gestion_Contabilidad: 'Por Procesar',
            Observaciones: `${tipoLabel} cargada directamente en el portal`,
            fp: firstFileUrl,
            documentos: firstFileUrl,
            Datos_adjuntos: files.length,
            adjuntos_url: JSON.stringify(adjuntosData),
            Creado: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        const { error: insertError } = await supabaseAdmin
            .from('Registro_Facturas')
            .insert(invoiceData);

        if (insertError) {
            console.error('Error insertando en Registro_Facturas:', insertError);
            throw new Error(`Error al registrar en base de datos: ${insertError.message}`);
        }

        // 6. Auto-registrar proveedor en Proveedores_con_Responsable si no existe
        if (responsableEmail && responsableName) {
            try {
                const baseNit = nit.includes('-') ? nit.split('-')[0] : nit;
                const { data: existingProvider } = await supabaseAdmin
                    .from("Proveedores_con_Responsable")
                    .select('"Nit"')
                    .like("Nit", `${baseNit}%`)
                    .limit(1);

                if (!existingProvider || existingProvider.length === 0) {
                    await supabaseAdmin.from("Proveedores_con_Responsable").insert({
                        "Nit": nit,
                        "Nombre de socio de negocios": proveedor,
                        "Responsable": responsableName,
                        "Autorizador": responsableName,
                        "Correo": responsableEmail.toLowerCase(),
                        "Creado": new Date().toISOString()
                    });
                    console.log(`[Supabase] Registrado nuevo proveedor con responsable: ${nit} - ${responsableName}`);
                }
            } catch (providerErr) {
                console.error("[Supabase] Error registrando Proveedor_con_Responsable:", providerErr);
            }
        }

        // 7. Notificar a Power Automate (Teams) con el enlace de aprobación
        if (responsableEmail) {
            try {
                const POWER_AUTOMATE_WEBHOOK = "https://8c18912a4169ec67aa9b39bdfb7cc3.10.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/13/workflows/8dee7c5363ad40c9957ff2439f937723/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=TuYk4u4aCqx_kWf4Ix5vS-MeNeUnvJqK6ikrRjyxiss";
                const numVal = parseFloat(String(valorTotal).replace(/[^0-9.-]+/g, '')) || 0;
                const formattedVal = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(numVal);
                const url = `https://appcontabilidad.vercel.app/externo/factura/${generatedId}`;
                const tipoDocText = isNC ? 'la Nota Crédito' : 'la factura';
                const mensaje = `Se ha recibido ${tipoDocText} <strong>${nroFactura}</strong> de <strong>${proveedor}</strong> por valor de <strong>${formattedVal}</strong> para su aprobación.<br><br>👉 <a href="${url}"><strong>Haga clic aquí para revisar y aprobar ${tipoDocText}</strong></a><br><br>Enlace directo: ${url}`;

                await fetch(POWER_AUTOMATE_WEBHOOK, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        responsable: responsableEmail.toLowerCase(),
                        url: url,
                        mensaje: mensaje,
                        link: `<a href="${url}">Haga clic aquí para revisar y aprobar ${tipoDocText}</a>`,
                        titulo: `${tipoLabel} pendiente por aprobar - ${nroFactura}`,
                        contenido: mensaje
                    })
                });
            } catch (notifyErr) {
                console.error("Error notificando a Power Automate:", notifyErr);
            }
        }

        // 8. Auto-aprobación por regla de proveedor
        try {
            const { data: checkData } = await supabaseAdmin
                .from('Registro_Facturas')
                .select('Aprobacion_Doliente, centro_costos')
                .eq('ID', generatedId)
                .single();

            if (checkData && checkData.Aprobacion_Doliente === 'Aprobado') {
                try {
                    const { createSapDraft } = await import('@/lib/sap');
                    await createSapDraft({
                        nit: nit || "",
                        total: valorTotal || "0",
                        distribuciones: checkData.centro_costos ? JSON.parse(checkData.centro_costos) : [],
                        anticipo: 'f',
                        observations: 'Aprobado automáticamente por regla de proveedor',
                        nroFactura: nroFactura || String(generatedId),
                        docTypeDesc: isNC ? 'NOTA CREDITO' : 'FACTURA',
                        itemId: String(generatedId),
                        consecutivo: String(nextConsecutivoNum || generatedId),
                        proveedorName: proveedor || "Proveedor Desconocido"
                    });
                } catch (sapErr: any) {
                    console.error('[Auto-Approve] Error en SAP:', sapErr);
                    await supabaseAdmin.from('log_errores_sap').insert({
                        factura_id: generatedId,
                        nro_factura: nroFactura || String(generatedId),
                        proveedor: proveedor,
                        error_mensaje: sapErr.message,
                        detalles: sapErr
                    });
                }
            }
        } catch (_autoErr) {}

        return NextResponse.json({ 
            success: true, 
            item: {
                id: generatedId,
                ID: generatedId,
                Consecutivo: nextConsecutivoNum,
                Nro_Factura: nroFactura,
                Proveedor: proveedor,
                Nit: nit
            }
        });

    } catch (error: any) {
        console.error('Error in create-invoice API:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
