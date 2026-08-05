/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
    CheckCircle2,
    XCircle,
    FileText,
    User,
    Calendar,
    DollarSign,
    AlertCircle,
    Building2,
    Hash,
    ChevronLeft,
    ChevronRight,
    Loader2,
    Plus,
    Trash2,
    Download,
    Upload,
    X,
    Home,
    Ship
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import * as XLSX from "xlsx";

interface RadicadoData {
    id: string;
    proveedor: string;
    nit: string;
    valorTotal: string;
    nroFactura: string;
    consecutivo?: string;
    fechaRegistro: string;
    estadoFactura: string;
    aprobacionDoliente: string;
    gestionContabilidad: string;
    responsableActual?: string;
    documentInfo?: any;
    adjuntosUrl?: string[];
    observaciones?: string;
    distribuciones?: string | any[];
    moneda?: string;
}

const parseSafeFloat = (val: any): number => {
    if (!val) return 0;
    if (typeof val === 'number') return val;
    let s = val.toString().replace(/[^\d,. -]/g, '').trim();
    if (!s) return 0;
    
    const hasComma = s.includes(',');
    const hasDot = s.includes('.');
    
    if (hasComma && hasDot) {
        if (s.indexOf('.') < s.indexOf(',')) {
            s = s.replace(/\./g, '').replace(',', '.');
        } else {
            s = s.replace(/,/g, '');
        }
    } else if (hasComma) {
        s = s.replace(',', '.');
    }
    const res = parseFloat(s);
    return isNaN(res) ? 0 : res;
};

