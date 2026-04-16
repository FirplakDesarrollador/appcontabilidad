
/**
 * SAP Service Layer Integration Utility
 * Uses Node.js native https module to bypass self-signed certificate issues
 */

import https from 'https';

export interface SapDistribution {
    centroCostos: string;
    cuenta: string;
    valor: string | number;
}

export interface SapDraftPayload {
    nit: string;
    total: string | number;
    distribuciones: SapDistribution[];
    anticipo: string;
    observations: string;
    nroFactura: string;
    docTypeDesc?: string;
}

// Custom HTTPS agent that skips certificate validation (SAP uses self-signed certs)
const insecureAgent = new https.Agent({ rejectUnauthorized: false });

/**
 * Makes an HTTPS request using Node.js native https module.
 * This bypasses the fetch() TLS issues in Next.js Turbopack + Node v24.
 */
function sapRequest(url: string, options: { method?: string; headers?: Record<string, string>; body?: string }): Promise<{ status: number; data: any; headers: any }> {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        const reqOptions: https.RequestOptions = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || 443,
            path: parsedUrl.pathname + parsedUrl.search,
            method: options.method || 'GET',
            headers: options.headers || {},
            agent: insecureAgent,
        };

        const req = https.request(reqOptions, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                let parsed: any;
                try {
                    parsed = JSON.parse(data);
                } catch {
                    parsed = data;
                }
                resolve({
                    status: res.statusCode || 500,
                    data: parsed,
                    headers: res.headers,
                });
            });
        });

        req.on('error', (err) => {
            reject(err);
        });

        if (options.body) {
            req.write(options.body);
        }
        req.end();
    });
}

/**
 * sapRequest with retry logic for network errors.
 */
