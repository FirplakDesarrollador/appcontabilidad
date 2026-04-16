import fs from 'fs';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

async function main() {
    try {
        const loginUrl = "https://200.7.96.194:50000/b1s/v1/Login";
        const loginRes = await fetch(loginUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                CompanyDB: "Firplak_SA",
                Password: "2023Fir#.*",
                UserName: "manager",
            }),
        });
        const { SessionId } = await loginRes.json();
        const cookies = loginRes.headers.get('set-cookie') || '';
        const reqHeaders = { 'Content-Type': 'application/json', 'Cookie': `B1SESSION=${SessionId}; ${cookies}` };

        const bpUrl = "https://200.7.96.194:50000/b1s/v1/BusinessPartners?$filter=CardType eq 'cSupplier' and Valid eq 'tYES'&$top=1";
        const bpRes = await fetch(bpUrl, { headers: reqHeaders });
        const bpData = await bpRes.json();
        const cardCode = bpData.value ? bpData.value[0].CardCode : 'P901306161';
        
        const accountCode = '25250505';

        const centerUrl = "https://200.7.96.194:50000/b1s/v1/ProfitCenters?$filter=Active eq 'tYES'&$top=1";
        const centerRes = await fetch(centerUrl, { headers: reqHeaders });
        const centerData = await centerRes.json();
        const centerCode = centerData.value ? centerData.value[0].CenterCode : '+';

        // Drafts endpoint
        const draftUrl = "https://200.7.96.194:50000/b1s/v1/Drafts";
        const draftBody = {
            DocObjectCode: "oPurchaseInvoices",
            DocType: "dDocument_Service",
            CardCode: cardCode,
            NumAtCard: "TEST-DRAFT-003",
            DocDate: new Date().toISOString().split('T')[0],
            Comments: "DRAFT TEST FROM AI AGENT",
            DocumentLines: [
                {
                    ItemDescription: "Servicios de prueba AI (Borrador)",
                    AccountCode: accountCode,
                    LineTotal: "1000",
                    TaxCode: "IVADEX",
                    CostingCode: centerCode
                }
            ]
        };

        const createRes = await fetch(draftUrl, {
            method: 'POST',
            headers: reqHeaders,
            body: JSON.stringify(draftBody),
        });

        if (!createRes.ok) throw new Error("Failed to create draft: " + await createRes.text());

        const createData = await createRes.json();
        
        fs.writeFileSync('result_draft.json', JSON.stringify({
            success: true,
            DocNum: createData.DocNum,
            DocEntry: createData.DocEntry,
            CardCode: cardCode,
            AccountCode: accountCode,
            CostingCode: centerCode,
            Total: createData.DocTotal,
            Type: "Draft (Documento preliminar)"
        }, null, 2));

    } catch (e) {
        fs.writeFileSync('result_draft.json', JSON.stringify({ error: e.message, stack: e.stack }, null, 2));
    }
}

main();
