import { supabase } from '@/lib/supabaseClient';

/** Formato que produce el desplegable de la UI: "codigo - Título" (o solo Título si no hay código). */
export const formatCentroCosto = (c: { codigo?: any; Título?: any }) =>
    `${c.codigo ? String(c.codigo).trim() + ' - ' : ''}${String(c.Título ?? '').trim()}`;

const norm = (s: any) => String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * Devuelve la lista de centros de costos (de las distribuciones recibidas) que NO existen
 * en la tabla `Centro_costos`. Lista vacía = todo válido.
 */
export async function obtenerCentrosCostoInvalidos(distribuciones: any[]): Promise<string[]> {
    if (!Array.isArray(distribuciones) || distribuciones.length === 0) return [];

    const { data, error } = await supabase.from('Centro_costos').select('Título, codigo');
    if (error) throw error;

    const validos = new Set((data || []).map((c: any) => norm(formatCentroCosto(c))));

    const invalidos = new Set<string>();
    for (const d of distribuciones) {
        const cc = String(d?.centroCosto || d?.centroCostos || '').trim();
        if (!cc || !validos.has(norm(cc))) invalidos.add(cc || '(vacío)');
    }
    return Array.from(invalidos);
}
