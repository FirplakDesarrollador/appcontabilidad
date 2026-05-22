import { NextRequest, NextResponse } from 'next/server';

interface SapBusinessPartner {
    CardCode?: string;
    CardName?: string;
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

        // 2. SEARCH BUSINESS PARTNER
        const bpUrl = `${loginUrl.replace('/Login', '')}/BusinessPartners?$filter=FederalTaxID eq '${nit}' and (startswith(CardCode,'AC') or startswith(CardCode,'PN'))&$select=CardCode,CardName,CardType`;
        const bpRes = await fetch(bpUrl, {
            headers: { 'Cookie': `B1SESSION=${sessionId}; ${cookies}` }
        });

        if (!bpRes.ok) {
            return NextResponse.json({ error: 'Failed to search Business Partner' }, { status: 500 });
        }

        const bpData = await bpRes.json();
        const bpList = (bpData.value || []) as SapBusinessPartner[];
        const supplier = bpList.find((bp) => bp.CardType === 'sSupplier' || bp.CardType === 'S');
        const found = !!supplier;

        return NextResponse.json({ 
            found,
            bp: supplier || null
        });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
