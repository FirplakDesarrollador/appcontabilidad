"use client";

import { Sidebar } from "@/components/layout/Sidebar";
import { ArrowLeft, RefreshCw, AlertCircle, Search, CheckSquare, Square, Save, Loader2, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";
import { RegistroFactura, FacturaPendiente } from "@/types";
import { ExcelUploadModal } from "@/components/modals/ExcelUploadModal";
import { Button } from "@/components/ui/Button";

export default function RevisionFacturaDianPage() {
    const [facturas, setFacturas] = useState<RegistroFactura[]>([]);
    const [facturasPendientes, setFacturasPendientes] = useState<FacturaPendiente[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingPendientes, setLoadingPendientes] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [showSavedList, setShowSavedList] = useState(true);
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [comparisonResult, setComparisonResult] = useState<{ headers: string[], data: any[][] } | null>(null);
    const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
    const [filters, setFilters] = useState({
        CreadoStart: "",
        CreadoEnd: "",
        Proveedor: "",
        Nit: "",
        Nro_Factura: "",
        "Valor total": "",
        FechaStart: "",
        FechaEnd: "",
        Gestion_Contabilidad: ""
    });

    const fetchFacturas = async () => {
        setLoading(true);
        setError(null);
        try {
            const { data, error } = await supabase
                .from("Registro_Facturas")
                .select("*")
                .order("ID", { ascending: false })
                .limit(200);

            if (error) throw error;
            setFacturas(data || []);
        } catch (err: any) {
            console.error("Error fetching facturas:", err);
            setError(err.message || "Error al cargar las facturas.");
        } finally {
            setLoading(false);
        }
    };

    const fetchFacturasPendientes = async () => {
        setLoadingPendientes(true);
        try {
            const { data, error } = await supabase
                .from("Facturas pendientes")
                .select("*")
                .order("ID", { ascending: false });

            if (error) throw error;
            setFacturasPendientes(data || []);
        } catch (err: any) {
            console.error("Error fetching facturas pendientes:", err);
        } finally {
            setLoadingPendientes(false);
        }
    };

    useEffect(() => {
        fetchFacturas();
        fetchFacturasPendientes();
    }, []);

    const filteredResults = useMemo(() => {
        if (!comparisonResult) return [];

        return comparisonResult.data.filter((row) => {
            // Find column indices based on headers
            const headersLower = comparisonResult.headers.map(h => h.toLowerCase());
            const proveedorIdx = headersLower.indexOf("proveedor");
            const nitIdx = headersLower.indexOf("nit");
            const nroFacturaIdx = headersLower.indexOf("factura") !== -1 ? headersLower.indexOf("factura") : headersLower.indexOf("nro. factura");
            const valorIdx = headersLower.indexOf("valor total");

            return (
                (proveedorIdx === -1 || String(row[proveedorIdx] || "").toLowerCase().includes(filters.Proveedor.toLowerCase())) &&
                (nitIdx === -1 || String(row[nitIdx] || "").toLowerCase().includes(filters.Nit.toLowerCase())) &&
                (nroFacturaIdx === -1 || String(row[nroFacturaIdx] || "").toLowerCase().includes(filters.Nro_Factura.toLowerCase())) &&
                (valorIdx === -1 || String(row[valorIdx] || "").toLowerCase().includes(filters["Valor total"].toLowerCase()))
            );
        });
    }, [comparisonResult, filters]);

    const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFilters(prev => ({ ...prev, [name]: value }));
    };

    const handleExcelConfirmed = (headers: string[], data: any[][]) => {
        setComparisonResult({ headers, data });
        setSelectedRows(new Set()); // Reset selection on new data
        setSaveSuccess(false);
    };

    const toggleRow = (index: number) => {
        const newSelected = new Set(selectedRows);
        if (newSelected.has(index)) {
            newSelected.delete(index);
        } else {
            newSelected.add(index);
        }
        setSelectedRows(newSelected);
    };

    const toggleAll = () => {
        if (selectedRows.size === filteredResults.length && filteredResults.length > 0) {
            setSelectedRows(new Set());
        } else {
            setSelectedRows(new Set(filteredResults.map((_, i) => i)));
        }
    };

    const handleSaveSelected = async () => {
        if (!comparisonResult || selectedRows.size === 0) return;

        setIsSaving(true);
        setError(null);
        setSaveSuccess(false);

        try {
            const headersLower = comparisonResult.headers.map(h => h.toLowerCase().trim());

            // Map indices using robust name matching
            const mapIdx = (names: string[]) => {
                for (const name of names) {
                    const idx = headersLower.indexOf(name.toLowerCase());
                    if (idx !== -1) return idx;
                }
                return -1;
            };

            const tipoDocIdx = mapIdx(["tipo de documento", "tipo_documento", "documento"]);
            const cufeIdx = mapIdx(["cufe/cude", "cufe", "cude", "uuid"]);
            const folioIdx = mapIdx(["folio", "nro. factura", "nro_factura"]);
            const prefijoIdx = mapIdx(["prefijo"]);
            const fechaEmisionIdx = mapIdx(["fecha emisin", "fecha emision", "fecha emisión", "fecha_emision"]);
            const fechaRecepcionIdx = mapIdx(["fecha recepcin", "fecha recepcion", "fecha recepción", "fecha_recepcion"]);
            const nitEmisorIdx = mapIdx(["nit emisor", "nit_emisor", "nit emi", "nit"]);
            const nombreEmisorIdx = mapIdx(["nombre emisor", "nombre_emisor", "adquiriente", "proveedor"]);
            const ivaIdx = mapIdx(["iva", "impuesto"]);
            const incIdx = mapIdx(["inc"]);
            const totalIdx = mapIdx(["total", "valor total", "valor_total", "valor"]);

            const selectedData = Array.from(selectedRows).map(index => {
                const row = filteredResults[index];
                // Use a proper timestamp + random for the ID (must be unique)
                // Use a proper timestamp + random for the ID (must be unique)
                const uniqueId = BigInt(Date.now()) * BigInt(1000) + BigInt(Math.floor(Math.random() * 1000));

                return {
                    ID: Number(uniqueId % BigInt(9007199254740991)), // Cap at MAX_SAFE_INTEGER for JS compatibility
                    "Tipo_de_documento": tipoDocIdx !== -1 ? String(row[tipoDocIdx] || "") : null,
                    "CUFE/CUDE": cufeIdx !== -1 ? String(row[cufeIdx] || "") : null,
                    "Folio": folioIdx !== -1 ? String(row[folioIdx] || "") : null,
                    "Prefijo": prefijoIdx !== -1 ? String(row[prefijoIdx] || "") : null,
                    "Fecha_Emision": fechaEmisionIdx !== -1 ? String(row[fechaEmisionIdx] || "") : null,
                    "Fecha_Recepcion": fechaRecepcionIdx !== -1 ? String(row[fechaRecepcionIdx] || "") : null,
                    "NIT_Emisor": nitEmisorIdx !== -1 ? String(row[nitEmisorIdx] || "") : null,
                    "Nombre_Emisor": nombreEmisorIdx !== -1 ? String(row[nombreEmisorIdx] || "") : null,
                    "IVA": ivaIdx !== -1 ? String(row[ivaIdx] || "") : null,
                    "INC": incIdx !== -1 ? String(row[incIdx] || "") : null,
                    "Total": totalIdx !== -1 ? String(row[totalIdx] || "") : null,
                };
            });

            const { error: insertError } = await supabase
                .from("Facturas pendientes")
                .insert(selectedData);

            if (insertError) throw insertError;

            setSaveSuccess(true);

            // Remove saved rows from both selection and the data
            const savedRowIndicesInFiltered = Array.from(selectedRows);
            const savedRowsData = savedRowIndicesInFiltered.map(idx => filteredResults[idx]);

            // Filter out these rows from the original comparisonResult.data
            const remainingData = comparisonResult.data.filter(row =>
                !savedRowsData.some(savedRow => JSON.stringify(savedRow) === JSON.stringify(row))
            );

            setComparisonResult({ ...comparisonResult, data: remainingData });
            setSelectedRows(new Set());
            fetchFacturasPendientes(); // Refresh the saved list

            // Clear success message after 5 seconds
            setTimeout(() => setSaveSuccess(false), 5000);

        } catch (err: any) {
            console.error("Error saving selected facturas:", err);
            setError(err.message || "Error al guardar las facturas seleccionadas.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="flex h-screen bg-[#f8fafc]">
            <Sidebar />

            <main className="flex-1 md:ml-64 p-8 overflow-y-auto">
                <div className="max-w-7xl mx-auto space-y-6">
                    {/* Header */}
                    <div className="flex flex-col gap-4">
                        <Link
                            href="/"
                            className="flex items-center gap-2 text-sm text-gray-500 hover:text-[#254153] transition-colors w-fit"
                        >
                            <ArrowLeft className="h-4 w-4" />
                            Volver al Dashboard
                        </Link>
                        <div className="flex items-center justify-between">
                            <div>
                                <h1 className="text-3xl font-bold text-[#254153]">Revisión de factura DIAN</h1>
                                <p className="text-gray-500 mt-1">Gestiona las facturas pendientes y compara nuevos archivos Excel.</p>
                            </div>
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => setShowSavedList(!showSavedList)}
                                    className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all shadow-sm ${showSavedList ? 'bg-[#254153] text-white' : 'bg-white text-[#254153] border border-gray-100'}`}
                                >
                                    {showSavedList ? 'Ocultar Guardados' : `Ver Guardados (${facturasPendientes.length})`}
                                </button>
                                <button
                                    onClick={() => setIsUploadModalOpen(true)}
                                    className="p-2 bg-white rounded-lg shadow-sm hover:shadow-md transition-all text-[#254153]"
                                    title="Cargar Documento Excel"
                                >
                                    <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Saved Facturas List */}
                    {showSavedList && facturasPendientes.length > 0 && (
                        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden animate-in fade-in slide-in-from-top-4 duration-500">
                            <div className="px-6 py-4 border-b border-gray-50 flex items-center justify-between bg-gray-50/50">
                                <h2 className="text-lg font-bold text-[#254153] flex items-center gap-2">
                                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                                    Facturas Guardadas en el Sistema
                                </h2>
                                <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">{facturasPendientes.length} registros</span>
                            </div>
                            <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-white text-gray-400 font-medium border-b border-gray-100 sticky top-0">
                                        <tr>
                                            <th className="px-6 py-3">Factura / Folio</th>
                                            <th className="px-6 py-3">Emisor</th>
                                            <th className="px-6 py-3">NIT</th>
                                            <th className="px-6 py-3">Fecha Emisión</th>
                                            <th className="px-6 py-3 text-right">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {facturasPendientes.map((factura) => (
                                            <tr key={factura.ID} className="hover:bg-gray-50/30 transition-colors">
                                                <td className="px-6 py-3 font-medium text-[#254153]">
                                                    {factura.Prefijo}{factura.Folio}
                                                </td>
                                                <td className="px-6 py-3 text-gray-500">{factura.Nombre_Emisor}</td>
                                                <td className="px-6 py-3 text-gray-500">{factura.NIT_Emisor}</td>
                                                <td className="px-6 py-3 text-gray-500">{factura.Fecha_Emision}</td>
                                                <td className="px-6 py-3 text-right font-bold text-[#254153]">
                                                    ${Number(factura.Total).toLocaleString('es-CO')}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {saveSuccess && (
                        <div className="bg-green-50 border border-green-100 rounded-2xl p-4 flex items-center gap-3 text-green-700 animate-in fade-in slide-in-from-top-2 duration-300">
                            <CheckCircle2 className="h-5 w-5" />
                            <p className="font-medium">Facturas guardadas exitosamente en "Facturas pendientes".</p>
                        </div>
                    )}

                    {error && (
                        <div className="bg-red-50 border border-red-100 rounded-2xl p-4 flex items-center gap-3 text-red-700 animate-in fade-in slide-in-from-top-2 duration-300">
                            <AlertCircle className="h-5 w-5" />
                            <p className="font-medium">{error}</p>
                        </div>
                    )}

                    <div className="flex items-center justify-between pt-4">
                        <div className="flex items-center gap-4">
                            <h2 className="text-xl font-bold text-[#254153]">Resultados de Comparación</h2>
                            {comparisonResult && (
                                <button
                                    onClick={() => {
                                        setComparisonResult(null);
                                        setSelectedRows(new Set());
                                        setSaveSuccess(false);
                                    }}
                                    className="text-red-500 text-xs font-semibold hover:underline"
                                >
                                    Limpiar Resultados
                                </button>
                            )}
                        </div>
                        {comparisonResult && (
                            <div className="flex items-center gap-3">
                                {selectedRows.size > 0 && (
                                    <Button
                                        onClick={handleSaveSelected}
                                        disabled={isSaving}
                                        className="bg-green-600 hover:bg-green-700 text-white gap-2 shadow-lg shadow-green-900/10"
                                    >
                                        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                        Guardar Seleccionados ({selectedRows.size})
                                    </Button>
                                )}
                                <span className="text-sm text-gray-400">{filteredResults.length} facturas faltantes</span>
                            </div>
                        )}
                    </div>

                    <ExcelUploadModal
                        isOpen={isUploadModalOpen}
                        onClose={() => setIsUploadModalOpen(false)}
                        existingInvoices={facturas}
                        onConfirm={handleExcelConfirmed}
                    />

                    {/* Content Section */}
                    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden min-h-[300px]">
                        {!comparisonResult ? (
                            <div className="p-20 flex flex-col items-center justify-center text-center gap-6 animate-in fade-in duration-700">
                                <div className="p-6 bg-[#254153]/5 rounded-3xl">
                                    <RefreshCw className="h-12 w-12 text-[#254153] opacity-20" />
                                </div>
                                <div className="max-w-md">
                                    <h3 className="text-xl font-bold text-[#254153] mb-2">Sin datos para comparar</h3>
                                    <p className="text-gray-500">
                                        Haz clic en el botón de actualización arriba para cargar un documento Excel y compararlo con el sistema.
                                    </p>
                                </div>
                                <button
                                    onClick={() => setIsUploadModalOpen(true)}
                                    className="bg-[#254153] text-white px-8 py-3 rounded-xl font-semibold hover:bg-[#1a2e3b] transition-all shadow-lg shadow-blue-900/10"
                                >
                                    Cargar Excel ahora
                                </button>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-200">
                                        <tr>
                                            <th className="px-6 py-4 w-10">
                                                <button
                                                    onClick={toggleAll}
                                                    className="p-1 hover:bg-gray-200 rounded transition-colors"
                                                >
                                                    {selectedRows.size === filteredResults.length && filteredResults.length > 0 ? (
                                                        <CheckSquare className="h-4 w-4 text-[#254153]" />
                                                    ) : (
                                                        <Square className="h-4 w-4 text-gray-400" />
                                                    )}
                                                </button>
                                            </th>
                                            {comparisonResult.headers.map((header, i) => (
                                                <th key={i} className="px-6 py-4">
                                                    <div className="flex flex-col gap-2 min-w-[120px]">
                                                        <span>{header}</span>
                                                        {["Proveedor", "NIT", "Factura", "Nro. Factura", "Valor Total"].includes(header) && (
                                                            <div className="relative">
                                                                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400" />
                                                                <input
                                                                    type="text"
                                                                    name={header === "Factura" || header === "Nro. Factura" ? "Nro_Factura" : header}
                                                                    value={filters[header === "Factura" || header === "Nro. Factura" ? "Nro_Factura" : header as keyof typeof filters] || ""}
                                                                    onChange={handleFilterChange}
                                                                    placeholder="Filtrar..."
                                                                    className="w-full pl-7 pr-2 py-1 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#254153] font-normal"
                                                                />
                                                            </div>
                                                        )}
                                                    </div>
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {filteredResults.map((row, rowIndex) => (
                                            <tr key={rowIndex} className={`hover:bg-gray-50/50 transition-colors ${selectedRows.has(rowIndex) ? 'bg-[#254153]/5' : ''}`}>
                                                <td className="px-6 py-4">
                                                    <button
                                                        onClick={() => toggleRow(rowIndex)}
                                                        className="p-1 hover:bg-gray-200 rounded transition-colors"
                                                    >
                                                        {selectedRows.has(rowIndex) ? (
                                                            <CheckSquare className="h-4 w-4 text-[#254153]" />
                                                        ) : (
                                                            <Square className="h-4 w-4 text-gray-400" />
                                                        )}
                                                    </button>
                                                </td>
                                                {comparisonResult.headers.map((header, colIndex) => {
                                                    const isStatusCol = header === "Estado en Sistema";
                                                    const value = row[colIndex]?.toString() || "";
                                                    return (
                                                        <td key={colIndex} className="px-6 py-4 text-gray-500 whitespace-nowrap">
                                                            {isStatusCol ? (
                                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-100">
                                                                    {value}
                                                                </span>
                                                            ) : (
                                                                value
                                                            )}
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {filteredResults.length === 0 && (
                                    <div className="p-12 text-center text-gray-500">
                                        No hay registros que coincidan con los filtros.
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
}
