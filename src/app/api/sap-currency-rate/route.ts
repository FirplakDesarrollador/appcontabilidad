import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    // Force bypass of SSL certificate validation
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

    try {
        const { sessionId, currency = "USD", cookies = "" } = await request.json();

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

        const fetchWithRetry = async (url: string, options: any, retries = 3, backoff = 1000) => {
            for (let i = 0; i < retries; i++) {
                try {
                    const response = await fetch(url, {
                        ...options,
                        headers: {
                            ...options.headers,
                        }
                    });
                    return response;
                } catch (err: any) {
                    const isNetworkError = err.name === 'TypeError' || err.code === 'UND_ERR_SOCKET' || err.message.includes('fetch failed');
                    if (isNetworkError && i < retries - 1) {
                        const delay = backoff * Math.pow(2, i);
                        console.warn(`SAP Fetch Attempt ${i + 1} failed (${err.message}). Retrying in ${delay}ms...`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                        continue;
                    }
                    throw err;
                }
            }
        };

        const response = await fetchWithRetry(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cookie': `B1SESSION=${sessionId}; ${cookies}`,
            },
            body: JSON.stringify(body),
        });

        if (!response || !response.ok) {
            const errorText = response ? await response.text() : 'No response from SAP';
            return NextResponse.json({
                error: 'Failed to fetch currency rate from SAP',
                status: response?.status || 500,
                details: errorText
            }, { status: response?.status || 500 });
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
