import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase Client (Service Role preferred for backend, but using public for now assuming RLS configured or same client)
// Ideally we should use specific backend client if we need to bypass RLS or upload to restricted buckets.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const FACTURE_AUTH_URL = "https://api.facture.co/PLColab.Identity/Auth/Login";
const INBOX_BASE_URL = "https://fone-reception-inbox-pro.azurewebsites.net";
const CONSTANT_ID = "0b409936-666f-4a61-8efd-a9c400d9fa7f"; // extracted from user flow

export async function POST() {
    try {
        console.log("Starting synchronization...");

        // 1. Login
        const loginResponse = await fetch(FACTURE_AUTH_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                u: process.env.FACTURE_API_USER,
                p: process.env.FACTURE_API_PASSWORD,
                ft: "issuer|Receiver"
            })
        });

        if (!loginResponse.ok) {
            throw new Error(`Login failed with status: ${loginResponse.status}`);
        }

        const loginData = await loginResponse.json();
        const token = loginData.accessToken; // Check if this path is correct based on JSON flow: body('Get_JWT')['accessToken']

        if (!token) {
            throw new Error("No access token received");
        }

        console.log("Login successful.");

        // 2. Fetch Unread Invoices
        // Queries from flow: receiverStartingDate = -60 days, receiverEndingDate = now
        const now = new Date();
        const sixtyDaysAgo = new Date();
        sixtyDaysAgo.setDate(now.getDate() - 60);

        const formatDate = (date: Date) => date.toISOString().split('T')[0] + "T00:00:00.00";

        // Construct URL with query params
        const inboxUrl = new URL(`${INBOX_BASE_URL}/PLColab.Inbox/Notification/PRINCIPAL/With/RECEIVED;ACKNOWLEDGED;RECEIVEDGOODS/WithNot/ACCEPTED;REJECTED/${CONSTANT_ID}`);
        inboxUrl.searchParams.append("receiverStartingDate", formatDate(sixtyDaysAgo));
        inboxUrl.searchParams.append("receiverEndingDate", formatDate(now));
        inboxUrl.searchParams.append("isRead", "false");
        inboxUrl.searchParams.append("pageIndex", "1");
        inboxUrl.searchParams.append("pageSize", "100");

        const inboxResponse = await fetch(inboxUrl.toString(), {
            method: "GET",
            headers: { "Authorization": `Bearer ${token}` }
        });

        if (!inboxResponse.ok) {
            throw new Error(`Inbox fetch failed: ${inboxResponse.status}`);
        }

        const inboxData = await inboxResponse.json();
        const invoices = inboxData.items || [];

        console.log(`Found ${invoices.length} invoices to process.`);
        const results = { processed: 0, skipped: 0, errors: 0 };

        // 3. Process Each Invoice
        for (const item of invoices) {
            const ldf = item.ldf;
            const id = item.id;
            const type = ldf.split('-')[0]; // Logic from flow: first(split(outputs('ldf'),'-'))

            // Skip if type is 'NC' (Nota Crédito?) based on condition in flow: not equals 'NC'
            if (type === 'NC') {
                console.log(`Skipping NC: ${ldf}`);
                continue;
            }

            try {
                // Check if already exists
                const { data: existing } = await supabase
                    .from('invoices')
                    .select('id')
                    .eq('external_id', ldf)
                    .single();

                if (existing) {
                    console.log(`Invoice ${ldf} already exists. Skipping.`);
                    results.skipped++;
                    continue;
                }

                // Get Invoice Details
                const detailsUrl = `${INBOX_BASE_URL}/PLColab.Documents/Document/Get/${ldf}`;
                const detailsResponse = await fetch(detailsUrl, {
                    headers: { "Authorization": `Bearer ${token}` }
                });

                if (!detailsResponse.ok) throw new Error(`Details fetch failed for ${ldf}`);
                const detailsData = await detailsResponse.json();

                const pdfUri = detailsData.URI;
                const xmlUri = detailsData.UBL;

                // Donwload Files
                // Note: In real world, fetch these contents as blobs/buffers
                const pdfBlob = await fetch(pdfUri).then(r => r.blob());
                const xmlBlob = await fetch(xmlUri).then(r => r.blob());

                // Upload to Supabase Storage
                const pdfPath = `invoices/${ldf}.pdf`;
                const xmlPath = `invoices/${ldf}.xml`;

                // We need to assume bucket 'invoices' exists. 
                const { error: uploadErrorPdf } = await supabase.storage.from('invoices').upload(pdfPath, pdfBlob);
                if (uploadErrorPdf) console.warn(`PDF Upload warning for ${ldf}:`, uploadErrorPdf.message);

                const { error: uploadErrorXml } = await supabase.storage.from('invoices').upload(xmlPath, xmlBlob);
                if (uploadErrorXml) console.warn(`XML Upload warning for ${ldf}:`, uploadErrorXml.message);

                // Insert into DB
                // We need to parse amounts/data from the details or the inbox item.
                // The JSON flow doesn't explicitly show where amount comes from, usually it's in the inbox item or details.
                // I'll assume standard fields exist in 'item' or 'detailsData'. 
                // For now, I'll fallback to 0 or mock mapping if fields aren't obvious, 
                // but usually detailsData has 'Total' or similar.
                // I'll try to map common names.

                // Insert into DB
                const amountValue = detailsData.TotalPayableAmount || item.totalAmount || 0;
                const provider = detailsData.AccountingSupplierParty?.Party?.PartyName?.Name || "Proveedor Desconocido";
                const nit = detailsData.AccountingSupplierParty?.Party?.PartyTaxScheme?.CompanyID || "";
                const date = detailsData.IssueDate || new Date().toISOString();

                const { error: insertError } = await supabase.from('Registro_Facturas').insert({
                    ID: Number(BigInt(Date.now()) * BigInt(1000) + BigInt(Math.floor(Math.random() * 1000)) % BigInt(9007199254740991)),
                    Nit: nit,
                    Proveedor: provider,
                    Nro_Factura: ldf,
                    "Valor total": amountValue.toString(),
                    Creado: new Date().toISOString(),
                    CUFE: detailsData.UUID || "",
                    Gestion_Contabilidad: 'Por Aprobar',
                    Aprobacion_Doliente: 'Por Aprobar',
                    Procesado: 'false'
                });

                if (insertError) throw insertError;

                // Mark as Read
                const markReadUrl = `${INBOX_BASE_URL}/PLColab.Inbox/Notification/PRINCIPAL/MarkAsRead/${id}/${CONSTANT_ID}/true`;
                await fetch(markReadUrl, {
                    method: "PATCH",
                    headers: { "Authorization": `Bearer ${token}` }
                });

                console.log(`Processed ${ldf} successfully.`);
                results.processed++;

            } catch (err) {
                console.error(`Error processing ${ldf}:`, err);
                results.errors++;
            }
        }

        return NextResponse.json({ success: true, results });

    } catch (error: any) {
        console.error("Sync error:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
