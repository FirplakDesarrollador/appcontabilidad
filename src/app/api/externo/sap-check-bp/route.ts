import { NextRequest, NextResponse } from 'next/server';
import { construirVariantesNit } from '@/lib/sap';

interface SapBusinessPartner {
    CardCode?: string;
    CardName?: string;
    FederalTaxID?: string;
    CardType?: string;
}

export async function POST(req: NextRequest) {
    // Force bypass of SSL certificate validation
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

    try {
        const { nit } = await req.json();

        if (!nit) {
            return NextResponse.json({ error: 'NIT is required' }, { status: 400 });
        }

        // 1. SAP LOGIN
        const loginUrl = process.env.SAP_API_URL || "https://200.7.96.194:50000/b1s/v1/Login";
        const baseUrl = loginUrl.replace('/Login', '');
        const loginRes = await fetch(loginUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                CompanyDB: process.env.SAP_COMPANY_DB || "Firplak_SA",
                Password: process.env.SAP_PASSWORD || "2023Fir#.*",
                UserName: process.env.SAP_USERNAME || "manager",
            }),
        });

        if (!loginRes.ok) {
            return NextResponse.json({ error: 'Failed to authenticate with SAP' }, { status: 500 });
        }

        const sessionId = (await loginRes.json()).SessionId;
        const cookies = loginRes.headers.get('set-cookie') || '';
        const headers = { 'Cookie': `B1SESSION=${sessionId}; ${cookies}` };

        // 2. SEARCH BUSINESS PARTNER (con y sin DV DIAN)
        const { baseNit, codeBases, allowedNumericNits, nitFilter } = construirVariantesNit(nit);
        let bpRes = await fetch(
            `${baseUrl}/BusinessPartners?$filter=${encodeURIComponent(`${nitFilter} and CardType eq 'cSupplier'`)}&$select=CardCode,CardName,FederalTaxID,CardType`,
            { headers }
        );

        let bpData = bpRes.ok ? await bpRes.json() : { value: [] };
        let bpList = (bpData.value || []) as SapBusinessPartner[];

        if (bpList.length === 0 && baseNit.length >= 7) {
            const flexRes = await fetch(
                `${baseUrl}/BusinessPartners?$filter=${encodeURIComponent(`startswith(FederalTaxID,'${baseNit}') and CardType eq 'cSupplier'`)}&$select=CardCode,CardName,FederalTaxID,CardType`,
                { headers }
            );
            if (flexRes.ok) {
                const flexJson = await flexRes.json();
                bpList = ((flexJson.value || []) as SapBusinessPartner[]).filter((bp) => {
                    const taxDigits = String(bp.FederalTaxID || '').replace(/[^0-9]/g, '');
                    const codeUpper = String(bp.CardCode || '').toUpperCase().replace(/\s+/g, '');
                    return allowedNumericNits.has(taxDigits) || codeBases.some((cb) => codeUpper.includes(cb));
                });
            }
        }

        if (!bpRes.ok && bpList.length === 0) {
            return NextResponse.json({ error: 'Failed to search Business Partner' }, { status: 500 });
        }

        const supplier = bpList.find((bp) => {
            const code = String(bp.CardCode || '').toUpperCase().replace(/\s+/g, '');
            const isAllowedPrefix = code.startsWith('AC') || code.startsWith('P');
            const isSupplier = bp.CardType === 'sSupplier' || bp.CardType === 'cSupplier' || bp.CardType === 'S';
            return isAllowedPrefix && isSupplier;
        });
        const found = !!supplier;

        return NextResponse.json({
            found,
            bp: supplier || null
        });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
