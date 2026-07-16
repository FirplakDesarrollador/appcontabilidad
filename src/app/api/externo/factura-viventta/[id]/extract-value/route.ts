import { NextRequest, NextResponse } from 'next/server';
import { getGraphClient, findExternalInvoiceDocument, getSharePointInvoiceById } from '@/lib/sharepoint';
import { supabase } from '@/lib/supabaseClient';
import { PdfReader } from 'pdfreader';

export const dynamic = 'force-dynamic';

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: itemId } = await params;

        if (!itemId) {
            return NextResponse.json({ error: 'Missing itemId' }, { status: 400 });
        }

        const client = await getGraphClient();
        const invoiceDetails = await getSharePointInvoiceById(itemId);
        
        const nitValue = invoiceDetails.Title || invoiceDetails.Nit_x0020_ || invoiceDetails["Nit "] || invoiceDetails.Nit || "N/A";
        const nroFactura = invoiceDetails.Nro_Factura;
        let requestFileName = invoiceDetails.documentInfo?.fileName || `factura_${nroFactura || itemId}.pdf`;

        // Si ya tiene un valor válido mayor a 0, podríamos omitirlo, pero el front solo lo llama si es 0.
        // Aún así, procedemos a leer el PDF.

        let fileBuffer: ArrayBuffer | null = null;
        let finalFileName = requestFileName;

        // 1. Try ITPowerApps first
        if (nroFactura && nitValue !== 'N/A') {
            console.log(`[Auto-Extract] Searching for ${nroFactura} in ITPowerApps...`);
            const externalDoc = await findExternalInvoiceDocument(nitValue, nroFactura, "");
            
            if (externalDoc) {
                console.log(`[Auto-Extract] Found external doc: ${externalDoc.fileName}. Fetching content...`);
                try {
                    const response = await client.api(`/drives/${externalDoc.driveId}/items/${externalDoc.id}/content`).get();
                    if (response) {
                        fileBuffer = response;
                        finalFileName = externalDoc.fileName;
                    }
                } catch (extErr) {
                    console.error(`[Auto-Extract] Failed to fetch content from ITPowerApps:`, extErr);
                }
            }
        }

        // 2. Fallback to FPKContabilidad Attachments
        if (!fileBuffer && requestFileName && requestFileName !== 'Ver en SharePoint') {
            console.log(`[Auto-Extract] Falling back to FPKContabilidad attachments for ${requestFileName}...`);
            try {
                const siteResponse = await client.api('/sites/firplaksa.sharepoint.com:/sites/FPKContabilidad').get();
                const siteId = siteResponse.id;
                const listsResponse = await client.api(`/sites/${siteId}/lists`).get();
                const list = listsResponse.value.find((l: any) => l.name === 'Registro_de_Facturas' || l.displayName === 'Registro_de_Facturas');
                
                if (list) {
                    const attResponse = await client.api(`/sites/${siteId}/lists/${list.id}/items/${itemId}/attachments/${requestFileName}/$value`).get();
                    if (attResponse) {
                        fileBuffer = attResponse;
                        finalFileName = requestFileName;
                    }
                }
            } catch (attErr) {
                console.warn(`[Auto-Extract] Failed to fetch attachment from FPKContabilidad:`, attErr);
            }
        }

        if (!fileBuffer) {
            return NextResponse.json({ error: 'No se ha encontrado factura en PDF para extraer valor' }, { status: 404 });
        }

        console.log(`[Auto-Extract] PDF fetched. Converting to Buffer...`);
        
        let bufferObj: Buffer;
        if (typeof (fileBuffer as any).arrayBuffer === 'function') {
            bufferObj = Buffer.from(await (fileBuffer as any).arrayBuffer());
        } else if ((fileBuffer as any)[Symbol.asyncIterator]) {
            const chunks = [];
            for await (const chunk of fileBuffer as any) {
                chunks.push(Buffer.from(chunk));
            }
            bufferObj = Buffer.concat(chunks);
        } else if ((fileBuffer as any).getReader) {
            const chunks = [];
            const reader = (fileBuffer as any).getReader();
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                chunks.push(Buffer.from(value));
            }
            bufferObj = Buffer.concat(chunks);
        } else {
            bufferObj = Buffer.from(fileBuffer as any);
        }

        console.log(`[Auto-Extract] Buffer ready. Parsing with pdfreader...`);
        
        const text = await new Promise<string>((resolve, reject) => {
            let fullText = "";
            new PdfReader().parseBuffer(bufferObj, (err, item) => {
                if (err) reject(err);
                else if (!item) resolve(fullText);
                else if (item.text) fullText += item.text + " ";
            });
        });

        const fs = require('fs');
        fs.writeFileSync('scratch/pdf-50325.txt', text);

        // NOTA: Se usan expresiones MUY ESTRICTAS (\s*[:$]?\s*) para que fallen si hay otras palabras/columnas.
        // Si fallan, el Smart Fallback se encargará de encontrar el valor máximo.
        const regexes = [
            /VALOR PARCIAL\s*[:$]?\s*([\d.,]+)/i,
            /VALOR BRUTO\s*[:$]?\s*([\d.,]+)/i,
            /Total Bruto\s*[:$]?\s*([\d.,]+)/i,
            /SUB\.?TOTAL\s*[:$]?\s*([\d.,]+)/i,
            /Total a Pagar\s*[:$]?\s*([\d.,]+)/i,
            /Total factura\s*[:$]?\s*([\d.,]+)/i,
            /TOTAL\s*[:$]?\s*([\d.,]+)/i
        ];

        let extractedNumber = 0;
        let matchFound = false;

        for (const regex of regexes) {
            const match = text.match(regex);
            if (match && match[1]) {
                let s = match[1].trim();
                // Limpiar formato numérico europeo o latino
                const hasComma = s.includes(',');
                const hasDot = s.includes('.');
                
                if (hasComma && hasDot) {
                    if (s.indexOf('.') < s.indexOf(',')) {
                        s = s.replace(/\./g, '').replace(',', '.');
                    } else {
                        s = s.replace(/,/g, '');
                    }
                } else if (hasComma) {
                    s = s.replace(',', '.');
                }
                const parsedVal = parseFloat(s);
                if (!isNaN(parsedVal) && parsedVal > 0) {
                    extractedNumber = parsedVal;
                    matchFound = true;
                    console.log(`[Auto-Extract] Found value ${extractedNumber} using regex ${regex}`);
                    break;
                }
            }
        }

        // Si no se encontró ninguna coincidencia con las palabras clave, se devuelve 0
        // tal como fue solicitado por el usuario ("si no encuentra esas palabras pes que si ponga 0").
        if (!matchFound) {
            extractedNumber = 0;
        }

        // Update SharePoint
        console.log(`[Auto-Extract] Updating SharePoint item ${itemId} with new value: ${extractedNumber}`);
        try {
            const siteResponse = await client.api('/sites/firplaksa.sharepoint.com:/sites/FPKContabilidad').get();
            const siteId = siteResponse.id;
            const listsResponse = await client.api(`/sites/${siteId}/lists`).get();
            const list = listsResponse.value.find((l: any) => l.name === 'Registro_de_Facturas' || l.displayName === 'Registro_de_Facturas');
            
            if (list) {
                await client.api(`/sites/${siteId}/lists/${list.id}/items/${itemId}/fields`).patch({
                    Valortotal: extractedNumber
                });
            }
        } catch (spErr) {
            console.error(`[Auto-Extract] Failed to update SharePoint:`, spErr);
        }

        // Update Supabase
        console.log(`[Auto-Extract] Updating Supabase item ${itemId} with new value: ${extractedNumber}`);
        try {
            await supabase
                .from('Registro_Facturas')
                .update({ Valor_total: extractedNumber })
                .eq('ID', Number(itemId));
        } catch (supaErr) {
            console.error(`[Auto-Extract] Failed to update Supabase:`, supaErr);
        }

        return NextResponse.json({ success: true, value: extractedNumber, found: true });

    } catch (error: any) {
        console.error('Error in extract-value API:', error);
        return NextResponse.json({ error: error.message || 'Error al procesar la extracción' }, { status: 500 });
    }
}
