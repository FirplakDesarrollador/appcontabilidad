"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
    FileText,
    User,
    Calendar,
    DollarSign,
    Loader2,
    CheckCircle2,
    ChevronRight,
    Search,
    Inbox,
    History,
    Building2,
    FileCheck,
    Layers,
    Filter
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import Link from "next/link";

interface PendingItem {
    id: string;
    proveedor: string;
    nit: string;
    valorTotal: string;
    nroFactura: string;
    consecutivo?: string;
    fechaRegistro: string;
    aprobacionDoliente: string;
    responsableActual: string;
    tipo: "FACTURA" | "DOCUMENTO SOPORTE" | "FACTURA VIVENTTA" | string;
    modulo?: string;
    moneda?: string;
    url?: string;
}

function PendientesList() {
    const searchParams = useSearchParams();
    const responsable = searchParams.get("responsable");
    
    const [items, setItems] = useState<PendingItem[]>([]);
    const [counts, setCounts] = useState<{ facturas: number; docSoporte: number; viventta: number }>({
        facturas: 0,
        docSoporte: 0,
        viventta: 0
    });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedModule, setSelectedModule] = useState<string>("TODOS");
    const [searchTerm, setSearchTerm] = useState<string>("");

    useEffect(() => {
        if (!responsable) {
            setError("No se especificó un responsable.");
            setLoading(false);
            return;
        }

        const fetchPendientes = async () => {
            try {
                setLoading(true);
                const res = await fetch(`/api/externo/pendientes?responsable=${encodeURIComponent(responsable)}`);
                const data = await res.json();
                
                if (data.error) throw new Error(data.error);
                setItems(data.items || []);
                if (data.countsByModule) {
                    setCounts(data.countsByModule);
                }
            } catch (err: any) {
                console.error("Error fetching pendientes:", err);
                setError("No se pudo cargar la lista de pendientes.");
            } finally {
                setLoading(false);
            }
        };

        fetchPendientes();
    }, [responsable]);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center p-20 text-center">
                <Loader2 className="h-10 w-10 text-[#254153] animate-spin mb-4" />
                <p className="text-gray-500 font-medium tracking-tight">Cargando tus pendientes por aprobar...</p>
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

    if (items.length === 0) {
        return (
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center justify-center p-16 bg-white rounded-[40px] shadow-xl border border-gray-50 text-center"
            >
                <div className="bg-green-50 h-24 w-24 rounded-full flex items-center justify-center mb-8">
                    <CheckCircle2 className="h-12 w-12 text-green-500" />
                </div>
                <h2 className="text-3xl font-black text-[#254153] mb-4">¡Todo al día!</h2>
                <p className="text-gray-500 max-w-md text-base font-medium">
                    No tienes asignaciones pendientes por aprobar en este momento (Facturas Firplak, Documentos Soporte o Facturas Viventta).
                </p>
                <div className="mt-10 h-1.5 w-16 bg-green-500/20 rounded-full" />
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

    const getModuleBadge = (tipo: string) => {
        switch (tipo) {
            case "DOCUMENTO SOPORTE":
                return {
                    label: "Doc. Soporte",
                    icon: FileCheck,
                    colorClass: "bg-emerald-50 text-emerald-700 border-emerald-200 group-hover:bg-emerald-100",
                    iconBg: "bg-emerald-50 group-hover:bg-emerald-600 text-emerald-600 group-hover:text-white"
                };
            case "FACTURA VIVENTTA":
                return {
                    label: "Factura Viventta",
                    icon: Building2,
                    colorClass: "bg-amber-50 text-amber-700 border-amber-200 group-hover:bg-amber-100",
                    iconBg: "bg-amber-50 group-hover:bg-amber-600 text-amber-600 group-hover:text-white"
                };
            default: // FACTURA FIRPLAK
                return {
                    label: "Factura Firplak",
                    icon: FileText,
                    colorClass: "bg-blue-50 text-blue-700 border-blue-200 group-hover:bg-blue-100",
                    iconBg: "bg-blue-50 group-hover:bg-[#254153] text-blue-600 group-hover:text-white"
                };
        }
    };

    const getItemUrl = (item: PendingItem) => {
        const respParam = responsable ? `?responsable=${encodeURIComponent(responsable)}` : '';
        switch (item.tipo) {
            case "DOCUMENTO SOPORTE":
                return `/externo/documento/${item.id}${respParam}`;
            case "FACTURA VIVENTTA":
                return `/externo/factura-viventta/${item.id}${respParam}`;
            default:
                return `/externo/factura/${item.id}${respParam}`;
        }
    };

    // Filter items
    const filteredItems = items.filter(item => {
        const matchModule = selectedModule === "TODOS" || item.tipo === selectedModule;
        if (!matchModule) return false;

        if (!searchTerm.trim()) return true;
        const q = searchTerm.toLowerCase();
        return (
            (item.proveedor || "").toLowerCase().includes(q) ||
            (item.nroFactura || "").toLowerCase().includes(q) ||
            (item.nit || "").toLowerCase().includes(q) ||
            (item.consecutivo || "").toLowerCase().includes(q)
        );
    });

    const modulesList = [
        { id: "TODOS", label: "Todos", count: items.length, icon: Layers },
        { id: "FACTURA", label: "Facturas Firplak", count: counts.facturas, icon: FileText },
        { id: "DOCUMENTO SOPORTE", label: "Docs Soporte", count: counts.docSoporte, icon: FileCheck },
        { id: "FACTURA VIVENTTA", label: "Facturas Viventta", count: counts.viventta, icon: Building2 },
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
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Buscar por proveedor, Nro. Factura, NIT o consecutivo..."
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

            {/* Counter Header */}
            <div className="flex items-center justify-between px-2 pt-2">
                <h2 className="text-sm font-black uppercase tracking-wider text-gray-400 flex items-center gap-2">
                    <Inbox className="h-4 w-4 text-[#254153]" />
                    Mostrando {filteredItems.length} de {items.length} pendientes
                </h2>
            </div>
            
            {/* List */}
            {filteredItems.length === 0 ? (
                <div className="p-12 text-center bg-white rounded-3xl border border-gray-100">
                    <Filter className="h-8 w-8 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 font-medium">No se encontraron pendientes con los filtros aplicados.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-4">
                    {filteredItems.map((inv, idx) => {
                        const badge = getModuleBadge(inv.tipo);
                        const BadgeIcon = badge.icon;

                        return (
                            <motion.div
                                key={`${inv.tipo}-${inv.id}`}
                                initial={{ opacity: 0, y: 15 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: Math.min(idx * 0.04, 0.4) }}
                                className="bg-white p-6 rounded-[28px] shadow-sm hover:shadow-xl border border-gray-100 hover:border-gray-200 transition-all group flex flex-col md:flex-row md:items-center gap-6"
                            >
                                <div className={`h-16 w-16 rounded-2xl flex items-center justify-center flex-shrink-0 transition-all duration-300 ${badge.iconBg}`}>
                                    <BadgeIcon className="h-8 w-8 transition-all" />
                                </div>
                                
                                <div className="flex-1 min-w-0">
                                    <div className="flex flex-wrap items-center gap-2.5 mb-1.5">
                                        <h3 className="text-lg font-bold text-gray-900 truncate">{inv.proveedor}</h3>
                                        <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase border tracking-wider flex items-center gap-1.5 transition-all ${badge.colorClass}`}>
                                            <BadgeIcon className="h-3 w-3" />
                                            {badge.label}: {inv.nroFactura}
                                        </span>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-gray-500 font-medium">
                                        <div className="flex items-center gap-1.5">
                                            <DollarSign className="h-4 w-4 text-emerald-500" />
                                            <span className="font-black text-[#254153]">
                                                {formatCurrency(inv.valorTotal)}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <Calendar className="h-4 w-4 text-blue-400" />
                                            <span>{inv.fechaRegistro ? new Date(inv.fechaRegistro).toLocaleDateString() : 'N/A'}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <User className="h-4 w-4 text-amber-400" />
                                            <span className="text-xs uppercase tracking-tight font-bold">{inv.responsableActual}</span>
                                        </div>
                                    </div>
                                </div>

                                <a 
                                    href={getItemUrl(inv)}
                                    className="inline-flex items-center justify-center gap-2 bg-[#254153]/5 hover:bg-[#254153] text-[#254153] hover:text-white px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all active:scale-95 group/btn border border-[#254153]/10 h-fit shadow-sm hover:shadow-lg shadow-[#254153]/10 flex-shrink-0"
                                >
                                    Ver y Aprobar
                                    <ChevronRight className="h-4 w-4 transform group-hover/btn:translate-x-1 transition-all" />
                                </a>
                            </motion.div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

export default function PendientesPage() {
    return (
        <div className="min-h-screen bg-[#f8fafc] p-6 lg:p-12">
            <div className="max-w-[1100px] mx-auto space-y-10">
                <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                    <div className="space-y-2">
                        <div className="inline-flex items-center gap-2 px-3.5 py-1 bg-[#254153]/10 text-[#254153] rounded-full text-[11px] font-black uppercase tracking-widest mb-1 border border-[#254153]/15">
                            Portal Central de Aprobaciones
                        </div>
                        <h1 className="text-3xl md:text-4xl font-black text-[#254153] tracking-tight">
                            Pendientes por Aprobar
                        </h1>
                        <p className="text-gray-500 font-medium text-sm md:text-base">
                            Gestiona todas tus aprobaciones pendientes: Facturas Firplak, Documentos Soporte y Facturas Viventta.
                        </p>
                    </div>

                    <div className="flex-shrink-0">
                        <Suspense fallback={null}>
                            <HistorialButton />
                        </Suspense>
                    </div>
                </header>

                <Suspense fallback={
                    <div className="flex items-center justify-center p-20">
                        <Loader2 className="h-8 w-8 animate-spin text-[#254153]" />
                    </div>
                }>
                    <PendientesList />
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

function HistorialButton() {
    const searchParams = useSearchParams();
    const responsable = searchParams.get("responsable");
    return (
        <Link 
            href={`/externo/historial${responsable ? `?responsable=${encodeURIComponent(responsable)}` : ''}`}
        >
            <Button variant="outline" className="gap-2 text-[#254153] hover:bg-gray-100 border-[#254153]/20 shadow-sm font-bold text-xs">
                <History className="h-4 w-4" /> Historial de Aprobación
            </Button>
        </Link>
    );
}
