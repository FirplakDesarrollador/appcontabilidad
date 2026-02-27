import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    // Force bypass of SSL certificate validation
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

    try {
        const { sessionId, rate, currency = "USD" } = await request.json();

        if (!sessionId || !rate) {
            return NextResponse.json({ error: 'Session ID and Rate are required' }, { status: 400 });
        }

        // Format current date as YYYYMMDD
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const formattedDate = `${year}${month}${day}`;

        const cleanValue = (val: string | undefined) => (val || '').trim().replace(/^["'](.*)["']$/, '$1');
        let url = cleanValue(process.env.SAP_SET_CURRENCY_RATE_URL);

        if (!url) {
            url = "https://200.7.96.194:50000/b1s/v1/SBOBobService_SetCurrencyRate";
        }

        if (!url) {
            return NextResponse.json({ error: 'SAP_SET_CURRENCY_RATE_URL is not defined' }, { status: 500 });
        }

        const body = {
            Currency: currency,
            Rate: rate.toString(),
            RateDate: formattedDate,
        };

        console.log('--- SAP SET CURRENCY RATE ---');
        console.log('Payload:', body);

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
            console.error('SAP Set Rate Error:', errorText);
            return NextResponse.json({
                error: 'Failed to set currency rate in SAP',
                status: response.status,
                details: errorText
            }, { status: response.status });
        }

        // SAP usually returns 204 No Content for successful updates, or 200/201
        let data = {};
        if (response.status !== 204) {
            data = await response.json();
        }

        console.log('SAP Set Rate Success!');
        return NextResponse.json({ success: true, data });
    } catch (error: any) {
        console.error('SAP Set Currency Rate Fatal Error:', error);
        return NextResponse.json({
            error: 'Internal Server Error',
            message: error.message
        }, { status: 500 });
    }
}
