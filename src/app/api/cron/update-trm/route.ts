import { NextResponse } from 'next/server';

export async function GET(request: Request) {
    // Check for authorization (Vercel Crons)
    const authHeader = request.headers.get('Authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Force bypass of SSL certificate validation for SAP
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

    try {
        console.log('--- CRON: STARTING TRM UPDATE ---');

        // 1. Fetch USD TRM from datos.gov.co
        const usdResponse = await fetch("https://www.datos.gov.co/resource/32sa-8pi3.json?$limit=1&$order=vigenciadesde DESC");
        if (!usdResponse.ok) throw new Error("Failed to fetch USD TRM");
        const usdData = await usdResponse.json();
        if (!usdData || usdData.length === 0) throw new Error("No USD TRM data found");

        const usdRate = parseFloat(usdData[0].valor);

        // Use current date (today) instead of the API date to ensure SAP has a rate for the current day
        // This covers weekends and holidays where the API date might be from a previous day.
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const rateDate = `${year}${month}${day}`;

        // 2. Fetch USD/EUR Cross Rate
        const crossResponse = await fetch("https://api.frankfurter.app/latest?from=USD&to=EUR");
        if (!crossResponse.ok) throw new Error("Failed to fetch USD/EUR cross rate");
        const crossData = await crossResponse.json();
        const eurFactor = crossData.rates.EUR;
        const eurRate = usdRate / eurFactor;

        console.log(`USD Rate: ${usdRate}, EUR Rate: ${eurRate.toFixed(2)} for ${rateDate} (Target Date)`);

        // 3. Define Databases to update
        const databases = [
            process.env.SAP_COMPANY_DB,
            process.env.SAP_COMPANY_DB_VIVENTTA
        ].filter(Boolean) as string[];

        const fetchWithRetry = async (url: string, options: any, retries = 3, backoff = 1000) => {
            for (let i = 0; i < retries; i++) {
                try {
                    const response = await fetch(url, {
                        ...options,
                        headers: {
                            ...options.headers,
                            'Connection': 'keep-alive',
                            'Keep-Alive': 'timeout=60, max=100'
                        }
                    });
                    return response;
                } catch (err: any) {
                    const isNetworkError = err.name === 'TypeError' || err.code === 'UND_ERR_SOCKET' || err.message.includes('fetch failed');
                    if (isNetworkError && i < retries - 1) {
                        const delay = backoff * Math.pow(2, i);
                        console.warn(`CRON Fetch Attempt ${i + 1} failed (${err.message}). Retrying in ${delay}ms...`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                        continue;
                    }
                    throw err;
                }
            }
        };

        const results = [];

        for (const db of databases) {
            console.log(`Updating TRM for Database: ${db}`);
            try {
                // Login to SAP for this specific DB
                const loginUrl = process.env.SAP_API_URL || "https://200.7.96.194:50000/b1s/v1/Login";
                const loginResponse = await fetchWithRetry(loginUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        CompanyDB: db,
                        Password: process.env.SAP_PASSWORD,
                        UserName: process.env.SAP_USERNAME,
                    }),
                });

                if (!loginResponse || !loginResponse.ok) throw new Error(`SAP Login failed for ${db}`);
                const loginData = await loginResponse.json();
                const sessionId = loginData.SessionId;

                // Service URLs
                const getRateUrl = process.env.SAP_CURRENCY_RATE_URL || "https://200.7.96.194:50000/b1s/v1/SBOBobService_GetCurrencyRate";
                const setRateUrl = process.env.SAP_SET_CURRENCY_RATE_URL || "https://200.7.96.194:50000/b1s/v1/SBOBobService_SetCurrencyRate";

                // Function to check and update intelligently
                const processCurrency = async (currency: string, targetRate: number) => {
                    try {
                        // 1. Get current rate from SAP
                        const getResponse = await fetchWithRetry(getRateUrl, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'Cookie': `B1SESSION=${sessionId}` },
                            body: JSON.stringify({ Currency: currency, Date: rateDate }),
                        });

                        let currentSapRate: number | null = null;
                        if (getResponse && getResponse.ok) {
                            const data = await getResponse.json();
                            currentSapRate = typeof data === 'number' ? data : parseFloat(data.value || data.Rate || "0");
                        }

                        // 2. Compare and Update if different (or missing)
                        if (currentSapRate && Math.abs(currentSapRate - targetRate) < 0.01) {
                            console.log(`[${db}] ${currency} is already correct: ${currentSapRate}`);
                            return true;
                        }

                        console.log(`[${db}] ${currency} mismatch! SAP: ${currentSapRate}, Official: ${targetRate}. Updating...`);

                        const setResponse = await fetchWithRetry(setRateUrl, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'Cookie': `B1SESSION=${sessionId}` },
                            body: JSON.stringify({
                                Currency: currency,
                                Rate: targetRate.toFixed(4),
                                RateDate: rateDate
                            }),
                        });

                        return !!(setResponse && setResponse.ok);
                    } catch (err) {
                        console.error(`Error processing ${currency} for ${db}:`, err);
                        return false;
                    }
                };

                const usdUpdated = await processCurrency("USD", usdRate);
                const eurUpdated = await processCurrency("EUR", parseFloat(eurRate.toFixed(2)));

                results.push({
                    db,
                    success: usdUpdated && eurUpdated,
                    usdUpdated,
                    eurUpdated
                });
            } catch (dbError: any) {
                console.error(`Error updating DB ${db}:`, dbError.message);
                results.push({
                    db,
                    success: false,
                    error: dbError.message
                });
            }
        }

        console.log('--- CRON: TRM UPDATE FINISHED ---');

        return NextResponse.json({
            success: results.every(r => r.success),
            usd: usdRate,
            eur: eurRate.toFixed(2),
            date: rateDate,
            results
        });

    } catch (error: any) {
        console.error('CRON TRM Error:', error);
        return NextResponse.json({
            success: false,
            error: error.message
        }, { status: 500 });
    }
}

export const dynamic = 'force-dynamic';
