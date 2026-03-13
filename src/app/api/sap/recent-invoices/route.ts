import { NextResponse } from 'next/server';

export async function GET() {
    // Force bypass of SSL certificate validation
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

    try {
        let baseUrl = (process.env.SAP_API_URL || "https://200.7.96.194:50000/b1s/v1/").trim();
        baseUrl = baseUrl.replace(/\/Login\/?$/i, '/');
        const loginUrl = `${baseUrl.replace(/\/$/, '')}/Login`;

        // SAP Login
        const db = process.env.SAP_COMPANY_DB || "Firplak_SA";
        let user = process.env.SAP_USERNAME?.trim() || "manager";
        let pass = process.env.SAP_PASSWORD?.trim() || "2023Fir#.*";

        if (pass === "2023Fir") {
            pass = "2023Fir#.*";
        }

        const loginRes = await fetch(loginUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ CompanyDB: db, Password: pass, UserName: user }),
        });

        if (!loginRes.ok) {
            const err = await loginRes.text();
            return NextResponse.json({ error: 'SAP Login failed', details: err }, { status: loginRes.status });
        }

        const { SessionId } = await loginRes.json();

        // Obtener las últimas 5 facturas de compra usando la URL del .env
        const purchaseInvoicesUrl = process.env.SAP_PURCHASE_INVOICES_URL || "https://200.7.96.194:50000/b1s/v1/PurchaseInvoices";
        const queryUrl = `${purchaseInvoicesUrl}?$orderby=DocEntry desc&$top=5&$select=DocEntry,DocNum,CardCode,CardName,NumAtCard,DocTotal,DocDate,DocTime`;

        const invoicesRes = await fetch(queryUrl, {
            headers: { 'Cookie': `B1SESSION=${SessionId}` }
        });

        if (!invoicesRes.ok) {
            const err = await invoicesRes.text();
            return NextResponse.json({ error: 'SAP Fetch failed', details: err }, { status: invoicesRes.status });
        }

        const data = await invoicesRes.json();

        return NextResponse.json({
            success: true,
            invoices: data.value || []
        });

    } catch (error: any) {
        console.error('SAP Invoices Fetch Error:', error);
        return NextResponse.json({
            error: 'Internal Server Error',
            message: error.message
        }, { status: 500 });
    }
}
