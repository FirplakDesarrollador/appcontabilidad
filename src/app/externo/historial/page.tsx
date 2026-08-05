"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import {
    FileText,
    User,
    Calendar,
    DollarSign,
    Loader2,
    CheckCircle2,
    XCircle,
    History,
    ChevronLeft,
    ChevronRight,
    Search,
    Building2,
    FileCheck,
    Layers,
    Filter
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import Link from "next/link";

interface ProcessedInvoice {
    id: string;
    proveedor: string;
    nit: string;
    valorTotal: string;
    nroFactura: string;
    consecutivo?: string;
    fechaRegistro: string;
    fechaAprobacion: string;
    aprobacionDoliente: string;
    responsableActual: string;
    tipo?: string;
    modulo?: string;
    moneda?: string;
    url?: string;
}

function HistorialList() {
    const searchParams = useSearchParams();
    const responsable = searchParams.get("responsable");
    
    const [invoices, setInvoices] = useState<ProcessedInvoice[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedModule, setSelectedModule] = useState<string>("TODOS");

    useEffect(() => {
        if (!responsable) {
            setError("No se especificó un responsable.");
            setLoading(false);
            return;
        }

        const fetchHistorial = async () => {
            try {
                setLoading(true);
                const res = await fetch(`/api/externo/historial?responsable=${encodeURIComponent(responsable)}`);
                const data = await res.json();
                
                if (data.error) throw new Error(data.error);
                setInvoices(data.items || []);
            } catch (err: any) {
                console.error("Error fetching historial:", err);
                setError("No se pudo cargar el historial de aprobaciones.");
            } finally {
                setLoading(false);
            }
        };

        fetchHistorial();
    }, [responsable]);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center p-20 text-center">
                <Loader2 className="h-10 w-10 text-[#254153] animate-spin mb-4" />
                <p className="text-gray-500 font-medium tracking-tight">Cargando tu historial de aprobaciones...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center p-12 bg-rose-50 rounded-[32px] border border-rose-100 text-center">
                <div className="bg-white p-4 rounded-full shadow-sm mb-4">
                    <User className="h-8 w-8 text-rose-500" />
                </div>
                <h3 className="text-xl font-bold text-rose-900 mb-2">Ups, algo salió mal</h3>
                <p className="text-rose-600 mb-6">{error}</p>
                <Button onClick={() => window.location.reload()} variant="outline" className="border-rose-200 text-rose-700 hover:bg-rose-100">
                    Reintentar
                </Button>
            </div>
        );
    }

    if (invoices.length === 0) {
        return (
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center justify-center p-16 bg-white rounded-[40px] shadow-xl border border-gray-50 text-center"
            >
                <div className="bg-gray-50 h-24 w-24 rounded-full flex items-center justify-center mb-8">
                    <History className="h-12 w-12 text-gray-400" />
                </div>
                <h2 className="text-3xl font-black text-[#254153] mb-4">Sin historial</h2>
                <p className="text-gray-500 max-w-sm text-lg font-medium">
                    Aún no has aprobado ni rechazado ningún documento (Facturas Firplak, Documentos Soporte o Facturas Viventta).
                </p>
            </motion.div>
        );
    }

    const formatCurrency = (val: string) => {
        const numeric = parseFloat(val);
        if (isNaN(numeric)) return val;
        return new Intl.NumberFormat('es-CO', { 
            style: 'currency', 
            currency: 'COP', 
            maximumFractionDigits: 0 
        }).format(numeric);
    };

    const getModuleBadge = (tipo?: string) => {
        switch (tipo) {
            case "DOCUMENTO SOPORTE":
                return {
                    label: "Doc. Soporte",
                    icon: FileCheck,
                    colorClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
                };
            case "FACTURA VIVENTTA":
                return {
                    label: "Factura Viventta",
                    icon: Building2,
                    colorClass: "bg-amber-50 text-amber-700 border-amber-200",
                };
            default:
                return {
                    label: "Factura Firplak",
                    icon: FileText,
                    colorClass: "bg-blue-50 text-blue-700 border-blue-200",
                };
        }
    };

    const getItemUrl = (inv: ProcessedInvoice) => {
        const respParam = responsable ? `&responsable=${encodeURIComponent(responsable)}` : '';
        switch (inv.tipo) {
            case "DOCUMENTO SOPORTE":
                return `/externo/documento/${inv.id}?readonly=true${respParam}`;
            case "FACTURA VIVENTTA":
                return `/externo/factura-viventta/${inv.id}?readonly=true${respParam}`;
            default:
                return `/externo/factura/${inv.id}?readonly=true${respParam}`;
        }
    };

    const filteredInvoices = invoices.filter(inv => {
        const matchModule = selectedModule === "TODOS" || (inv.tipo || "FACTURA") === selectedModule;
        if (!matchModule) return false;

        if (!searchTerm) return true;
        const term = searchTerm.toLowerCase();
        return (
            inv.nroFactura?.toLowerCase().includes(term) ||
            inv.proveedor?.toLowerCase().includes(term) ||
            inv.nit?.toLowerCase().includes(term) ||
            inv.consecutivo?.toLowerCase().includes(term)
        );
    });

    const modulesList = [
        { id: "TODOS", label: "Todos", count: invoices.length, icon: Layers },
        { id: "FACTURA", label: "Facturas Firplak", count: invoices.filter(i => (i.tipo || "FACTURA") === "FACTURA").length, icon: FileText },
        { id: "DOCUMENTO SOPORTE", label: "Docs Soporte", count: invoices.filter(i => i.tipo === "DOCUMENTO SOPORTE").length, icon: FileCheck },
        { id: "FACTURA VIVENTTA", label: "Facturas Viventta", count: invoices.filter(i => i.tipo === "FACTURA VIVENTTA").length, icon: Building2 },
    ];

    return (
        <div className="space-y-6">
            {/* Filter Tabs & Search Bar */}
            <div className="space-y-4">
                <div className="flex flex-wrap gap-2 items-center">
                    {modulesList.map((mod) => {
                        const Icon = mod.icon;
                        const isSelected = selectedModule === mod.id;
                        return (
                            <button
                                key={mod.id}
                                onClick={() => setSelectedModule(mod.id)}
                                className={`flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-bold transition-all ${
                                    isSelected
                                        ? "bg-[#254153] text-white shadow-md shadow-[#254153]/20"
                                        : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50 hover:text-gray-900"
                                }`}
                            >
                                <Icon className="h-3.5 w-3.5" />
                                <span>{mod.label}</span>
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                                    isSelected ? "bg-white/20 text-white" : "bg-gray-100 text-gray-700"
                                }`}>
                                    {mod.count}
                                </span>
                            </button>
                        );
                    })}
                </div>

                <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Buscar por proveedor, Nro. Factura, NIT o consecutivo..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-11 pr-4 py-3 bg-white border border-gray-200 rounded-2xl text-sm font-medium text-gray-800 placeholder-gray-400 outline-none focus:border-[#254153] focus:ring-2 focus:ring-[#254153]/10 transition-all shadow-sm"
                    />
                    {searchTerm && (
                        <button
                            onClick={() => setSearchTerm("")}
                            className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400 hover:text-gray-600"
                        >
                            Limpiar
                        </button>
                    )}
                </div>
            </div>

            <div className="flex items-center justify-between px-2 pt-2">
                <h2 className="text-sm font-black uppercase tracking-wider text-gray-400 flex items-center gap-2">
                    <History className="h-4 w-4 text-[#254153]" />
                    Mostrando {filteredInvoices.length} de {invoices.length} documentos procesados
                </h2>
            </div>
            
            <div className="grid grid-cols-1 gap-4">
                {filteredInvoices.length === 0 ? (
                    <div className="p-12 text-center bg-white rounded-3xl border border-gray-100">
                        <Filter className="h-8 w-8 text-gray-300 mx-auto mb-3" />
                        <p className="text-gray-500 font-medium">No se encontraron documentos que coincidan con los filtros.</p>
                    </div>
                ) : (
                    filteredInvoices.map((inv, idx) => {
                        const isAprobado = inv.aprobacionDoliente?.toLowerCase().includes("aprobado");
                        const isRechazado = inv.aprobacionDoliente?.toLowerCase().includes("rechazado");
                        const badge = getModuleBadge(inv.tipo);
                        const BadgeIcon = badge.icon;

                        return (
                            <motion.div
                                key={`${inv.tipo}-${inv.id}`}
                                initial={{ opacity: 0, y: 15 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: Math.min(idx * 0.04, 0.4) }}
                                className="bg-white p-6 rounded-[28px] shadow-sm border border-gray-100 hover:shadow-md transition-all flex flex-col md:flex-row md:items-center gap-6"
                            >
                                <div className={`h-16 w-16 rounded-2xl flex items-center justify-center flex-shrink-0 transition-all duration-300 ${
                                    isAprobado ? 'bg-green-50' : isRechazado ? 'bg-red-50' : 'bg-gray-50'
                                }`}>
                                    {isAprobado ? (
                                        <CheckCircle2 className="h-8 w-8 text-green-500" />
                                    ) : isRechazado ? (
                                        <XCircle className="h-8 w-8 text-red-500" />
                                    ) : (
                                        <BadgeIcon className="h-8 w-8 text-gray-400" />
                                    )}
                                </div>
                                
                                <div className="flex-1 min-w-0">
                                    <div className="flex flex-wrap items-center gap-2.5 mb-1.5">
                                        <h3 className="text-lg font-bold text-gray-900 truncate">{inv.proveedor}</h3>
                                        <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase border tracking-wider flex items-center gap-1.5 ${badge.colorClass}`}>
                                            <BadgeIcon className="h-3 w-3" />
                                            {badge.label}: {inv.nroFactura}
                                        </span>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-gray-500 font-medium">
                                        <div className="flex items-center gap-1.5">
                                            <DollarSign className="h-4 w-4 text-emerald-500" />
                                            <span className="font-bold text-[#254153]">
                                                {formatCurrency(inv.valorTotal)}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <Calendar className="h-4 w-4 text-purple-400" />
                                            <span>Creada: {inv.fechaRegistro ? new Date(inv.fechaRegistro).toLocaleDateString() : 'N/A'}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <Calendar className="h-4 w-4 text-blue-400" />
                                            <span>Procesada: {inv.fechaAprobacion ? new Date(inv.fechaAprobacion).toLocaleDateString() : 'N/A'}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex flex-col items-end justify-center gap-3 min-w-[140px] flex-shrink-0">
                                    <span className={`px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest text-center w-full ${
                                        isAprobado ? 'bg-green-100 text-green-700' : 
                                        isRechazado ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'
                                    }`}>
                                        {inv.aprobacionDoliente}
                                    </span>
                                    
                                    <a 
                                        href={getItemUrl(inv)}
                                        className="inline-flex items-center justify-center gap-2 bg-white hover:bg-gray-50 text-[#254153] px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-widest transition-all active:scale-95 group/btn border border-gray-200 w-full shadow-sm"
                                    >
                                        Ver Detalle
                                        <ChevronRight className="h-4 w-4 transform group-hover/btn:translate-x-1 transition-all text-gray-400" />
                                    </a>
                                </div>
                            </motion.div>
                        );
                    })
                )}
            </div>
        </div>
    );
}

