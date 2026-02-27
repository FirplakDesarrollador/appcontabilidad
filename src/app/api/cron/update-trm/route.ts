import { NextResponse } from 'next/server';

export async function GET(request: Request) {
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
        const rateDate = usdData[0].vigenciadesde.split('T')[0].replace(/-/g, '');

        // 2. Fetch USD/EUR Cross Rate
        const crossResponse = await fetch("https://api.frankfurter.app/latest?from=USD&to=EUR");
        if (!crossResponse.ok) throw new Error("Failed to fetch USD/EUR cross rate");
        const crossData = await crossResponse.json();
        const eurFactor = crossData.rates.EUR;
        const eurRate = usdRate / eurFactor;

        console.log(`USD Rate: ${usdRate}, EUR Rate: ${eurRate.toFixed(2)} for ${rateDate}`);

        // 3. Define Databases to update
        const databases = [
            process.env.SAP_COMPANY_DB,
            process.env.SAP_COMPANY_DB_VIVENTTA
        ].filter(Boolean) as string[];

        const results = [];

        for (const db of databases) {
            console.log(`Updating TRM for Database: ${db}`);
            try {
                // Login to SAP for this specific DB
                const loginUrl = process.env.SAP_API_URL || "https://200.7.96.194:50000/b1s/v1/Login";
                const loginResponse = await fetch(loginUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        CompanyDB: db,
                        Password: process.env.SAP_PASSWORD,
                        UserName: process.env.SAP_USERNAME,
                    }),
                });

                if (!loginResponse.ok) throw new Error(`SAP Login failed for ${db}`);
                const loginData = await loginResponse.json();
                const sessionId = loginData.SessionId;

                // Update USD in SAP
                const setRateUrl = process.env.SAP_SET_CURRENCY_RATE_URL || "https://200.7.96.194:50000/b1s/v1/SBOBobService_SetCurrencyRate";

                const updateUsd = await fetch(setRateUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Cookie': `B1SESSION=${sessionId}`
                    },
                    body: JSON.stringify({
                        Currency: "USD",
                        Rate: usdRate.toString(),
                        RateDate: rateDate
                    }),
                });

                // Update EUR in SAP
                const updateEur = await fetch(setRateUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Cookie': `B1SESSION=${sessionId}`
                    },
                    body: JSON.stringify({
                        Currency: "EUR",
                        Rate: eurRate.toFixed(2),
                        RateDate: rateDate
                    }),
                });

                results.push({
                    db,
                    success: updateUsd.ok && updateEur.ok,
                    usdUpdated: updateUsd.ok,
                    eurUpdated: updateEur.ok
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
