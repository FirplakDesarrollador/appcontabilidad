import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    // Force bypass of SSL certificate validation
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

    try {
        const { sessionId, currency = "USD" } = await request.json();

        if (!sessionId) {
            return NextResponse.json({ error: 'Session ID is required' }, { status: 400 });
        }

        // Format current date as YYYYMMDD
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const formattedDate = `${year}${month}${day}`;

        const cleanValue = (val: string | undefined) => (val || '').trim().replace(/^["'](.*)["']$/, '$1');
        let url = cleanValue(process.env.SAP_CURRENCY_RATE_URL);

        if (!url) {
            url = "https://200.7.96.194:50000/b1s/v1/SBOBobService_GetCurrencyRate";
        }

        console.log('--- SAP GET CURRENCY RATE ---');
        console.log('URL:', url);
        console.log('SessionId:', sessionId);
        console.log('Currency:', currency);

        if (!url) {
            return NextResponse.json({ error: 'SAP_CURRENCY_RATE_URL is not defined' }, { status: 500 });
        }

        const body = {
            Currency: currency,
            Date: formattedDate,
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cookie': `B1SESSION=${sessionId}`,
            },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const errorText = await response.text();
            return NextResponse.json({
                error: 'Failed to fetch currency rate from SAP',
                status: response.status,
                details: errorText
            }, { status: response.status });
        }

        const data = await response.json();
        return NextResponse.json(data);
    } catch (error: any) {
        console.error('SAP Currency Rate Error:', error);
        return NextResponse.json({
            error: 'Internal Server Error',
            message: error.message
        }, { status: 500 });
    }
}
