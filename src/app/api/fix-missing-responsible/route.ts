import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getGraphClient, getCachedUserMap } from '@/lib/sharepoint';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (serviceKey && serviceKey !== 'REEMPLAZAR_CON_TU_SERVICE_ROLE_KEY')
        ? serviceKey
        : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const HOST = 'firplaksa.sharepoint.com';
const SITE_PATH = 'FPKContabilidad';
const LIST_NAME = 'Registro_de_Facturas';

/** Normaliza un NIT quitando el dígito de verificación y caracteres no numéricos */
function baseNit(nit: string | null): string {
    if (!nit) return '';
    return nit.includes('-') ? nit.split('-')[0].trim() : nit.trim();
}

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const dryRun = searchParams.get('dry') === 'true';

        console.log(`[FIX-RESPONSIBLE] Iniciando parche de responsables${dryRun ? ' (DRY RUN)' : ''}...`);

        // ── 1. Obtener facturas sin responsable ────────────────────────────────
        const { data: invoices, error: fetchError } = await supabaseAdmin
            .from('Registro_Facturas')
            .select('ID, Nit, Proveedor, Nro_Factura, sharepoint_id, Responsable_de_Autorizar')
            .or('Responsable_de_Autorizar.is.null,Responsable_de_Autorizar.eq.""')
            .order('ID', { ascending: false });

        if (fetchError) throw fetchError;
        if (!invoices || invoices.length === 0) {
            return NextResponse.json({ success: true, message: 'No hay facturas sin responsable.', fixed: 0, skipped: 0 });
        }

        console.log(`[FIX-RESPONSIBLE] Encontradas ${invoices.length} facturas sin responsable.`);

        // ── 2. Cargar tabla Proveedores_con_Responsable ────────────────────────
        const { data: providers, error: provError } = await supabaseAdmin
            .from('Proveedores_con_Responsable')
            .select('"Nit", "Responsable", "Autorizador"');

        if (provError) throw provError;

        // Índice rápido: baseNit → nombre responsable
        const providerMap = new Map<string, string>();
        for (const p of providers || []) {
            const key = baseNit(p.Nit);
            if (key && !providerMap.has(key)) {
                const name = p.Responsable || p.Autorizador || null;
                if (name) providerMap.set(key, name);
            }
        }

        console.log(`[FIX-RESPONSIBLE] Cargados ${providerMap.size} proveedores con responsable.`);

        // ── 3. Intentar resolver los que no están en Supabase desde SharePoint ─
        // Recopilar NITs que no encontramos en providerMap para buscarlos en SP
        const missingNits = new Set<string>();
        for (const inv of invoices) {
            const key = baseNit(inv.Nit);
            if (key && !providerMap.has(key)) missingNits.add(key);
        }

        if (missingNits.size > 0) {
            console.log(`[FIX-RESPONSIBLE] ${missingNits.size} NITs no encontrados en Supabase. Intentando resolver desde SharePoint...`);
            try {
                const graphClient = await getGraphClient();
                const siteResponse = await graphClient.api(`/sites/${HOST}:/sites/${SITE_PATH}`).get();
                const siteId = siteResponse.id;
                const userMap = await getCachedUserMap(graphClient, siteId);

                const listsResponse = await graphClient.api(`/sites/${siteId}/lists`).get();
                const list = listsResponse.value.find((l: any) => l.name === LIST_NAME || l.displayName === LIST_NAME);

                if (list) {
                    const listId = list.id;
                    // Buscar en SP facturas de esos NITs que tengan responsable asignado
                    for (const nit of missingNits) {
                        try {
                            const spRes = await graphClient
                                .api(`/sites/${siteId}/lists/${listId}/items?expand=fields&$top=1`)
                                .header('Prefer', 'HonorNonIndexedQueriesWarningMayFailRandomly')
                                .filter(`fields/Title eq '${nit}' or fields/Nit eq '${nit}'`)
                                .get();

                            const spItem = spRes.value?.[0];
                            if (spItem) {
                                const fields = spItem.fields || {};
                                const lookupId = fields.ResponsabledeAutorizarLookupId
                                    || fields.ResponsableAprobarLookupId
                                    || fields.Responsable_de_AutorizarLookupId;
                                const resolvedName = lookupId ? (userMap.get(String(lookupId)) || null) : null;
                                if (resolvedName) {
                                    providerMap.set(nit, resolvedName);
                                    console.log(`[FIX-RESPONSIBLE] Resuelto desde SP: NIT ${nit} → ${resolvedName}`);
                                }
                            }
                        } catch {
                            // Continuar con el siguiente NIT si este falla
                        }
                    }
                }
            } catch (spErr: any) {
                console.warn('[FIX-RESPONSIBLE] No se pudo consultar SharePoint:', spErr.message);
            }
        }

        // ── 4. Aplicar las actualizaciones ────────────────────────────────────
        const results = {
            total: invoices.length,
            fixed: 0,
            skipped: 0, // NIT sin responsable conocido
            failed: 0,
            details: [] as Array<{ id: number; nro: string; nit: string; responsable: string | null; status: string }>,
        };

        for (const inv of invoices) {
            const key = baseNit(inv.Nit);
            const responsable = providerMap.get(key) || null;

            if (!responsable) {
                results.skipped++;
                results.details.push({
                    id: inv.ID,
                    nro: inv.Nro_Factura,
                    nit: inv.Nit,
                    responsable: null,
                    status: 'skipped – NIT no encontrado en ninguna fuente',
                });
                continue;
            }

            if (dryRun) {
                results.fixed++;
                results.details.push({ id: inv.ID, nro: inv.Nro_Factura, nit: inv.Nit, responsable, status: 'dry-run' });
                continue;
            }

            const { error: updateError } = await supabaseAdmin
                .from('Registro_Facturas')
                .update({ Responsable_de_Autorizar: responsable })
                .eq('ID', inv.ID);

            if (updateError) {
                console.error(`[FIX-RESPONSIBLE] Error actualizando ID ${inv.ID}:`, updateError.message);
                results.failed++;
                results.details.push({ id: inv.ID, nro: inv.Nro_Factura, nit: inv.Nit, responsable, status: `error: ${updateError.message}` });
            } else {
                console.log(`[FIX-RESPONSIBLE] ✓ ID ${inv.ID} (${inv.Nro_Factura}) → ${responsable}`);
                results.fixed++;
                results.details.push({ id: inv.ID, nro: inv.Nro_Factura, nit: inv.Nit, responsable, status: 'fixed' });
            }
        }

        console.log(`[FIX-RESPONSIBLE] Completado: ${results.fixed} corregidos, ${results.skipped} sin info, ${results.failed} errores.`);
        return NextResponse.json({ success: true, dryRun, ...results });

    } catch (error: any) {
        console.error('[FIX-RESPONSIBLE] Error fatal:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
