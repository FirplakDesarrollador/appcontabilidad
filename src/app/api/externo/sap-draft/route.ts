import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
    // Force bypass of SSL certificate validation for SAP Service Layer
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

    try {
        const { nit, total, accountCode, costCenter, anticipo, observations, isApproval } = await req.json();

        if (!nit || !total) {
            return NextResponse.json({ error: 'Missing required SAP data (NIT or Total)' }, { status: 400 });
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
            const error = await loginRes.text();
            console.error('SAP Login Error:', error);
            return NextResponse.json({ error: 'Failed to authenticate with SAP', details: error }, { status: 500 });
        }

        const sessionId = (await loginRes.json()).SessionId;
        const cookies = loginRes.headers.get('set-cookie') || '';

        // 2. SEARCH BUSINESS PARTNER BY NIT (FederalTaxID)
        // NIT is stored in the 'Title' field of the SharePoint item, passed here as 'nit'
        const bpUrl = `${loginUrl.replace('/Login', '')}/BusinessPartners?$filter=FederalTaxID eq '${nit}'&$select=CardCode`;
        const bpRes = await fetch(bpUrl, {
            headers: { 'Cookie': `B1SESSION=${sessionId}; ${cookies}` }
        });

        if (!bpRes.ok) {
            console.error('SAP BP Search Error:', await bpRes.text());
            return NextResponse.json({ error: 'Failed to find Business Partner in SAP' }, { status: 500 });
        }

        const bpData = await bpRes.json();
        if (!bpData.value || bpData.value.length === 0) {
            return NextResponse.json({ error: `Supplier with NIT ${nit} not found in SAP` }, { status: 404 });
        }

        const cardCode = bpData.value[0].CardCode;

        // 3. CREATE DRAFT (oPurchaseInvoices)
        const draftUrl = `${loginUrl.replace('/Login', '')}/Drafts`;
        
        // Clean account code (remove names/dashes if any, just numbers)
        const cleanAccount = accountCode?.split(' ')[0] || '';

        const draftBody = {
            DocObjectCode: "oPurchaseInvoices",
            CardCode: cardCode,
            DocDate: new Date().toISOString().split('T')[0],
            Comments: `${isApproval ? '[APROBADO]' : '[RECHAZADO]'} - ${observations || ''} | Anticipo: ${anticipo || 'N/A'}`,
            DocumentLines: [
              {
                AccountCode: cleanAccount,
                CostingCode: costCenter?.split(' - ')[0] || '', // Extract code from "CODE - NAME"
                LineTotal: total,
              }
            ]
        };

        const createDraftRes = await fetch(draftUrl, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Cookie': `B1SESSION=${sessionId}; ${cookies}`
            },
            body: JSON.stringify(draftBody),
        });

        if (!createDraftRes.ok) {
            const error = await createDraftRes.text();
            console.error('SAP Draft Creation Error:', error);
            return NextResponse.json({ error: 'Failed to create SAP Draft', details: error }, { status: 500 });
        }

        const draftData = await createDraftRes.json();

        return NextResponse.json({ 
            success: true, 
            draftId: draftData.DocEntry,
            cardCode 
        });

    } catch (error: any) {
        console.error('SAP Draft Exception:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
