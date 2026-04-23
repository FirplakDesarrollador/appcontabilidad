import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    // Force bypass of SSL certificate validation
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

    try {
        const { nroFactura, nit, companyDB } = await request.json();

        if (!nroFactura) {
            return NextResponse.json({ error: 'Nro_Factura is required' }, { status: 400 });
        }

        let baseUrl = (process.env.SAP_API_URL || "https://200.7.96.194:50000/b1s/v1/").trim();
        // Asegurarse de quitar "/Login" del final de baseUrl si está presente
        baseUrl = baseUrl.replace(/\/Login\/?$/i, '/');
        const loginUrl = `${baseUrl.replace(/\/$/, '')}/Login`;

        // 1. SAP Login
        const db = companyDB || process.env.SAP_COMPANY_DB || "Firplak_SA";
        const isViventta = db === process.env.SAP_COMPANY_DB_VIVENTTA;
        const user = isViventta 
            ? (process.env.SAP_USERNAME_VIVENTTA?.trim() || "cmrestre")
            : (process.env.SAP_USERNAME?.trim() || "manager");
            
        let pass = isViventta 
            ? (process.env.SAP_PASSWORD_VIVENTTA?.trim() || "1234")
            : (process.env.SAP_PASSWORD?.trim() || "2023Fir#.*");

        // Workaround for dotenv parsing '#' as a comment and truncating the password
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

        // 2. Search for the invoice
        // We filter by NumAtCard (usually where vendor invoice number is stored) OR VendorNum (if applicable)
        // And also CardCode (NIT) if provided
        
        let filter = `NumAtCard eq '${nroFactura}'`;
        if (nit) {
            // Some companies include the NIT in CardCode, but often it has a prefix or is different.
            // For now, let's keep search broad and maybe filter result in JS if needed, 
            // or use specific business logic if CardCode equals NIT.
            // filter += ` and CardCode eq '${nit}'`; 
        }

        const queryUrl = `${baseUrl.replace(/\/$/, '')}/PurchaseInvoices?$filter=${encodeURIComponent(filter)}&$select=DocEntry,DocNum,CardCode,CardName,NumAtCard,DocTotal`;

        const searchRes = await fetch(queryUrl, {
            headers: { 'Cookie': `B1SESSION=${SessionId}` }
        });

        if (!searchRes.ok) {
            const err = await searchRes.text();
            return NextResponse.json({ error: 'SAP Search failed', details: err }, { status: searchRes.status });
        }

        const searchData = await searchRes.json();
        const exists = searchData.value && searchData.value.length > 0;

        return NextResponse.json({
            exists,
            count: searchData.value ? searchData.value.length : 0,
            invoice: exists ? searchData.value[0] : null
        });

    } catch (error: any) {
        console.error('SAP Validation Route Error:', error);
        return NextResponse.json({
            error: 'Internal Server Error',
            message: error.message
        }, { status: 500 });
    }
}
