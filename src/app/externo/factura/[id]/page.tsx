"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
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
    Loader2,
    Plus,
    Trash2,
    Download
} from "lucide-react";
import { Button } from "@/components/ui/Button";

interface InvoiceData {
    id: string;
    proveedor: string;
    nit: string;
    valorTotal: string;
    nroFactura: string;
    fechaRegistro: string;
    estadoFactura: string;
    aprobacionDoliente: string;
    gestionContabilidad: string;
    documentInfo?: any;
}

export default function PublicApprovalPage() {
    const params = useParams();
    const itemId = params.id as string;

    const [invoice, setInvoice] = useState<InvoiceData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [actionLoading, setActionLoading] = useState<string | null>(null); // 'Aprobado' or 'Rechazado'
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    const [observaciones, setObservaciones] = useState<string>("");
    const [distribuciones, setDistribuciones] = useState<{ centroCostos: string; cuenta: string; valor: string }[]>([{ centroCostos: "", cuenta: "", valor: "" }]);
    const [anticipo, setAnticipo] = useState<string>("");

    const [sapBpLoading, setSapBpLoading] = useState(false);
    const [sapBpFound, setSapBpFound] = useState<boolean | null>(null);



    const [centrosCostosList, setCentrosCostosList] = useState<any[]>([]);
    const [cuentasList, setCuentasList] = useState<any[]>([]);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            await Promise.all([fetchInvoice(), fetchCatalogos()]);
            setLoading(false);
        };
        fetchData();
    }, [itemId]);

    const fetchCatalogos = async () => {
        try {
            const res = await fetch('/api/externo/catalogos');
            const data = await res.json();
            if (!data.error) {
                setCentrosCostosList(data.centrosCostos || []);
                setCuentasList(data.cuentas || []);
            }
        } catch (err) {
            console.error('Error fetching catalogos:', err);
        }
    };

    const fetchInvoice = async () => {
        try {
            const res = await fetch(`/api/externo/factura/${itemId}`);
            const data = await res.json();

            if (data.error) throw new Error(data.error);
            setInvoice(data);
            
            // Default first distribution to the total value of the invoice
            if (data.valorTotal) {
                setDistribuciones([{ centroCostos: "", cuenta: "", valor: data.valorTotal }]);
            }
        } catch (err: any) {
            setError(err.message || "No se pudo cargar la información de la factura");
        }
    };

    const checkSapBp = async (nit: string) => {
        try {
            setSapBpLoading(true);
            const res = await fetch('/api/externo/sap-check-bp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nit })
            });
            const data = await res.json();
            setSapBpFound(data.found);
        } catch (err) {
            console.error('Error checking SAP BP:', err);
            setSapBpFound(null);
        } finally {
            setSapBpLoading(false);
        }
    };


    const handleAction = async (action: 'Aprobado' | 'Rechazado') => {
        try {
            // Validate distributions sum equals invoice total if approved
            if (action === 'Aprobado' && invoice?.valorTotal) {
                const invoiceTotal = parseFloat(invoice.valorTotal);
                const distributionsTotal = distribuciones.reduce((sum, dist) => sum + (parseFloat(dist.valor) || 0), 0);
                
                if (Math.abs(invoiceTotal - distributionsTotal) > 0.01) {
                    alert(`El total distribuido (${distributionsTotal}) no coincide con el valor total de la factura (${invoiceTotal}).`);
                    return;
                }

                // Check for empty fields
                const hasEmpty = distribuciones.some(d => !d.centroCostos || !d.cuenta || !d.valor);
                if (hasEmpty) {
                    alert("Por favor, completa todos los campos de Centro de Costos, Cuenta y Valor para cada línea antes de aprobar.");
                    return;
                }
            }

            setActionLoading(action);
            const res = await fetch('/api/externo/accion', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    itemId,
                    action,
                    observaciones,
                    distribuciones, // Send the array instead of individual strings
                    anticipo,
                    valor: invoice?.valorTotal
                })
            });
            const data = await res.json();

            if (data.error) throw new Error(data.error);

            if (res.ok) {
                const actionText = action === 'Aprobado' ? 'aprobada' : 'rechazada';
                // SharePoint Success, now try SAP Draft (login + draft + logout handled in backend)
                try {
                    const sapRes = await fetch('/api/externo/sap-draft', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            nit: invoice?.nit,
                            total: invoice?.valorTotal,
                            distribuciones,
                            anticipo,
                            observations: observaciones,
                            isApproval: action === 'Aprobado'
                        })
                    });

                    const sapData = await sapRes.json();
                    if (sapRes.ok) {
                        setSuccessMessage(`Factura ${actionText} exitosamente y borrador creado en SAP (Borrador: ${sapData.draftId})`);
                    } else {
                        console.error('SAP Draft Error:', sapData.error);
                        setSuccessMessage(`Factura ${actionText} en SharePoint, pero error en SAP: ${sapData.error}`);
                    }
                } catch (sapErr) {
                    console.error('SAP Fetch Error:', sapErr);
                    setSuccessMessage(`Factura ${actionText} en SharePoint, pero falló la conexión con SAP.`);
                }
            } else {
                alert(data.error || `Hubo un error al procesar la factura`);
            }
            // Refresh data to show new status
            fetchInvoice();

        } catch (err: any) {
            alert(err.message || "Error al procesar la acción");
        } finally {
            setActionLoading(null);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-6">
                <div className="text-center">
                    <Loader2 className="h-10 w-10 text-[#254153] animate-spin mx-auto mb-4" />
                    <p className="text-gray-500 font-medium">Cargando detalles de la factura...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-6">
                <div className="max-w-md w-full bg-white p-8 rounded-3xl shadow-xl border border-red-100 text-center">
                    <div className="bg-red-50 h-16 w-16 rounded-full flex items-center justify-center mx-auto mb-6">
                        <AlertCircle className="h-8 w-8 text-red-500" />
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900 mb-2">Error de Acceso</h1>
                    <p className="text-gray-500 mb-8">{error}</p>
                    <Button variant="outline" className="w-full" onClick={() => window.location.reload()}>
                        Reintentar
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-4 md:p-8">
            <AnimatePresence mode="wait">
                {successMessage ? (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        className="max-w-md w-full bg-white p-10 rounded-[32px] shadow-2xl border border-green-100 text-center"
                    >
                        <div className="bg-green-50 h-20 w-20 rounded-full flex items-center justify-center mx-auto mb-8">
                            <CheckCircle2 className="h-10 w-10 text-green-500" />
                        </div>
                        <h2 className="text-3xl font-bold text-gray-900 mb-4">¡Listo!</h2>
                        <p className="text-gray-600 mb-10 text-lg">{successMessage}</p>
                        <div className="text-sm text-gray-400">
                            Ya puedes cerrar esta pestaña
                        </div>
                    </motion.div>
                ) : (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="max-w-2xl w-full"
                    >
                        {/* Header */}
                        <div className="flex items-center gap-3 mb-8 px-2">
                            <div className="bg-[#254153] p-2.5 rounded-2xl">
                                <FileText className="h-6 w-6 text-white" />
                            </div>
                            <div>
                                <h1 className="text-2xl font-bold text-[#254153]">Revisión de Factura</h1>
                                <p className="text-gray-500 text-sm">Portal externo de aprobación</p>
                            </div>
                            {invoice?.documentInfo ? (
                                <a
                                    href={`/api/externo/factura/${itemId}/download?file=${encodeURIComponent(invoice.documentInfo.fileName)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="ml-auto flex items-center gap-2 px-4 py-2 bg-[#254153]/5 border-2 border-[#254153]/10 rounded-xl text-[#254153] text-sm font-bold hover:bg-[#254153] hover:text-white transition-all shadow-sm group"
                                >
                                    <FileText className="h-4 w-4" />
                                    Ver Factura {invoice?.nroFactura && `#${invoice.nroFactura}`}
                                </a>
                            ) : (
                                <Button
                                    variant="outline"
                                    className="ml-auto flex items-center gap-2 px-4 py-2 border-2 border-[#254153]/10 rounded-xl text-[#254153] text-sm font-bold opacity-50 cursor-not-allowed"
                                >
                                    <FileText className="h-4 w-4" />
                                    Ver Factura {invoice?.nroFactura && `#${invoice.nroFactura}`}
                                </Button>
                            )}
                        </div>

                        {/* Main Card */}
                        <div className="bg-white rounded-[32px] shadow-xl border border-gray-100 overflow-hidden">
                            {/* Status Banner */}
                            <div className={`px-8 py-4 ${invoice?.aprobacionDoliente === 'Aprobado' ? 'bg-green-50 text-green-700' :
                                invoice?.aprobacionDoliente === 'Rechazado' ? 'bg-red-50 text-red-700' :
                                    'bg-[#254153]/5 text-[#254153]'
                                } text-sm font-bold flex items-center justify-between`}>
                                <div className="flex items-center gap-2">
                                    <div className={`h-2 w-2 rounded-full ${invoice?.aprobacionDoliente === 'Aprobado' ? 'bg-green-500' :
                                        invoice?.aprobacionDoliente === 'Rechazado' ? 'bg-red-500' :
                                            'bg-[#254153] animate-pulse'
                                        }`} />
                                    {invoice?.aprobacionDoliente === 'Aprobado' ? 'APROBADA ANTERIORMENTE' :
                                        invoice?.aprobacionDoliente === 'Rechazado' ? 'RECHAZADA ANTERIORMENTE' :
                                            'PENDIENTE DE TU ACCIÓN'}
                                </div>
                                <span className="opacity-60">#{invoice?.id}</span>
                            </div>

                            <div className="p-8 md:p-10">
                                {/* Info Grid */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8 mb-12">
                                    <div className="space-y-1.5">
                                        <div className="flex items-center gap-2 text-gray-400 mb-1">
                                            <Building2 className="h-4 w-4" />
                                            <span className="text-xs font-bold uppercase tracking-wider">Proveedor</span>
                                        </div>
                                        <p className="text-xl font-bold text-gray-900">{invoice?.proveedor}</p>
                                        <p className="text-sm text-gray-500">NIT: {invoice?.nit}</p>
                                    </div>

                                    <div className="space-y-1.5">
                                        <div className="flex items-center gap-2 text-gray-400 mb-1">
                                            <DollarSign className="h-4 w-4" />
                                            <span className="text-xs font-bold uppercase tracking-wider">Valor Total</span>
                                        </div>
                                        <p className="text-3xl font-black text-[#254153]">
                                            {invoice?.valorTotal && new Intl.NumberFormat('es-CO', {
                                                style: 'currency',
                                                currency: 'COP',
                                                maximumFractionDigits: 0
                                            }).format(parseFloat(invoice.valorTotal))}
                                        </p>
                                    </div>

                                    <div className="space-y-1.5">
                                        <div className="flex items-center gap-2 text-gray-400 mb-1">
                                            <Hash className="h-4 w-4" />
                                            <span className="text-xs font-bold uppercase tracking-wider">Número de Factura</span>
                                        </div>
                                        <p className="text-lg font-bold text-gray-800">{invoice?.nroFactura}</p>
                                    </div>

                                    <div className="space-y-1.5">
                                        <div className="flex items-center gap-2 text-gray-400 mb-1">
                                            <Calendar className="h-4 w-4" />
                                            <span className="text-xs font-bold uppercase tracking-wider">Fecha de Registro</span>
                                        </div>
                                        <p className="text-lg font-bold text-gray-800">
                                            {invoice?.fechaRegistro ? new Date(invoice.fechaRegistro).toLocaleDateString('es-CO', {
                                                day: 'numeric',
                                                month: 'long',
                                                year: 'numeric'
                                            }) : 'N/A'}
                                        </p>
                                    </div>
                                </div>

                                {/* Documento Adjunto */}
                                {invoice?.documentInfo && (
                                    <div className="bg-[#254153]/5 p-6 rounded-[24px] border border-[#254153]/10 mb-10 space-y-4">
                                        <div className="flex items-center justify-between">
                                            <h4 className="text-[11px] font-black text-gray-400 uppercase tracking-[2px]">Documento Adjunto</h4>
                                            {invoice.documentInfo.isNative ? (
                                                <span className="px-2 py-0.5 rounded bg-amber-100 text-[10px] font-bold text-amber-600 uppercase">
                                                    REQUIERE LOGIN SHAREPOINT
                                                </span>
                                            ) : (
                                                <span className="px-2 py-0.5 rounded bg-blue-100 text-[10px] font-bold text-blue-600 uppercase">
                                                    {invoice.documentInfo.fileName?.split('.').pop()}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <div className="h-12 w-12 bg-white rounded-xl flex items-center justify-center shadow-sm border border-gray-100">
                                                <FileText className="h-6 w-6 text-blue-500" />
                                            </div>
                                            <div className="flex-1 overflow-hidden">
                                                <p className="text-sm font-bold text-[#254153] truncate">{invoice.documentInfo.isNative ? "Vista previa en SharePoint" : (invoice.documentInfo.fileName || "Factura Adjunta")}</p>
                                                <p className="text-[10px] text-gray-400 font-medium italic">
                                                    {invoice.documentInfo.isNative ? "Usa el botón superior para ver el documento" : "Documento oficial cargado en el sistema"}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Divider */}
                                <div className="h-px bg-gray-100 w-full mb-10" />

                                {/* Actions */}
                                {(!invoice?.aprobacionDoliente || invoice.aprobacionDoliente === 'Pendiente' || invoice.aprobacionDoliente === 'Por Aprobar') && (
                                    <div className="space-y-8">
                                        {/* Form Inputs */}

                                        <div className="space-y-6">
                                            <div className="space-y-3">
                                                <label className="text-sm font-bold text-[#254153]">¿Tiene anticipo o no la factura?</label>
                                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                                    {[
                                                        { id: 'con-anticipo', label: 'Con anticipo', value: 'con anticipo' },
                                                        { id: 'sin-anticipo', label: 'Sin anticipo', value: 'sin anticipo' },
                                                        { id: 'con-tarjeta', label: 'Compra con tarjeta', value: 'compra con tarjeta' }
                                                    ].map((opt) => (
                                                        <label
                                                            key={opt.id}
                                                            className={`flex items-center justify-center p-4 rounded-xl border-2 cursor-pointer transition-all ${
                                                                anticipo === opt.value
                                                                    ? 'border-[#254153] bg-[#254153]/5 text-[#254153]'
                                                                    : 'border-gray-100 bg-white text-gray-500 hover:border-gray-200'
                                                            }`}
                                                        >
                                                            <input
                                                                type="radio"
                                                                name="anticipo"
                                                                value={opt.value}
                                                                checked={anticipo === opt.value}
                                                                onChange={(e) => setAnticipo(e.target.value)}
                                                                className="sr-only"
                                                            />
                                                            <span className="text-sm font-bold">{opt.label}</span>
                                                        </label>
                                                    ))}
                                                </div>
                                            </div>

                                            <div className="space-y-2">

                                                <label className="text-sm font-bold text-[#254153]">Observaciones</label>
                                                <textarea
                                                    value={observaciones}
                                                    onChange={(e) => setObservaciones(e.target.value)}
                                                    className="w-full rounded-2xl border border-gray-200 p-4 focus:ring-4 focus:ring-[#254153]/10 focus:border-[#254153] outline-none transition-all resize-none h-24 text-sm text-gray-700 placeholder-gray-400"
                                                    placeholder="Añade observaciones (opcional)..."
                                                    disabled={!!actionLoading}
                                                />
                                            </div>
                                            <div className="space-y-4">
                                                <div className="flex items-center justify-between">
                                                    <label className="text-sm font-bold text-[#254153]">Distribución Contable</label>
                                                    <Button 
                                                        variant="outline" 
                                                        onClick={() => setDistribuciones([...distribuciones, { centroCostos: '', cuenta: '', valor: '' }])}
                                                        className="h-8 py-0 px-3 text-xs font-bold border-gray-200 text-[#254153]"
                                                        disabled={!!actionLoading}
                                                    >
                                                        <Plus className="h-4 w-4 mr-1" /> Agregar Fila
                                                    </Button>
                                                </div>

                                                <div className="space-y-3">
                                                    {distribuciones.map((distribucion, index) => (
                                                        <div key={index} className="flex flex-col md:flex-row gap-3 p-4 bg-gray-50 rounded-2xl border border-gray-100 relative">
                                                            {distribuciones.length > 1 && (
                                                                <button 
                                                                    onClick={() => setDistribuciones(distribuciones.filter((_, i) => i !== index))}
                                                                    className="absolute -top-3 -right-3 h-8 w-8 bg-white border border-red-100 text-red-500 rounded-full flex items-center justify-center hover:bg-red-50 hover:text-red-600 transition-colors shadow-sm"
                                                                    disabled={!!actionLoading}
                                                                >
                                                                    <Trash2 className="h-4 w-4" />
                                                                </button>
                                                            )}
                                                            
                                                            <div className="flex-1 space-y-1.5">
                                                                <label className="text-[10px] font-black uppercase text-gray-500 tracking-wider">Centro Costos</label>
                                                                <select
                                                                    value={distribucion.centroCostos}
                                                                    onChange={(e) => {
                                                                        const newDist = [...distribuciones];
                                                                        newDist[index].centroCostos = e.target.value;
                                                                        newDist[index].cuenta = ""; // Reset cuenta on CC change
                                                                        setDistribuciones(newDist);
                                                                    }}
                                                                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 font-medium outline-none focus:border-[#254153] focus:ring-2 focus:ring-[#254153]/10 h-10 bg-white"
                                                                    disabled={!!actionLoading}
                                                                >
                                                                    <option value="">Selecciona CC...</option>
                                                                    {centrosCostosList.map((c: any) => (
                                                                        <option key={c.id} value={`${c.codigo ? c.codigo + ' - ' : ''}${c.Título}`}>
                                                                            {c.codigo ? `${c.codigo} - ` : ''}{c.Título}
                                                                        </option>
                                                                    ))}
                                                                </select>
                                                            </div>

                                                            <div className="flex-1 space-y-1.5">
                                                                <label className="text-[10px] font-black uppercase text-gray-500 tracking-wider">Cuenta</label>
                                                                <select
                                                                    value={distribucion.cuenta}
                                                                    onChange={(e) => {
                                                                        const newDist = [...distribuciones];
                                                                        newDist[index].cuenta = e.target.value;
                                                                        setDistribuciones(newDist);
                                                                    }}
                                                                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 font-medium outline-none focus:border-[#254153] focus:ring-2 focus:ring-[#254153]/10 h-10 bg-white disabled:bg-gray-100 disabled:text-gray-500"
                                                                    disabled={!!actionLoading || !distribucion.centroCostos}
                                                                >
                                                                    <option value="">Selecciona Cuenta...</option>
                                                                    {(() => {
                                                                        const selectedCC = centrosCostosList.find(c => `${c.codigo ? c.codigo + ' - ' : ''}${c.Título}` === distribucion.centroCostos);
                                                                        const prefix = selectedCC?.cuentas_asociadas?.toString();
                                                                        const filtered = prefix 
                                                                            ? cuentasList.filter(c => c.Título?.startsWith(prefix))
                                                                            : cuentasList;
                                                                        
                                                                        return filtered.map((c: any) => (
                                                                            <option key={c.id} value={`${c.Título}`}>
                                                                                {c.Título}
                                                                            </option>
                                                                        ));
                                                                    })()}
                                                                </select>
                                                            </div>

                                                            <div className="w-full md:w-32 space-y-1.5">
                                                                <label className="text-[10px] font-black uppercase text-gray-500 tracking-wider">Valor a Pagar</label>
                                                                <div className="relative">
                                                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                                                        <DollarSign className="h-4 w-4 text-gray-400" />
                                                                    </div>
                                                                    <input
                                                                        type="number"
                                                                        value={distribucion.valor}
                                                                        onChange={(e) => {
                                                                            const newDist = [...distribuciones];
                                                                            newDist[index].valor = e.target.value;
                                                                            setDistribuciones(newDist);
                                                                        }}
                                                                        className="w-full rounded-xl border border-gray-200 pl-8 pr-3 py-2 text-sm text-gray-900 font-bold outline-none focus:border-[#254153] focus:ring-2 focus:ring-[#254153]/10 h-10 bg-white"
                                                                        disabled={!!actionLoading}
                                                                    />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>

                                                <div className="flex justify-between items-center text-sm px-2 pt-2 border-t border-gray-100">
                                                    <span className="font-medium text-gray-500">Total distribuido:</span>
                                                    <span className={`font-black ${
                                                        invoice?.valorTotal && Math.abs(parseFloat(invoice.valorTotal) - distribuciones.reduce((s,d) => s + (parseFloat(d.valor)||0), 0)) < 0.01 
                                                        ? 'text-green-600' : 'text-red-500'
                                                    }`}>
                                                        {new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
                                                            .format(distribuciones.reduce((s,d) => s + (parseFloat(d.valor)||0), 0))}
                                                        {' / '}
                                                        {invoice?.valorTotal && new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(parseFloat(invoice.valorTotal))}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <Button
                                                className="h-16 rounded-2xl bg-[#254153] hover:bg-[#1a2e3b] text-lg font-bold shadow-lg shadow-[#254153]/20 order-2 md:order-1"
                                                disabled={!!actionLoading}
                                                onClick={() => handleAction('Aprobado')}
                                            >
                                                {actionLoading === 'Aprobado' ? (
                                                    <Loader2 className="h-6 w-6 animate-spin mr-2" />
                                                ) : (
                                                    <CheckCircle2 className="h-6 w-6 mr-2" />
                                                )}
                                                Aprobar Factura
                                            </Button>
                                            <Button
                                                variant="outline"
                                                className="h-16 rounded-2xl border-2 border-red-100 text-red-600 hover:bg-red-50 hover:text-red-700 text-lg font-bold order-1 md:order-2"
                                                disabled={!!actionLoading}
                                                onClick={() => {
                                                    if (confirm("¿Estás seguro que deseas rechazar esta factura?")) {
                                                        handleAction('Rechazado');
                                                    }
                                                }}
                                            >

                                                {actionLoading === 'Rechazado' ? (
                                                    <Loader2 className="h-6 w-6 animate-spin mr-2" />
                                                ) : (
                                                    <XCircle className="h-6 w-6 mr-2" />
                                                )}
                                                Rechazar
                                            </Button>
                                        </div>
                                    </div>
                                )}

                                {(invoice?.aprobacionDoliente === 'Aprobado' || invoice?.aprobacionDoliente === 'Rechazado') && (
                                    <div className="text-center p-6 bg-gray-50 rounded-2xl border border-gray-100">
                                        <p className="text-gray-500 font-medium italic">
                                            Esta factura ya fue procesada el día de hoy y no admite más cambios desde este enlace.
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Footer Info */}
                        <div className="mt-8 text-center">
                            <p className="text-gray-400 text-xs">
                                Este enlace es de uso exclusivo para el responsable de autorizar la factura.<br />
                                © 2026 Firplak SA - Sistema de Gestión de Facturación
                            </p>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
