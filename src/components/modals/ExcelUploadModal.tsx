"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2, Check, AlertTriangle, Square } from "lucide-react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/Button";
import { RegistroFactura } from "@/types";

interface ExcelUploadModalProps {
    isOpen: boolean;
    onClose: () => void;
    existingInvoices: RegistroFactura[];
    allInvoiceNumbers?: Set<string>;
    onConfirm: (headers: string[], data: any[][]) => void;
}

export function ExcelUploadModal({ isOpen, onClose, existingInvoices, allInvoiceNumbers, onConfirm }: ExcelUploadModalProps) {
    const [file, setFile] = useState<File | null>(null);
    const [previewData, setPreviewData] = useState<any[]>([]);
    const [allMissingData, setAllMissingData] = useState<any[][]>([]);
    const [headers, setHeaders] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [spLoading, setSpLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [spNumbers, setSpNumbers] = useState<Set<string> | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (selectedFile) {
            await fetchSpNumbersAndProcess(selectedFile);
        }
    };

    const fetchSpNumbersAndProcess = async (selectedFile: File) => {
        setSpLoading(true);
        setError(null);
        setFile(selectedFile);
        try {
            const res = await fetch('/api/sharepoint/invoice-numbers');
            const json = await res.json();
            if (!json.success) throw new Error(json.error || 'Error cargando datos de SharePoint');
            const numbers = new Set<string>(json.numbers as string[]);
            setSpNumbers(numbers);
            console.log(`[MODAL] Loaded ${numbers.size} invoice numbers from SharePoint (cached: ${json.cached}).`);
            processFile(selectedFile, numbers);
        } catch (err: any) {
            console.warn('[MODAL] SP fetch failed, falling back to Supabase set:', err.message);
            // Fallback to the Supabase-sourced set if SP is unreachable
            processFile(selectedFile, allInvoiceNumbers || null);
        } finally {
            setSpLoading(false);
        }
    };

    const processFile = (file: File, invoiceNumbersOverride?: Set<string> | null) => {
        setLoading(true);
        setError(null);
        setFile(file);

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = e.target?.result;
                const workbook = XLSX.read(data, { type: "binary" });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

                if (json.length > 0) {
                    const rawHeaders = json[0].map(h => String(h || "").toLowerCase().trim());
                    const prefijoIndex = rawHeaders.indexOf("prefijo");
                    const folioIndex = rawHeaders.indexOf("folio");

                    let currentHeaders = [...json[0].map(h => String(h || ""))];
                    let currentDataRows = json.slice(1);

                    if (prefijoIndex !== -1 && folioIndex !== -1) {
                        // Add "Factura" at the beginning (or near the part)
                        currentHeaders.splice(0, 0, "Factura");

                        currentDataRows = currentDataRows.map(row => {
                            const newRow = [...row];
                            const prefijo = String(row[prefijoIndex] || "").trim();
                            const folio = String(row[folioIndex] || "").trim();
                            // Insert at index 0, removing any internal space between them
                            newRow.splice(0, 0, `${prefijo}${folio}`.replace(/\s/g, ''));
                            return newRow;
                        });
                    }

                    // Define lower case headers for index searching
                    const initialHeadersLower = currentHeaders.map(h => String(h || "").toLowerCase().trim());

                    // Reorder columns: Move Emisor right after Tipo de Documento
                    const emisorIndex = initialHeadersLower.indexOf("nombre emisor") !== -1
                        ? initialHeadersLower.indexOf("nombre emisor")
                        : initialHeadersLower.indexOf("emisor");
                    const tipoDocIndex = initialHeadersLower.indexOf("tipo de documento");

                    let finalProcessedData: any[][] = [];

                    if (emisorIndex !== -1 && tipoDocIndex !== -1) {
                        // Rename emisor for clarity
                        currentHeaders[emisorIndex] = "Nombre del emisor";

                        // Move emisor column in headers
                        const [emisorHeader] = currentHeaders.splice(emisorIndex, 1);
                        currentHeaders.splice(tipoDocIndex + 1, 0, emisorHeader);

                        // Move emisor in data rows
                        currentDataRows = currentDataRows.map(row => {
                            const newRow = [...row];
                            const [emisorValue] = newRow.splice(emisorIndex, 1);
                            newRow.splice(tipoDocIndex + 1, 0, emisorValue);
                            return newRow;
                        });

                        // Re-calculate headers lower for subsequent logic
                        const updatedHeadersLower = currentHeaders.map(h => String(h || "").toLowerCase().trim());

                        // Filter "Application response" (re-check index after move)
                        const newTipoDocIdx = updatedHeadersLower.indexOf("tipo de documento");
                        currentDataRows = currentDataRows.filter(row =>
                            String(row[newTipoDocIdx] || "").toLowerCase().trim() !== "application response"
                        );

                        // Find "Factura" or "Nro. Factura" for comparison (re-check index)
                        const facturaIndex = updatedHeadersLower.indexOf("factura") !== -1
                            ? updatedHeadersLower.indexOf("factura")
                            : updatedHeadersLower.indexOf("nro. factura") !== -1
                                ? updatedHeadersLower.indexOf("nro. factura")
                                : updatedHeadersLower.indexOf("nro_factura");

                        // Aggressive normalization: lower case, remove everything except letters/numbers, strip zeros after letters and leading zeros
                        const normalizeRef = (num: any) => 
                            String(num || "")
                                .toLowerCase()
                                .replace(/[^a-z0-9]/g, '')
                                .replace(/([a-z])0+/g, '$1')
                                .replace(/^0+/, '');

                        const existingInvoiceNumbers = invoiceNumbersOverride ?? allInvoiceNumbers ?? new Set(
                            existingInvoices.map(inv => normalizeRef(inv.Nro_Factura))
                        );

                        // Add Status Header and Filter for "No encontrado"
                        currentHeaders.push("Estado en Sistema");

                        finalProcessedData = currentDataRows.map(row => {
                            const newRow = [...row];
                            let status = "Desconocido";
                            if (facturaIndex !== -1) {
                                const facturaNum = normalizeRef(row[facturaIndex]);
                                status = existingInvoiceNumbers.has(facturaNum) ? "Encontrado" : "No encontrado";
                            }
                            newRow.push(status);
                            return newRow;
                        }).filter(row => row[row.length - 1] === "No encontrado");

                    } else {
                        // Original logic if columns not found for reordering
                        const tipoDocIndex = initialHeadersLower.indexOf("tipo de documento");
                        if (tipoDocIndex !== -1) {
                            currentDataRows = currentDataRows.filter(row =>
                                String(row[tipoDocIndex] || "").toLowerCase().trim() !== "application response"
                            );
                        }

                        // Find "Factura" or "Nro. Factura" for comparison
                        const facturaIndex = initialHeadersLower.indexOf("factura") !== -1
                            ? initialHeadersLower.indexOf("factura")
                            : initialHeadersLower.indexOf("nro. factura") !== -1
                                ? initialHeadersLower.indexOf("nro. factura")
                                : initialHeadersLower.indexOf("nro_factura");

                        // Aggressive normalization: same logic as above
                        const normalizeRef = (num: any) => 
                            String(num || "")
                                .toLowerCase()
                                .replace(/[^a-z0-9]/g, '')
                                .replace(/([a-z])0+/g, '$1')
                                .replace(/^0+/, '');

                        const existingInvoiceNumbers = invoiceNumbersOverride ?? allInvoiceNumbers ?? new Set(
                            existingInvoices.map(inv => normalizeRef(inv.Nro_Factura))
                        );

                        // Add Status Header and Filter for "No encontrado"
                        currentHeaders.push("Estado en Sistema");

                        finalProcessedData = currentDataRows.map(row => {
                            const newRow = [...row];
                            let status = "Desconocido";
                            if (facturaIndex !== -1) {
                                const facturaNum = normalizeRef(row[facturaIndex]);
                                status = existingInvoiceNumbers.has(facturaNum) ? "Encontrado" : "No encontrado";
                            }
                            newRow.push(status);
                            return newRow;
                        }).filter(row => row[row.length - 1] === "No encontrado");
                    }

                    // List of columns to exclude from the view
                    const columnsToExclude = [
                        "folio", "prefijo", "divisa", "forma de pago", "medio de pago",
                        "fecha de recepcion", "fecha de recepción", "nit receptor", "nombre receptor",
                        "ica", "timbre", "inc bolsas", "inc combustibles", "ic datos",
                        "icl", "inpp", "ibua", "icui", "reteiva", "reterenta",
                        "rete ica", "estado", "grupo",
                        "ic", "in carbono", "in combustibles", "rete iva", "rete renta"
                    ];

                    // Identify indices of columns to keep
                    const keptIndices = currentHeaders
                        .map((h, i) => columnsToExclude.includes(String(h || "").toLowerCase().trim()) ? -1 : i)
                        .filter(i => i !== -1);

                    const finalHeaders = keptIndices.map(i => currentHeaders[i]);
                    const finalData = finalProcessedData.map(row => keptIndices.map(i => row[i]));

                    setHeaders(finalHeaders);
                    setAllMissingData(finalData);
                    setPreviewData(finalData.slice(0, 10));

                    if (finalData.length === 0) {
                        setError("Todas las facturas del archivo ya existen en el sistema.");
                    }
                } else {
                    setError("El archivo está vacío.");
                }
            } catch (err) {
                console.error("Error parsing Excel:", err);
                setError("Error al procesar el archivo Excel.");
            } finally {
                setLoading(false);
            }
        };

        reader.onerror = () => {
            setError("Error al leer el archivo.");
            setLoading(false);
        };

        reader.readAsBinaryString(file);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const droppedFile = e.dataTransfer.files?.[0];
        if (droppedFile && (droppedFile.name.endsWith(".xlsx") || droppedFile.name.endsWith(".xls"))) {
            await fetchSpNumbersAndProcess(droppedFile);
        } else {
            setError("Por favor carga un archivo Excel válido (.xlsx o .xls)");
        }
    };

    const reset = () => {
        setFile(null);
        setPreviewData([]);
        setAllMissingData([]);
        setHeaders([]);
        setError(null);
        setSpNumbers(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const handleModalClose = () => {
        reset();
        onClose();
    };

    const handleConfirm = () => {
        onConfirm(headers, allMissingData);
        handleModalClose();
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 text-[#254153]">
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={handleModalClose}
                        className="absolute inset-0 bg-[#254153]/40 backdrop-blur-sm"
                    />

                    {/* Modal Content */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="relative w-full max-w-4xl bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
                    >
                        {/* Header */}
                        <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-white sticky top-0 z-10">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-[#254153]/5 rounded-xl">
                                    <FileSpreadsheet className="h-6 w-6 text-[#254153]" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold">Cargar Documento Excel</h2>
                                    <p className="text-sm text-gray-500">Sube un archivo para previsualizar su contenido</p>
                                </div>
                            </div>
                            <button
                                onClick={handleModalClose}
                                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                            >
                                <X className="h-5 w-5 text-gray-400" />
                            </button>
                        </div>

                        {/* Body */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-6">
                            {!file ? (
                                <div
                                    onDragOver={handleDragOver}
                                    onDrop={handleDrop}
                                    onClick={() => fileInputRef.current?.click()}
                                    className="border-2 border-dashed border-gray-200 rounded-3xl p-12 flex flex-col items-center justify-center gap-4 hover:border-[#254153]/30 hover:bg-[#254153]/5 transition-all cursor-pointer group"
                                >
                                    <div className="p-4 bg-gray-50 rounded-2xl group-hover:bg-white group-hover:shadow-sm transition-all">
                                        <Upload className="h-10 w-10 text-gray-400 group-hover:text-[#254153]" />
                                    </div>
                                    <div className="text-center">
                                        <p className="text-lg font-semibold">Haz clic o arrastra un archivo</p>
                                        <p className="text-sm text-gray-400 mt-1">Soporta archivos .xlsx y .xls</p>
                                    </div>
                                    <input
                                        type="file"
                                        ref={fileInputRef}
                                        onChange={handleFileChange}
                                        accept=".xlsx, .xls"
                                        className="hidden"
                                    />
                                </div>
                            ) : (
                                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                                    {/* File Info */}
                                    <div className="bg-gray-50 rounded-2xl p-4 flex items-center justify-between border border-gray-100">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-green-100 rounded-lg">
                                                <CheckCircle2 className="h-5 w-5 text-green-600" />
                                            </div>
                                            <div>
                                                <p className="font-semibold text-sm">{file.name}</p>
                                                <p className="text-xs text-gray-500">{(file.size / 1024).toFixed(2)} KB</p>
                                            </div>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            onClick={reset}
                                            className="text-red-500 hover:text-red-600 hover:bg-red-50 h-8 px-3 text-xs"
                                        >
                                            Cambiar archivo
                                        </Button>
                                    </div>

                                    {/* Preview Table */}
                                    {spLoading ? (
                                        <div className="h-64 flex flex-col items-center justify-center gap-3">
                                            <Loader2 className="h-8 w-8 text-[#254153] animate-spin" />
                                            <p className="text-sm text-gray-400">Consultando SharePoint…</p>
                                        </div>
                                    ) : loading ? (
                                        <div className="h-64 flex flex-col items-center justify-center gap-3">
                                            <Loader2 className="h-8 w-8 text-[#254153] animate-spin" />
                                            <p className="text-sm text-gray-400">Procesando documento...</p>
                                        </div>
                                    ) : error ? (
                                        <div className="h-64 flex flex-col items-center justify-center gap-3 text-red-500 bg-red-50 rounded-3xl p-6 border border-red-100 text-center">
                                            <AlertCircle className="h-8 w-8" />
                                            <p className="font-semibold">{error}</p>
                                            <Button variant="outline" onClick={reset} className="mt-2">Intentar de nuevo</Button>
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            <div className="flex items-center justify-between">
                                                <h3 className="font-bold">Vista previa (Primeras 10 filas)</h3>
                                                <span className="text-xs text-gray-400">{headers.length} columnas detectadas</span>
                                            </div>
                                            <div className="border border-gray-100 rounded-2xl overflow-hidden overflow-x-auto shadow-sm">
                                                <table className="w-full text-xs text-left">
                                                    <thead className="bg-gray-50 border-b border-gray-100">
                                                        <tr>
                                                            <th className="px-4 py-3 w-8">
                                                                <Square className="h-3 w-3 text-gray-300" />
                                                            </th>
                                                            {headers.map((header, i) => (
                                                                <th key={i} className="px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">
                                                                    {header}
                                                                </th>
                                                            ))}
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-gray-100">
                                                        {previewData.map((row, rowIndex) => (
                                                            <tr key={rowIndex} className="hover:bg-gray-50/50 transition-colors">
                                                                <td className="px-4 py-3">
                                                                    <Square className="h-3 w-3 text-gray-300" />
                                                                </td>
                                                                {headers.map((header, colIndex) => {
                                                                    const isStatusCol = header === "Estado en Sistema";
                                                                    const value = row[colIndex]?.toString() || "";

                                                                    return (
                                                                        <td key={colIndex} className="px-4 py-3 text-gray-500 whitespace-nowrap">
                                                                            {isStatusCol ? (
                                                                                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold ${value === "Encontrado"
                                                                                    ? "bg-green-50 text-green-700 border border-green-100"
                                                                                    : value === "No encontrado"
                                                                                        ? "bg-amber-50 text-amber-700 border border-amber-100"
                                                                                        : "bg-gray-50 text-gray-500 border border-gray-100"
                                                                                    }`}>
                                                                                    {value === "Encontrado" && <Check className="h-3 w-3" />}
                                                                                    {value === "No encontrado" && <AlertTriangle className="h-3 w-3" />}
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
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="p-6 border-t border-gray-100 bg-gray-50/50 flex items-center justify-end gap-3 sticky bottom-0">
                            <Button variant="outline" onClick={handleModalClose}>
                                Cancelar
                            </Button>
                            <Button
                                disabled={!file || !!error || loading}
                                onClick={handleConfirm}
                                className="bg-[#254153] hover:bg-[#1a2e3b] text-white"
                            >
                                Confirmar Carga
                            </Button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