function RadicadoApprovalContent() {
    const params = useParams();
    const itemId = params.id as string;
    const searchParams = useSearchParams();
    const isReadOnlyMode = searchParams.get("readonly") === "true";
    const initialResponsable = searchParams.get("responsable");

    const [radicado, setRadicado] = useState<RadicadoData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    const [observaciones, setObservaciones] = useState<string>("");
    const [distribuciones, setDistribuciones] = useState<{ centroCostos: string; cuenta: string; valor: string }[]>([
        { centroCostos: "", cuenta: "", valor: "" }
    ]);
    const [editableTotal, setEditableTotal] = useState<string>("");

    const [centrosCostosOptions, setCentrosCostosOptions] = useState<{ value: string; label: string }[]>([]);
    const [cuentasOptions, setCuentasOptions] = useState<{ value: string; label: string }[]>([]);
    const [downloadLoading, setDownloadLoading] = useState(false);

    const [showRejectModal, setShowRejectModal] = useState(false);
    const [rejectReason, setRejectReason] = useState("");

    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isUploadingExcel, setIsUploadingExcel] = useState(false);

    const isProcessed = radicado?.aprobacionDoliente === 'Aprobado' || radicado?.aprobacionDoliente === 'Rechazado';

    useEffect(() => {
        const fetchCatalogs = async () => {
            try {
                const [ccRes, ctasRes] = await Promise.all([
                    fetch('/api/externo/catalogos?type=centrosCostos'),
                    fetch('/api/externo/catalogos?type=cuentas')
                ]);
                const ccData = await ccRes.json();
                const ctasData = await ctasRes.json();
                if (ccData.items) setCentrosCostosOptions(ccData.items);
                if (ctasData.items) setCuentasOptions(ctasData.items);
            } catch (err) {
                console.error("Error loading catalogs:", err);
            }
        };
        fetchCatalogs();
    }, []);

    useEffect(() => {
        const fetchRadicado = async () => {
            try {
                setLoading(true);
                const res = await fetch(`/api/externo/radicado/${itemId}`);
                const data = await res.json();

                if (data.error) throw new Error(data.error);

                setRadicado(data);
                setObservaciones(data.observaciones || "");
                setEditableTotal(data.valorTotal || "0");

                if (data.distribuciones) {
                    try {
                        const parsed = typeof data.distribuciones === 'string'
                            ? JSON.parse(data.distribuciones)
                            : data.distribuciones;
                        if (Array.isArray(parsed) && parsed.length > 0) {
                            setDistribuciones(parsed.map((d: any) => ({
                                centroCostos: d.centroCostos || d.centroCosto || "",
                                cuenta: d.cuenta || "",
                                valor: d.valor ? String(d.valor) : ""
                            })));
                        }
                    } catch (e) {
                        console.error("Failed to parse distribuciones:", e);
                    }
                }
            } catch (err: any) {
                console.error("Error fetching radicado:", err);
                setError(err.message || "No se pudo cargar el radicado de importación.");
            } finally {
                setLoading(false);
            }
        };

        if (itemId) fetchRadicado();
    }, [itemId]);

    const handleAddDistribution = () => {
        setDistribuciones(prev => [...prev, { centroCostos: "", cuenta: "", valor: "" }]);
    };

    const handleRemoveDistribution = (index: number) => {
        setDistribuciones(prev => prev.filter((_, i) => i !== index));
    };

    const handleDistributionChange = (index: number, field: string, value: string) => {
        setDistribuciones(prev => {
            const copy = [...prev];
            copy[index] = { ...copy[index], [field]: value };
            return copy;
        });
    };

    const totalDistributed = distribuciones.reduce((acc, curr) => acc + parseSafeFloat(curr.valor), 0);
    const invoiceTotal = parseSafeFloat(editableTotal || radicado?.valorTotal || 0);
    const isBalanced = invoiceTotal > 0 && Math.abs(totalDistributed - invoiceTotal) < 1;

    const handleAction = async (action: 'Aprobado' | 'Rechazado', reason?: string) => {
        if (!radicado) return;

        if (action === 'Aprobado') {
            const hasEmptyDist = distribuciones.some(d => !d.centroCostos || !d.cuenta || parseSafeFloat(d.valor) <= 0);
            if (hasEmptyDist) {
                alert("Por favor complete todos los campos de Centro de Costos, Cuenta Contable y Valor en la distribución.");
                return;
            }
            if (!isBalanced) {
                alert(`La suma de las distribuciones ($${totalDistributed.toLocaleString()}) debe ser igual al valor total ($${invoiceTotal.toLocaleString()}).`);
                return;
            }
        }

        try {
            setActionLoading(action);
            const res = await fetch('/api/externo/accion-radicado', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    itemId: radicado.id,
                    action,
                    observaciones: reason || observaciones,
                    distribuciones,
                    valor: editableTotal || radicado.valorTotal
                })
            });

            const data = await res.json();
            if (data.error) throw new Error(data.error);

            setSuccessMessage(action === 'Aprobado'
                ? "El radicado de importación ha sido aprobado exitosamente."
                : "El radicado de importación ha sido rechazado.");
        } catch (err: any) {
            console.error(`Error saving action ${action}:`, err);
            alert(`Error al procesar: ${err.message}`);
        } finally {
            setActionLoading(null);
            setShowRejectModal(false);
        }
    };

    const handleDownload = async () => {
        if (!radicado) return;
        setDownloadLoading(true);
        try {
            const url = `/api/externo/radicado/${radicado.id}/download?download=true`;
            window.open(url, '_blank');
        } catch (err) {
            console.error("Error downloading attachment:", err);
            alert("No se pudo descargar el archivo.");
        } finally {
            setDownloadLoading(false);
        }
    };

    const handleExcelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploadingExcel(true);
        const reader = new FileReader();

        reader.onload = (evt) => {
            try {
                const bstr = evt.target?.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];
                const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

                if (!data || data.length < 2) {
                    alert("El archivo Excel parece estar vacío o no contiene filas de datos.");
                    return;
                }

                const headers = data[0].map((h: any) => String(h || "").trim().toLowerCase());
                let ccIdx = headers.findIndex(h => h.includes("centro") || h.includes("ceco") || h.includes("costo"));
                let ctaIdx = headers.findIndex(h => h.includes("cuenta") || h.includes("cta") || h.includes("contable"));
                let valIdx = headers.findIndex(h => h.includes("valor") || h.includes("monto") || h.includes("total") || h.includes("importe"));

                if (ccIdx === -1) ccIdx = 0;
                if (ctaIdx === -1) ctaIdx = 1;
                if (valIdx === -1) valIdx = 2;

                const parsedDistributions: { centroCostos: string; cuenta: string; valor: string }[] = [];

                for (let i = 1; i < data.length; i++) {
                    const row = data[i];
                    if (!row || row.length === 0) continue;

                    const rawCC = row[ccIdx] ? String(row[ccIdx]).trim() : "";
                    const rawCta = row[ctaIdx] ? String(row[ctaIdx]).trim() : "";
                    const rawVal = row[valIdx] !== undefined ? String(row[valIdx]).trim() : "";

                    if (!rawCC && !rawCta && !rawVal) continue;

                    const matchedCC = centrosCostosOptions.find(o => 
                        o.value.toLowerCase() === rawCC.toLowerCase() || 
                        o.label.toLowerCase().includes(rawCC.toLowerCase()) ||
                        (rawCC.length > 2 && o.value.toLowerCase().includes(rawCC.toLowerCase()))
                    )?.value || rawCC;

                    const matchedCta = cuentasOptions.find(o => 
                        o.value.toLowerCase() === rawCta.toLowerCase() || 
                        o.label.toLowerCase().includes(rawCta.toLowerCase()) ||
                        (rawCta.length > 2 && o.value.toLowerCase().includes(rawCta.toLowerCase()))
                    )?.value || rawCta;

                    const cleanVal = parseSafeFloat(rawVal);

                    parsedDistributions.push({
                        centroCostos: matchedCC,
                        cuenta: matchedCta,
                        valor: cleanVal > 0 ? String(cleanVal) : ""
                    });
                }

                if (parsedDistributions.length > 0) {
                    setDistribuciones(parsedDistributions);
                    alert(`Se cargaron ${parsedDistributions.length} distribuciones exitosamente.`);
                } else {
                    alert("No se pudieron extraer distribuciones válidas del archivo Excel.");
                }

            } catch (err: any) {
                console.error("Error reading Excel file:", err);
                alert(`Error al procesar el archivo Excel: ${err.message}`);
            } finally {
                setIsUploadingExcel(false);
                if (fileInputRef.current) fileInputRef.current.value = "";
            }
        };

        reader.readAsBinaryString(file);
    };

    const formatCurrency = (val: any) => {
        const num = parseSafeFloat(val);
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 2
        }).format(num);
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-[#f8fafc] flex flex-col items-center justify-center p-8">
                <Loader2 className="h-12 w-12 text-[#254153] animate-spin mb-4" />
                <p className="text-gray-500 font-bold tracking-wide">Cargando radicado de importación...</p>
            </div>
        );
    }

    if (error || !radicado) {
        return (
            <div className="min-h-screen bg-[#f8fafc] flex flex-col items-center justify-center p-8">
                <div className="max-w-md w-full bg-white p-8 rounded-3xl shadow-xl border border-gray-100 text-center">
                    <div className="bg-red-50 h-16 w-16 rounded-full flex items-center justify-center mx-auto mb-6">
                        <AlertCircle className="h-8 w-8 text-red-500" />
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Error de Carga</h2>
                    <p className="text-gray-500 mb-6">{error || "No se encontró el radicado solicitado."}</p>
                    <Button
                        onClick={() => window.location.href = `/externo/pendientes?responsable=${encodeURIComponent(initialResponsable || "")}`}
                        className="w-full bg-[#254153] hover:bg-[#1a2e3b] text-white"
                    >
                        Volver a mis pendientes
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#f8fafc] p-4 md:p-8">
            <AnimatePresence mode="wait">
                {successMessage ? (
                    <div className="flex items-center justify-center min-h-[80vh]">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="max-w-md w-full bg-white p-10 rounded-[32px] shadow-2xl text-center"
                        >
                            <div className="bg-green-50 h-20 w-20 rounded-full flex items-center justify-center mx-auto mb-8">
                                <CheckCircle2 className="h-10 w-10 text-green-500" />
                            </div>
                            <h2 className="text-3xl font-bold text-gray-900 mb-4">¡Listo!</h2>
                            <p className="text-gray-600 mb-10 text-lg">{successMessage}</p>

                            <div className="flex flex-col gap-4">
                                <Button
                                    onClick={() => window.location.href = `/externo/pendientes?responsable=${encodeURIComponent(initialResponsable || radicado.responsableActual || "")}`}
                                    className="w-full h-16 bg-[#254153] hover:bg-[#1a2e3b] text-white font-black text-sm rounded-2xl shadow-xl shadow-[#254153]/20 flex items-center justify-center gap-2 group transition-all"
                                >
                                    <span>Ver pendientes por aprobar</span>
                                    <ChevronRight className="h-4 w-4 transform group-hover:translate-x-1 transition-all" />
                                </Button>
                                <div className="text-sm text-gray-400 mt-4">
                                    Si ya no tienes más radicados por gestionar, puedes cerrar esta pestaña.
                                </div>
                            </div>
                        </motion.div>
                    </div>
                ) : (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="max-w-[1600px] mx-auto w-full"
                    >
                        {/* Header */}
                        <div className="flex flex-col md:flex-row md:items-center gap-4 mb-8 px-2">
                            <div className="flex items-center gap-3">
                                <div className="bg-[#254153] p-2.5 rounded-2xl">
                                    <Ship className="h-6 w-6 text-white" />
                                </div>
                                <div>
                                    <h1 className="text-2xl font-bold text-[#254153] flex items-center gap-2">
                                        Radicado de Importación
                                        <span className="text-xs font-black uppercase tracking-wider bg-purple-100 text-purple-700 px-2.5 py-1 rounded-full border border-purple-200">
                                            Importaciones
                                        </span>
                                    </h1>
                                    <p className="text-gray-500 text-sm">Portal externo de aprobación</p>
                                </div>
                            </div>
                            <div className="md:ml-auto flex items-center gap-3">
                                <Button
                                    onClick={() => window.location.href = `/externo/pendientes?responsable=${encodeURIComponent(initialResponsable || radicado.responsableActual || "")}`}
                                    className="flex items-center justify-center gap-2 px-6 py-3 bg-white border-2 border-[#254153]/10 rounded-2xl text-[#254153] text-sm font-bold hover:bg-gray-50 transition-all shadow-sm group"
                                >
                                    <Home className="h-4 w-4" />
                                    Inicio
                                </Button>
                                <Button
                                    onClick={handleDownload}
                                    disabled={downloadLoading}
                                    className="flex items-center justify-center gap-2 px-6 py-3 bg-[#254153]/5 border-2 border-[#254153]/10 rounded-2xl text-[#254153] text-sm font-bold hover:bg-[#254153] hover:text-white transition-all shadow-sm group"
                                >
                                    {downloadLoading ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <Download className="h-4 w-4" />
                                    )}
                                    {downloadLoading ? "Buscando..." : `Descargar Radicado #${radicado.consecutivo || radicado.nroFactura}`}
                                </Button>
                            </div>
                        </div>

                        {/* Layout Grid */}
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                            
                            {/* Left Column: Data & Forms */}
                            <div className="lg:col-span-5 space-y-8">
                                {/* Info Card */}
                                <div className="bg-white rounded-[32px] shadow-xl border border-gray-100 overflow-hidden">
                                    <div className={`px-8 py-4 ${
                                        radicado.aprobacionDoliente === 'Aprobado' ? 'bg-green-50 text-green-700' :
                                        radicado.aprobacionDoliente === 'Rechazado' ? 'bg-red-50 text-red-700' :
                                        'bg-blue-50 text-blue-700'
                                    } flex items-center justify-between font-bold border-b border-gray-100`}>
                                        <span className="text-sm tracking-wide uppercase">Estado del Radicado</span>
                                        <span className="px-3 py-1 bg-white rounded-full text-xs shadow-sm font-black">
                                            {radicado.aprobacionDoliente || "Pendiente"}
                                        </span>
                                    </div>

                                    <div className="p-8 space-y-6">
                                        <div className="grid grid-cols-2 gap-6">
                                            <div className="space-y-1">
                                                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Proveedor</span>
                                                <p className="font-bold text-gray-900 text-lg leading-tight">{radicado.proveedor}</p>
                                            </div>
                                            <div className="space-y-1">
                                                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">NIT</span>
                                                <p className="font-bold text-gray-700">{radicado.nit}</p>
                                            </div>
                                            <div className="space-y-1">
                                                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Nro. Factura / Radicado</span>
                                                <p className="font-bold text-gray-700">{radicado.nroFactura}</p>
                                            </div>
                                            <div className="space-y-1">
                                                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Consecutivo</span>
                                                <p className="font-bold text-gray-700">{radicado.consecutivo || "N/A"}</p>
                                            </div>
                                            <div className="space-y-1">
                                                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Fecha Creación</span>
                                                <p className="font-bold text-gray-700">
                                                    {radicado.fechaRegistro ? new Date(radicado.fechaRegistro).toLocaleDateString() : 'N/A'}
                                                </p>
                                            </div>
                                            <div className="space-y-1">
                                                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Responsable</span>
                                                <p className="font-bold text-gray-700">{radicado.responsableActual || "No asignado"}</p>
                                            </div>
                                        </div>

                                        <div className="pt-6 border-t border-gray-100 flex items-center justify-between">
                                            <span className="text-sm font-bold text-gray-500 uppercase tracking-wider">Valor Total (USD)</span>
                                            <div className="text-right">
                                                <span className="text-3xl font-black text-[#254153]">
                                                    {formatCurrency(editableTotal || radicado.valorTotal)}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Distribution / Accounting Card */}
                                <div className="bg-white rounded-[32px] shadow-xl border border-gray-100 p-8 space-y-6">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <h3 className="text-lg font-bold text-[#254153]">Distribución Contable</h3>
                                            <p className="text-xs text-gray-400 font-medium">Asignación de Centro de Costos y Cuentas</p>
                                        </div>
                                        
                                        {!isProcessed && !isReadOnlyMode && (
                                            <div className="flex items-center gap-2">
                                                <input 
                                                    type="file" 
                                                    ref={fileInputRef} 
                                                    onChange={handleExcelUpload} 
                                                    accept=".xlsx,.xls,.csv" 
                                                    className="hidden" 
                                                />
                                                <Button
                                                    type="button"
                                                    onClick={() => fileInputRef.current?.click()}
                                                    disabled={isUploadingExcel}
                                                    variant="outline"
                                                    className="border-[#254153]/20 text-[#254153] hover:bg-[#254153]/5 gap-1.5 text-xs font-bold px-3 py-1.5 h-auto rounded-xl"
                                                >
                                                    {isUploadingExcel ? (
                                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                    ) : (
                                                        <Upload className="h-3.5 w-3.5" />
                                                    )}
                                                    Cargar Excel
                                                </Button>
                                                <Button
                                                    type="button"
                                                    onClick={handleAddDistribution}
                                                    className="bg-[#254153] text-white hover:bg-[#1a2e3b] gap-1.5 text-xs font-bold px-3 py-1.5 h-auto rounded-xl"
                                                >
                                                    <Plus className="h-3.5 w-3.5" />
                                                    Agregar
                                                </Button>
                                            </div>
                                        )}
                                    </div>

                                    <div className="space-y-4">
                                        {distribuciones.map((dist, idx) => (
                                            <div key={idx} className="p-4 bg-gray-50/70 rounded-2xl border border-gray-100 space-y-3 relative group">
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                    <div>
                                                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                                                            Centro de Costos
                                                        </label>
                                                        <SearchableSelect
                                                            options={centrosCostosOptions}
                                                            value={dist.centroCostos}
                                                            onChange={(val) => handleDistributionChange(idx, "centroCostos", val)}
                                                            placeholder="Seleccionar..."
                                                            disabled={isProcessed || isReadOnlyMode}
                                                            className="w-full text-xs"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                                                            Cuenta Contable
                                                        </label>
                                                        <SearchableSelect
                                                            options={cuentasOptions}
                                                            value={dist.cuenta}
                                                            onChange={(val) => handleDistributionChange(idx, "cuenta", val)}
                                                            placeholder="Seleccionar..."
                                                            disabled={isProcessed || isReadOnlyMode}
                                                            className="w-full text-xs"
                                                        />
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <div className="flex-1">
                                                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                                                            Valor (USD)
                                                        </label>
                                                        <input
                                                            type="text"
                                                            value={dist.valor}
                                                            onChange={(e) => handleDistributionChange(idx, "valor", e.target.value)}
                                                            disabled={isProcessed || isReadOnlyMode}
                                                            placeholder="0.00"
                                                            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-800 outline-none focus:border-[#254153]"
                                                        />
                                                    </div>
                                                    {!isProcessed && !isReadOnlyMode && distribuciones.length > 1 && (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleRemoveDistribution(idx)}
                                                            className="mt-5 p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Balance Indicator */}
                                    <div className={`p-4 rounded-2xl border flex items-center justify-between text-xs font-bold ${
                                        isBalanced
                                            ? 'bg-green-50/50 border-green-200 text-green-800'
                                            : 'bg-amber-50/50 border-amber-200 text-amber-800'
                                    }`}>
                                        <span>Total Distribuido: {formatCurrency(totalDistributed)}</span>
                                        <span>{isBalanced ? "✓ Cuadrado" : `Diferencia: ${formatCurrency(invoiceTotal - totalDistributed)}`}</span>
                                    </div>
                                </div>

                                {/* Observations */}
                                <div className="bg-white rounded-[32px] shadow-xl border border-gray-100 p-8 space-y-4">
                                    <h3 className="text-lg font-bold text-[#254153]">Observaciones</h3>
                                    <textarea
                                        value={observaciones}
                                        onChange={(e) => setObservaciones(e.target.value)}
                                        disabled={isProcessed || isReadOnlyMode}
                                        placeholder="Escribe aquí observaciones o comentarios para el área contable..."
                                        rows={3}
                                        className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl text-sm font-medium text-gray-700 outline-none focus:border-[#254153] focus:bg-white transition-all resize-none"
                                    />
                                </div>

                                {/* Actions Footer */}
                                {!isProcessed && !isReadOnlyMode && (
                                    <div className="flex gap-4">
                                        <Button
                                            type="button"
                                            onClick={() => setShowRejectModal(true)}
                                            disabled={actionLoading !== null}
                                            className="flex-1 py-4 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-2xl font-black text-sm transition-all"
                                        >
                                            <XCircle className="h-4 w-4 mr-2" />
                                            Rechazar
                                        </Button>
                                        <Button
                                            type="button"
                                            onClick={() => handleAction('Aprobado')}
                                            disabled={actionLoading !== null || !isBalanced}
                                            className="flex-[2] py-4 bg-[#254153] hover:bg-[#1a2e3b] text-white rounded-2xl font-black text-sm shadow-xl shadow-[#254153]/20 transition-all flex items-center justify-center gap-2"
                                        >
                                            {actionLoading === 'Aprobado' ? (
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                            ) : (
                                                <CheckCircle2 className="h-4 w-4" />
                                            )}
                                            Aprobar Radicado
                                        </Button>
                                    </div>
                                )}
                            </div>

                            {/* Right Column: PDF Viewer */}
                            <div className="lg:col-span-7 sticky top-8">
                                <div className="bg-white rounded-[32px] shadow-xl border border-gray-100 p-4 h-[calc(100vh-100px)] min-h-[600px] flex flex-col">
                                    <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 mb-2">
                                        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                                            <FileText className="h-4 w-4 text-blue-500" />
                                            Vista Previa del Documento
                                        </span>
                                        <a
                                            href={`/api/externo/radicado/${radicado.id}/download?download=true`}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1"
                                        >
                                            <Download className="h-3.5 w-3.5" />
                                            Descargar
                                        </a>
                                    </div>

                                    <div className="flex-1 bg-gray-50 rounded-2xl overflow-hidden relative">
                                        <iframe
                                            src={`/api/externo/radicado/${radicado.id}/download`}
                                            className="w-full h-full border-0 rounded-2xl"
                                            title="Document Preview"
                                        />
                                    </div>
                                </div>
                            </div>

                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Rejection Modal */}
            <AnimatePresence>
                {showRejectModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl border border-gray-100 space-y-6"
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3 text-red-600 font-bold text-lg">
                                    <XCircle className="h-6 w-6" />
                                    Rechazar Radicado
                                </div>
                                <button
                                    onClick={() => setShowRejectModal(false)}
                                    className="p-2 text-gray-400 hover:text-gray-600 rounded-full"
                                >
                                    <X className="h-5 w-5" />
                                </button>
                            </div>

                            <p className="text-sm text-gray-600">
                                Por favor indica el motivo por el cual rechazas este radicado de importación:
                            </p>

                            <textarea
                                value={rejectReason}
                                onChange={(e) => setRejectReason(e.target.value)}
                                placeholder="Motivo de rechazo..."
                                rows={4}
                                className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl text-sm font-medium outline-none focus:border-red-500 focus:bg-white resize-none"
                            />

                            <div className="flex gap-3">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => setShowRejectModal(false)}
                                    className="flex-1 py-3 border-gray-200 rounded-xl"
                                >
                                    Cancelar
                                </Button>
                                <Button
                                    type="button"
                                    onClick={() => handleAction('Rechazado', rejectReason)}
                                    disabled={!rejectReason.trim() || actionLoading !== null}
                                    className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold"
                                >
                                    {actionLoading === 'Rechazado' ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        "Confirmar Rechazo"
                                    )}
                                </Button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}

export default function RadicadoApprovalPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-[#f8fafc] flex flex-col items-center justify-center p-8">
                <Loader2 className="h-12 w-12 text-[#254153] animate-spin mb-4" />
                <p className="text-gray-500 font-bold tracking-wide">Cargando...</p>
            </div>
        }>
            <RadicadoApprovalContent />
        </Suspense>
    );
}
