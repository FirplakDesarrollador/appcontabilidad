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
    Loader2
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

    // Form states
    const [observaciones, setObservaciones] = useState<string>("");
    const [centroCostos, setCentroCostos] = useState<string>("");
    const [cuenta, setCuenta] = useState<string>("");

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
        } catch (err: any) {
            setError(err.message || "No se pudo cargar la información de la factura");
        }
    };

    const handleAction = async (action: 'Aprobado' | 'Rechazado') => {
        try {
            setActionLoading(action);
            const res = await fetch('/api/externo/accion', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    itemId,
                    action,
                    observaciones,
                    centroCostos,
                    cuenta,
                    valor: invoice?.valorTotal
                })
            });
            const data = await res.json();

            if (data.error) throw new Error(data.error);

            setSuccessMessage(`Factura ${action === 'Aprobado' ? 'aprobada' : 'rechazada'} exitosamente`);
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
                                            <span className="px-2 py-0.5 rounded bg-blue-100 text-[10px] font-bold text-blue-600 uppercase">
                                                {invoice.documentInfo.fileName?.split('.').pop()}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <div className="h-12 w-12 bg-white rounded-xl flex items-center justify-center shadow-sm border border-gray-100">
                                                <FileText className="h-6 w-6 text-blue-500" />
                                            </div>
                                            <div className="flex-1 overflow-hidden">
                                                <p className="text-sm font-bold text-[#254153] truncate">{invoice.documentInfo.fileName || "Factura Adjunta"}</p>
                                                <p className="text-[10px] text-gray-400 font-medium italic">Archivo original de SharePoint</p>
                                            </div>
                                            <div className="flex gap-2">
                                                <a
                                                    href={`https://firplaksa.sharepoint.com${invoice.documentInfo.serverRelativeUrl}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="h-10 px-4 flex items-center justify-center rounded-xl bg-white border border-gray-100 text-xs font-bold text-[#254153] hover:bg-gray-50 transition-all shadow-sm"
                                                >
                                                    Ver Archivo
                                                </a>
                                                <a
                                                    href={`https://firplaksa.sharepoint.com${invoice.documentInfo.serverRelativeUrl}?download=1`}
                                                    download
                                                    className="h-10 px-4 flex items-center justify-center rounded-xl bg-blue-600 text-white border border-transparent text-xs font-bold hover:bg-blue-700 transition-all shadow-sm shadow-blue-900/10"
                                                >
                                                    Descargar
                                                </a>
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
                                        <div className="space-y-4">
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
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div className="space-y-2">
                                                    <label className="text-sm font-bold text-[#254153]">Centro de Costos</label>
                                                    <select
                                                        value={centroCostos}
                                                        onChange={(e) => setCentroCostos(e.target.value)}
                                                        className="w-full rounded-xl border border-gray-200 px-4 py-3 focus:ring-4 focus:ring-[#254153]/10 focus:border-[#254153] outline-none transition-all text-sm text-gray-700 h-12 bg-white"
                                                        disabled={!!actionLoading}
                                                    >
                                                        <option value="">Selecciona un centro de costos</option>
                                                        {centrosCostosList.map((c: any) => (
                                                            <option key={c.id} value={`${c.codigo ? c.codigo + ' - ' : ''}${c.Título}`}>
                                                                {c.codigo ? `${c.codigo} - ` : ''}{c.Título}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-sm font-bold text-[#254153]">Cuenta</label>
                                                    <select
                                                        value={cuenta}
                                                        onChange={(e) => setCuenta(e.target.value)}
                                                        className="w-full rounded-xl border border-gray-200 px-4 py-3 focus:ring-4 focus:ring-[#254153]/10 focus:border-[#254153] outline-none transition-all text-sm text-gray-700 h-12 bg-white"
                                                        disabled={!!actionLoading}
                                                    >
                                                        <option value="">Selecciona una cuenta</option>
                                                        {cuentasList.map((c: any) => (
                                                            <option key={c.id} value={`${c.Título}`}>
                                                                {c.Título}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <Button
                                                size="lg"
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
                                                size="lg"
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
