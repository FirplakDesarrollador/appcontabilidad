
/**
 * SAP Service Layer Integration Utility
 * Uses Node.js native https module to bypass self-signed certificate issues
 */

import https from 'https';
import { supabase } from './supabaseClient';

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
    itemId?: string | number; // SharePoint Sequence ID
    proveedorName?: string; // Provider Name from SharePoint
    seriesName?: string; // Optional Series Name for SAP auto-numbering
}

interface SapBusinessPartner {
    CardCode?: string;
    CardName?: string;
    FederalTaxID?: string;
    CardType?: string;
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
        docTypeDesc = 'FACTURA',
        itemId,
        proveedorName
    } = payload;

    if (!nit || total === undefined || total === null) {
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
        // 2. SEARCH BUSINESS PARTNER BY NIT (Búsqueda flexible: exacta, parcial o por CardCode)
        console.log(`SAP Draft [${nroFactura}]: Buscando Socio de Negocio para NIT ${nit}...`);
        
        const rawNit = nit;
        const cleanNit = nit.replace(/[^0-9]/g, '');
        const baseNit = nit.split('-')[0].replace(/[^0-9]/g, '');
        
        // Si el NIT tiene 9 dígitos y no tiene guion, intentar buscarlo con guion antes del último dígito
        let nitWithDash = rawNit;
        if (!rawNit.includes('-') && cleanNit.length === 9) {
            nitWithDash = `${cleanNit.substring(0, 8)}-${cleanNit.substring(8)}`;
        }

        const nitFilter = `(FederalTaxID eq '${rawNit}' or FederalTaxID eq '${nitWithDash}' or FederalTaxID eq '${cleanNit}' or FederalTaxID eq '${baseNit}' or CardCode eq '${baseNit}' or CardCode eq 'P${baseNit}' or CardCode eq 'AC${baseNit}' or CardCode eq 'PN${baseNit}' or CardCode eq 'AC${baseNit}-01' or CardCode eq 'PN${baseNit}-01')`;
        // Removed vendorCodeFilter from API call to fetch all matches and see their CardCode in case of error
        const bpUrl = `${baseUrl}/BusinessPartners?$filter=${nitFilter}&$select=CardCode,CardName,FederalTaxID,CardType`;
        const bpRes = await sapRequestWithRetry(bpUrl, { headers: authHeaders });

        if (bpRes.status !== 200) {
            throw new Error(`Failed to find Business Partner in SAP: ${JSON.stringify(bpRes.data)}`);
        }

        if (!bpRes.data.value || bpRes.data.value.length === 0) {
            throw new Error(`Supplier with NIT ${nit} not found in SAP. Verifique que el proveedor exista y el NIT sea correcto.`);
        }

        // Aceptar proveedores con prefijo SAP permitido: AC o cualquier prefijo que empiece con P (P, PN, PE, etc.)
        const allBPs = bpRes.data.value as SapBusinessPartner[];
        const vendorMatch = allBPs.find((v) => {
            const candidateCardCode = String(v.CardCode || '').toUpperCase();
            const isAllowedPrefix = candidateCardCode.startsWith('AC') || candidateCardCode.startsWith('P');
            const isSupplier = v.CardType === 'sSupplier' || v.CardType === 'cSupplier' || v.CardType === 'S';
            return isAllowedPrefix && isSupplier;
        });

        if (!vendorMatch) {
            const candidates = allBPs.map((v) => `${v.CardCode || 'N/A'} (${v.CardType || 'sin tipo'})`).join(', ');
            throw new Error(`Supplier with NIT ${nit} not found in SAP with allowed prefix AC/P. Candidates ignored: ${candidates || 'none'}`);
        }

        const match = vendorMatch;
        
        const cardCode = match.CardCode;
        const cardName = match.CardName;
        const cardType = match.CardType;
        
        console.log(`SAP Draft [${nroFactura}]: Found BP ${cardCode} (${cardName}) type [${cardType}] for NIT ${nit}`);
        
        if (cardType !== 'sSupplier' && cardType !== 'S') {
            console.warn(`SAP Draft [${nroFactura}]: ADVERTENCIA - El Socio de Negocio encontrado no es de tipo Proveedor (Tipo: ${cardType}). SAP podría rechazar el documento.`);
        }

        // 3. BUILD DOCUMENT LINES — Look up ItemCode, Description and TaxCode from Supabase Articulos table
        const draftUrl = process.env.SAP_DRAFTS_URL || `${baseUrl}/Drafts`;
        const documentLines: any[] = [];
        
        if (Array.isArray(distribuciones) && distribuciones.length > 0) {
            // Bulk fetch all relevant Articulos to avoid sequential queries
            const uniqueAccountCodes = Array.from(new Set(distribuciones.map(d => {
                const rawAccount = d.cuenta || '';
                return rawAccount.split(' ')[0].trim();
            }).filter(code => code)));

            let allArticulos: any[] = [];
            if (uniqueAccountCodes.length > 0) {
                const numericCodes = uniqueAccountCodes.map(c => parseInt(c, 10)).filter(n => !isNaN(n));
                const { data, error: articulosError } = await supabase
                    .from('Articulos')
                    .select('ItemCode, Dscription, TaxCode, AcctCode')
                    .in('AcctCode', numericCodes);
                
                if (articulosError) {
                    console.error('Error fetching articles from Supabase:', articulosError);
                } else {
                    allArticulos = data || [];
                }
            }

            for (const dist of distribuciones) {
                const rawAccount = dist.cuenta || '';
                const accountCode = rawAccount.split(' ')[0].trim();
                
                const rawCC = String(dist.centroCostos || dist.centroCosto || '').trim();
                let costCenter = "";
                
                if (rawCC.includes(' - ')) {
                    costCenter = rawCC.split(' - ')[0].trim();
                } else {
                    costCenter = rawCC;
                }

                if (costCenter === "N / A" || costCenter === "N/A" || !costCenter || costCenter.toLowerCase().includes("no aplica")) {
                    costCenter = "";
                } else {
                    // Limpiar espacios accidentales en el código del centro de costo (ej. "IP- IRTML" -> "IP-IRTML")
                    costCenter = costCenter.replace(/\s+/g, '');
                }

                // Find mapped article from bulk result
                // Compare as strings since AcctCode comes from a BIGINT DB column
                const mappedArticulo = allArticulos.find(a => String(a.AcctCode) === String(accountCode));
                console.log(`SAP Draft: Mapping dist account ${accountCode} -> found item: ${mappedArticulo?.ItemCode}`);
                
                const itemCode = mappedArticulo?.ItemCode || "";
                const itemDescription = mappedArticulo?.Dscription || `${docTypeDesc} ${nroFactura}`;
                const taxCode = mappedArticulo?.TaxCode || "IVADC3";
                const numericValor = Number(dist.valor) || 0;

                documentLines.push({
                    ItemCode: itemCode ? String(itemCode).substring(0, 50) : undefined,
                    ItemDescription: String(itemDescription).substring(0, 100),
                    AccountCode: String(accountCode).substring(0, 50),
                    ...(costCenter ? { 
                        CostingCode: String(costCenter).substring(0, 8),
                        U_CentroCostos: String(costCenter).substring(0, 30)
                    } : {}),
                    UnitPrice: numericValor,
                    LineTotal: numericValor,
                    TaxCode: String(taxCode).substring(0, 8),
                });
            }
        }

        if (documentLines.some(l => !l.ItemCode)) {
            const missing = documentLines.filter(l => !l.ItemCode).map(l => l.AccountCode).join(', ');
            throw new Error(`Error: Las siguientes cuentas no tienen un artículo asociado en Supabase: ${missing}. Por favor regístralas en la tabla Articulos.`);
        }

        if (documentLines.length === 0) {
            throw new Error('No valid distribution lines provided for SAP Draft');
        }

        // 4. GET SERIES ID IF PROVIDED
        // A solicitud del usuario, NUNCA usar Series de SAP. Siempre usar manual con el Consecutivo.
        
        // 5. CREATE DRAFT (oPurchaseInvoices)
        const displayProveedor = proveedorName || cardName || 'N/A';
        const finalComments = `Proveedor: ${displayProveedor} | Factura: ${nroFactura} | ID: ${itemId || 'N/A'} | Portal: ${docTypeDesc} | Obs: ${observations || ''}`;
        
        const draftBody: any = {
            DocObjectCode: "oPurchaseInvoices",
            DocType: "dDocument_Items",
            CardCode: String(cardCode).substring(0, 50),
            NumAtCard: String(nroFactura || '').substring(0, 100),
            DocDate: new Date().toISOString().split('T')[0],
            Comments: finalComments.substring(0, 250), // SAP limit is usually 250
            DocumentLines: documentLines,
            Series: -1, // Manual
            HandWritten: "tYES"
        };

        const consecutivoValue = payload.consecutivo ? parseInt(payload.consecutivo.toString(), 10) : (itemId ? parseInt(itemId.toString(), 10) : null);
        if (consecutivoValue && !isNaN(consecutivoValue)) {
            draftBody.DocNum = consecutivoValue;
            console.log(`SAP Draft [${nroFactura}]: Consecutivo Manual [${draftBody.DocNum}] - ${cardName}`);
        } else {
            console.log(`SAP Draft [${nroFactura}]: Sin consecutivo manual válido, se dejará en blanco para asignación automática.`);
        }

        console.log(`SAP Draft [${nroFactura}]: Creating draft with ${documentLines.length} lines...`);

        let createDraftRes = await sapRequestWithRetry(draftUrl, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                ...authHeaders
            },
            body: JSON.stringify(draftBody),
        });

        // FALLBACK PARA 502 PROXY ERROR:
        // A veces el Service Layer se cae (502) si se envía un DocNum duplicado en Series manual (-1).
        // Si recibimos 502, reintentamos la creación permitiendo que SAP asigne el DocNum automáticamente.
        if (createDraftRes.status === 502 && draftBody.Series === -1) {
            console.warn(`SAP Draft [${nroFactura}]: 502 Proxy Error detectado. Reintentando sin DocNum manual para evitar conflictos...`);
            delete draftBody.Series;
            delete draftBody.HandWritten;
            delete draftBody.DocNum;
            
            createDraftRes = await sapRequestWithRetry(draftUrl, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    ...authHeaders
                },
                body: JSON.stringify(draftBody),
            });
        }

        if (createDraftRes.status !== 201 && createDraftRes.status !== 200) {
            const sapError = createDraftRes.data?.error?.message?.value || JSON.stringify(createDraftRes.data);
            const firstLineInfo = documentLines.length > 0 
                ? ` (Línea 1: Cuenta ${documentLines[0].AccountCode}, Item ${documentLines[0].ItemCode}, CC ${documentLines[0].CostingCode})` 
                : "";
            throw new Error(`Failed to create SAP Draft: ${sapError}${firstLineInfo}`);
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