export default function HistorialPage() {
    return (
        <div className="min-h-screen bg-[#f8fafc] p-6 lg:p-12">
            <div className="max-w-[1100px] mx-auto space-y-10">
                <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                    <div className="space-y-2">
                        <div className="inline-flex items-center gap-2 px-3.5 py-1 bg-gray-100 text-gray-600 rounded-full text-[11px] font-black uppercase tracking-widest mb-1 border border-gray-200">
                            Historial Unificado de Aprobaciones
                        </div>
                        <h1 className="text-3xl md:text-4xl font-black text-[#254153] tracking-tight">
                            Documentos Procesados
                        </h1>
                        <p className="text-gray-500 font-medium text-sm md:text-base">
                            Consulta el registro de facturas y documentos que has aprobado o rechazado.
                        </p>
                    </div>
                    
                    <div className="flex-shrink-0">
                        <Suspense fallback={null}>
                            <BackButton />
                        </Suspense>
                    </div>
                </header>

                <Suspense fallback={
                    <div className="flex items-center justify-center p-20">
                        <Loader2 className="h-8 w-8 animate-spin text-[#254153]" />
                    </div>
                }>
                    <HistorialList />
                </Suspense>

                <footer className="pt-12 border-t border-gray-100 text-center">
                    <p className="text-gray-400 text-[10px] font-bold uppercase tracking-[2px] mb-2 leading-loose">
                        Portal Corporativo Firplak SA - Gestión Electrónica de Proveedores
                    </p>
                    <div className="h-1 w-12 bg-gray-200 mx-auto rounded-full" />
                </footer>
            </div>
        </div>
    );
}

function BackButton() {
    const searchParams = useSearchParams();
    const responsable = searchParams.get("responsable");
    return (
        <Link 
            href={`/externo/pendientes${responsable ? `?responsable=${encodeURIComponent(responsable)}` : ''}`}
        >
            <Button variant="outline" className="gap-2 text-[#254153] hover:bg-gray-100 border-gray-200 font-bold text-xs">
                <ChevronLeft className="h-4 w-4" /> Volver a Pendientes
            </Button>
        </Link>
    );
}
