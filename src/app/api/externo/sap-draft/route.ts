import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
    // Force bypass of SSL certificate validation for SAP Service Layer
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

    try {
        const { nit, total, distribuciones, anticipo, observations, isApproval, nroFactura, sessionId: providedSessionId, cookies: providedCookies } = await req.json();

        // 0. Only process if it's an approval
        if (!isApproval) {
            console.log(`SAP Draft: Skipping creation because isApproval is false. (NIT: ${nit})`);
            return NextResponse.json({ success: true, message: "Factura rechazada, no se envía a SAP" });
        }

        if (!nit || !total) {
            return NextResponse.json({ error: 'Missing required SAP data (NIT or Total)' }, { status: 400 });
        }

        // 1. Fetch Helper with Retry and Keep-Alive
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
                        console.warn(`SAP Fetch Attempt ${i + 1} failed (${err.message}). Retrying in ${delay}ms...`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                        continue;
                    }
                    throw err;
                }
            }
            throw new Error(`Fetch failed after ${retries} retries`);
        };

        const loginUrl = process.env.SAP_API_URL || "https://200.7.96.194:50000/b1s/v1/Login";
        let sessionId: string;
        let cookies: string;

        // 2. SAP LOGIN — use provided session if available (like TRM flow), otherwise login fresh
        if (providedSessionId) {
            console.log('SAP Draft: Using pre-existing sessionId from login step.');
            sessionId = providedSessionId;
            cookies = providedCookies || '';
        } else {
            console.log('SAP Draft: No sessionId provided, logging in to SAP...');
            const loginRes = await fetchWithRetry(loginUrl, {
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

            sessionId = (await loginRes.json()).SessionId;
            cookies = loginRes.headers.get('set-cookie') || '';
        }

        // 2. SEARCH BUSINESS PARTNER BY NIT (FederalTaxID)
        // NIT is stored in the 'Title' field of the SharePoint item, passed here as 'nit'
        const bpUrl = `${loginUrl.replace('/Login', '')}/BusinessPartners?$filter=FederalTaxID eq '${nit}'&$select=CardCode`;
        const bpRes = await fetchWithRetry(bpUrl, {
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
        const draftUrl = process.env.SAP_DRAFTS_URL || `${loginUrl.replace('/Login', '')}/Drafts`;
        
        const documentLines = Array.isArray(distribuciones) && distribuciones.length > 0 
            ? distribuciones.map((dist: any) => ({
                ItemDescription: `FACTURA ${nroFactura || ''}`, // Specific description
                AccountCode: dist.cuenta?.split(' ')[0] || '', // Clean account code
                CostingCode: dist.centroCostos?.split(' - ')[0] || '', // Extract code from "CODE - NAME",
                LineTotal: dist.valor || "0",
                VatGroup: "IVADEX" // Verified working tax code for Firplak_SA
            }))
            : [];

        const draftBody = {
            DocObjectCode: "oPurchaseInvoices",
            DocType: "dDocument_Service",
            CardCode: cardCode,
            NumAtCard: nroFactura || '', // Reference Number in SAP
            DocDate: new Date().toISOString().split('T')[0],
            Comments: `Portal Aprobación - Factura #${nroFactura || ''} | ${observations || ''} | Anticipo: ${anticipo || 'N/A'}`,
            DocumentLines: documentLines
        };

        const createDraftRes = await fetchWithRetry(draftUrl, {
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

        // 4. SAP LOGOUT — always release the session to avoid hitting the concurrent session limit
        try {
            const logoutUrl = loginUrl.replace('/Login', '/Logout');
            await fetch(logoutUrl, {
                method: 'POST',
                headers: { 'Cookie': `B1SESSION=${sessionId}; ${cookies}` }
            });
            console.log('SAP Draft: Session logged out successfully.');
        } catch (logoutErr) {
            console.warn('SAP Draft: Logout failed (non-critical):', logoutErr);
        }

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