async function sapRequestWithRetry(url: string, options: { method?: string; headers?: Record<string, string>; body?: string }, retries = 3, backoff = 1000) {
    for (let i = 0; i < retries; i++) {
        try {
            return await sapRequest(url, options);
        } catch (err: any) {
            if (i < retries - 1) {
                const delay = backoff * Math.pow(2, i);
                console.warn(`SAP Request Attempt ${i + 1} failed (${err.message}). Retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }
            throw err;
        }
    }
    throw new Error(`SAP request failed after ${retries} retries`);
}

export async function createSapDraft(payload: SapDraftPayload) {
    const { 
        nit, 
        total, 
        distribuciones, 
        anticipo, 
        observations, 
        nroFactura, 
        docTypeDesc = 'FACTURA' 
    } = payload;

    if (!nit || !total) {
        throw new Error('Missing required SAP data (NIT or Total)');
    }

    const loginUrl = process.env.SAP_API_URL || "https://200.7.96.194:50000/b1s/v1/Login";
    const baseUrl = loginUrl.replace('/Login', '');
    
    // 1. LOGIN
    console.log(`SAP Draft [${nroFactura}]: Logging in to SAP...`);
    const loginRes = await sapRequestWithRetry(loginUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            CompanyDB: process.env.SAP_COMPANY_DB || "Firplak_SA",
            Password: process.env.SAP_PASSWORD || "2023Fir#.*",
            UserName: process.env.SAP_USERNAME || "manager",
        }),
    });

    if (loginRes.status !== 200) {
        console.error('SAP Login Error:', loginRes.data);
        throw new Error(`Failed to authenticate with SAP: ${JSON.stringify(loginRes.data)}`);
    }

    const sessionId = loginRes.data.SessionId;
    // Extract B1SESSION cookie from set-cookie header
    const rawCookies = loginRes.headers['set-cookie'];
    const cookieStr = Array.isArray(rawCookies) ? rawCookies.join('; ') : (rawCookies || '');
    const authHeaders = { 'Cookie': `B1SESSION=${sessionId}; ${cookieStr}` };

    console.log(`SAP Draft [${nroFactura}]: Login successful (Session: ${sessionId})`);

    try {
        // 2. SEARCH BUSINESS PARTNER BY NIT
        const bpUrl = `${baseUrl}/BusinessPartners?$filter=FederalTaxID eq '${nit}'&$select=CardCode`;
        const bpRes = await sapRequestWithRetry(bpUrl, { headers: authHeaders });

        if (bpRes.status !== 200) {
            throw new Error(`Failed to find Business Partner in SAP: ${JSON.stringify(bpRes.data)}`);
        }

        if (!bpRes.data.value || bpRes.data.value.length === 0) {
            throw new Error(`Supplier with NIT ${nit} not found in SAP`);
        }

        const cardCode = bpRes.data.value[0].CardCode;
        console.log(`SAP Draft [${nroFactura}]: Found BP ${cardCode} for NIT ${nit}`);

        // 3. BUILD DOCUMENT LINES — Look up ItemCode and TaxCode from SAP Items for each account
        const draftUrl = process.env.SAP_DRAFTS_URL || `${baseUrl}/Drafts`;
        
        const documentLines: any[] = [];
        
        if (Array.isArray(distribuciones) && distribuciones.length > 0) {
            for (const dist of distribuciones) {
                // Extract clean account code (e.g. "51100505" from "51100505 - JUNTA DIRECTIVA")
                const rawAccount = dist.cuenta || '';
                const accountCode = rawAccount.split(' ')[0].trim();
                
                // Extract clean cost center code (e.g. "GA-FICOG" from "GA-FICOG - FINANZAS,CONTABILIDAD...")
                const rawCC = dist.centroCostos || '';
                const costCenter = rawCC.split(' - ')[0].trim();

                // Look up ItemCode and TaxCode from SAP Items by ExpanseAccount
                let itemCode = '';
                let taxCode = 'IVADEX'; // Default fallback
                
                if (accountCode) {
                    try {
                        const itemUrl = `${baseUrl}/Items?$filter=ExpanseAccount eq '${accountCode}'&$select=ItemCode,PurchaseVATGroup&$top=1`;
                        const itemRes = await sapRequestWithRetry(itemUrl, { headers: authHeaders });
                        
                        if (itemRes.status === 200 && itemRes.data.value && itemRes.data.value.length > 0) {
                            const foundItem = itemRes.data.value[0];
                            itemCode = foundItem.ItemCode || '';
                            taxCode = foundItem.PurchaseVATGroup || taxCode;
                            console.log(`SAP Draft [${nroFactura}]: Account ${accountCode} → Item: ${itemCode}, Tax: ${taxCode}`);
                        } else {
                            console.warn(`SAP Draft [${nroFactura}]: No Item found for account ${accountCode}, using defaults`);
                        }
                    } catch (lookupErr: any) {
                        console.warn(`SAP Draft [${nroFactura}]: Item lookup failed for ${accountCode}: ${lookupErr.message}`);
                    }
                }

                documentLines.push({
                    ItemCode: itemCode || undefined,       // Código de artículo (from Items table)
                    ItemDescription: `${docTypeDesc} ${nroFactura || ''}`,
                    AccountCode: accountCode,               // Cuenta contable
                    CostingCode: costCenter,                // Centro de costos (Dimensión 1)
                    UnitPrice: dist.valor || "0",           // Precio por unidad (valor del aprobado)
                    LineTotal: dist.valor || "0",           // Total de línea
                    VatGroup: taxCode,                      // Indicador de impuestos (from Items table)
                });
            }
        }

        if (documentLines.length === 0) {
            throw new Error('No valid distribution lines provided for SAP Draft');
        }

        // 4. CREATE DRAFT (oPurchaseInvoices)
        const draftBody = {
            DocObjectCode: "oPurchaseInvoices",
            DocType: "dDocument_Service",
            CardCode: cardCode,
            NumAtCard: nroFactura || '',
            DocDate: new Date().toISOString().split('T')[0],
            Comments: `Portal Aprobación - ${docTypeDesc} #${nroFactura || ''} | ${observations || ''} | Anticipo: ${anticipo || 'N/A'}`,
            DocumentLines: documentLines
        };

        console.log(`SAP Draft [${nroFactura}]: Creating draft with ${documentLines.length} lines...`);

        const createDraftRes = await sapRequestWithRetry(draftUrl, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                ...authHeaders
            },
            body: JSON.stringify(draftBody),
        });

        if (createDraftRes.status !== 201 && createDraftRes.status !== 200) {
            throw new Error(`Failed to create SAP Draft: ${JSON.stringify(createDraftRes.data)}`);
        }

        console.log(`SAP Draft [${nroFactura}]: Created successfully with DocEntry ${createDraftRes.data.DocEntry}`);

        return {
            success: true,
            draftId: createDraftRes.data.DocEntry,
            cardCode
        };

    } finally {
        // 4. SAP LOGOUT — always release the session
        try {
            const logoutUrl = `${baseUrl}/Logout`;
            await sapRequest(logoutUrl, {
                method: 'POST',
                headers: authHeaders
            });
            console.log(`SAP Draft [${nroFactura}]: Session logged out.`);
        } catch (logoutErr) {
            console.warn('SAP Logout failed (non-critical):', logoutErr);
        }
    }
}
