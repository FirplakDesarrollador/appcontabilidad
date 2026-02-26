import { NextResponse } from 'next/server';

export async function POST() {
    // Force bypass of SSL certificate validation
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

    console.log('--- SAP LOGIN DEBUG ---');
    const db = process.env.SAP_COMPANY_DB || "Firplak_SA";
    const user = process.env.SAP_USERNAME || "manager";
    const pass = process.env.SAP_PASSWORD || "2023Fir#.*";
    const url = process.env.SAP_API_URL || "https://200.7.96.194:50000/b1s/v1/Login";

    console.log(`--- SAP LOGIN ATTEMPT (DYNAMIC) ---`);
    console.log(`DB: ${db}`);
    console.log(`User: ${user}`);
    console.log(`URL: ${url}`);

    const body = {
        CompanyDB: db,
        Password: pass,
        UserName: user,
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify(body),
        });

        console.log('SAP Status:', response.status);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('SAP Error:', errorText);

            let parsedError;
            try { parsedError = JSON.parse(errorText); } catch (e) { parsedError = errorText; }

            return NextResponse.json({
                error: 'SAP Login failed',
                status: response.status,
                details: parsedError
            }, { status: response.status });
        }

        const data = await response.json();
        console.log('SAP Success!');
        return NextResponse.json(data);
    } catch (error: any) {
        console.error('SAP Fatal Error:', error.message);
        return NextResponse.json({
            error: 'Connection Error',
            message: error.message
        }, { status: 500 });
    }
}
