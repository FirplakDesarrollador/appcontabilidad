"use client";

import { useEffect, useState } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Bell, RefreshCw, Paperclip, ChevronLeft, ChevronRight, Loader2, FileText, Edit2, User, X, Check } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface SharePointInvoice {
    id: string;
    Proveedor?: string;
    Nro_Factura?: string;
    Nit?: string;
    Monto?: string;
    Responsable_de_Autorizar?: string;
    Aprobacion_Doliente?: string;
    Gestion_Contabilidad?: string;
    Consecutivo?: string;
    OData__RegistrationDate?: string;
    Created?: string;
    Documento_x0020_PDF?: string;
    [key: string]: any;
}

export default function InvoicesPage() {
    const [invoices, setInvoices] = useState<SharePointInvoice[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [activeTab, setActiveTab] = useState<'pending' | 'processed'>('pending');
    const [selectedInvoice, setSelectedInvoice] = useState<SharePointInvoice | null>(null);
    const [selectedResponsable, setSelectedResponsable] = useState<string>("all");
    const [isEditingResponsible, setIsEditingResponsible] = useState(false);
    const [userSearchQuery, setUserSearchQuery] = useState("");
    const [userSearchResults, setUserSearchResults] = useState<any[]>([]);
    const [isSearchingUsers, setIsSearchingUsers] = useState(false);
    const [isUpdatingResponsible, setIsUpdatingResponsible] = useState(false);
    const [pendingResponsibleUser, setPendingResponsibleUser] = useState<any>(null);

    const fetchInvoices = async () => {
        try {
            setLoading(true);
            const response = await fetch(`/api/sharepoint/all`);
            const data = await response.json();

            if (data.success) {
                const normalizedItems = data.items.map((item: any) => {
                    let documentInfo = null;
                    if (item.Documento_x0020_PDF) {
                        try {
                            documentInfo = JSON.parse(item.Documento_x0020_PDF);
                        } catch (e) {
                            console.warn("Error parsing Documento_x0020_PDF:", e);
                        }
                    }

                    const nitValue = item.Title || item.Nit_x0020_ || item["Nit "] || item.Nit || "N/A";
                    const montoValue = item.Valortotal ?? item.Valor_x0020_total ?? item["Valor total"] ?? item.Monto ?? 0;

                    return {
                        ...item,
                        Monto: montoValue,
                        Nit: nitValue,
                        Responsable_de_Autorizar: item.Responsable_de_Autorizar || item["Responsable de Autorizar"] || "Sin asignar",
                        documentInfo
                    };
                });
                setInvoices(normalizedItems);
            }
        } catch (error) {
            console.error("Error fetching all SharePoint invoices:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchInvoices();
    }, []);

    useEffect(() => {
        setPendingResponsibleUser(null);
        setIsEditingResponsible(false);
    }, [selectedInvoice]);

    useEffect(() => {
        const timer = setTimeout(async () => {
            if (userSearchQuery.length >= 3) {
                setIsSearchingUsers(true);
                try {
                    const res = await fetch(`/api/users/search?q=${encodeURIComponent(userSearchQuery)}`);
                    const data = await res.json();
                    setUserSearchResults(data.users || []);
                } catch (error) {
                    console.error("Error searching users:", error);
                } finally {
                    setIsSearchingUsers(false);
                }
            } else {
                setUserSearchResults([]);
            }
        }, 500);

        return () => clearTimeout(timer);
    }, [userSearchQuery]);

    const handleUpdateResponsible = async () => {
        if (!selectedInvoice || !pendingResponsibleUser) return;

        setIsUpdatingResponsible(true);
        try {
            const res = await fetch("/api/sharepoint/update-responsible", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    itemId: selectedInvoice.id,
                    userEmail: pendingResponsibleUser.email,
                    userName: pendingResponsibleUser.name
                })
            });

            if (res.ok) {
                // Update local state
                const updatedInvoices = invoices.map(inv =>
                    inv.id === selectedInvoice.id
                        ? { ...inv, Responsable_de_Autorizar: pendingResponsibleUser.name }
                        : inv
                );
                setInvoices(updatedInvoices);
                setSelectedInvoice({ ...selectedInvoice, Responsable_de_Autorizar: pendingResponsibleUser.name });
                setIsEditingResponsible(false);
                setPendingResponsibleUser(null);
                setUserSearchQuery("");
                alert("Responsable actualizado correctamente");
            } else {
                const data = await res.json();
                alert(`Error al actualizar: ${data.error}`);
            }
        } catch (error) {
            console.error("Error updating responsible:", error);
            alert("Error de conexión al actualizar el responsable");
        } finally {
            setIsUpdatingResponsible(false);
        }
    };



    const formatCurrency = (value: any) => {
        if (value === undefined || value === null || value === "") return "$ 0,00";

        let numericValue: number;
        if (typeof value === "number") {
            numericValue = value;
        } else {
            const cleaned = value.toString().replace(/[^\d.,-]/g, "").replace(",", ".");
            numericValue = parseFloat(cleaned);
        }

        if (isNaN(numericValue)) return value.toString();

        return new Intl.NumberFormat("es-CO", {
            style: "currency",
            currency: "COP",
            minimumFractionDigits: 2
        }).format(numericValue);
    };

    const getStatusStyles = (status: string | undefined) => {
        if (!status) return "bg-gray-100 text-gray-600 border-gray-200";
        const s = status.toLowerCase();
        if (s.includes("aprobado") || s.includes("procesado")) return "bg-emerald-50 text-emerald-700 border-emerald-100";
        if (s.includes("rechazado")) return "bg-rose-50 text-rose-700 border-rose-100";
        return "bg-amber-50 text-amber-700 border-amber-100";
    };

    const isPending = (inv: SharePointInvoice) => {
        const state = (inv.Aprobacion_Doliente || "Pendiente").toLowerCase();
        return state.includes("pendiente") || state.includes("por aprobar");
    };

    const isProcessed = (inv: SharePointInvoice) => {
        const state = (inv.Aprobacion_Doliente || "").toLowerCase();
        const contabilidad = (inv.Gestion_Contabilidad || "").toLowerCase();
        return state.includes("aprobado") || state.includes("rechazado") || contabilidad.includes("procesado");
    };

    const filteredInvoices = invoices.filter(inv => {
        const matchesSearch = !searchTerm ||
            inv.Nro_Factura?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            inv.Proveedor?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            inv.Nit?.toLowerCase().includes(searchTerm.toLowerCase());

        const matchesTab = activeTab === 'pending' ? isPending(inv) : isProcessed(inv);

        const matchesResponsable = selectedResponsable === "all" || inv.Responsable_de_Autorizar === selectedResponsable;

        return matchesSearch && matchesTab && matchesResponsable;
    });

    return (
        <div className="min-h-screen bg-[#f8fafc] flex">
            <Sidebar />

            <main className="flex-1 md:ml-64 relative bg-[#f8fafc]">
                {/* Header Superior */}
                <header className="h-20 bg-white/80 backdrop-blur-xl border-b border-gray-100 flex items-center justify-between px-8 sticky top-0 z-10">
                    <div className="flex items-center gap-3">
                        <div className="h-8 w-1.5 bg-[#254153] rounded-full" />
                        <h1 className="text-xl font-bold text-gray-800 tracking-tight">Aprobación de Facturas</h1>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="relative group">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 group-focus-within:text-[#254153] transition-colors" />
                            <input
                                type="text"
                                placeholder="Buscar facturas..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="h-10 pl-10 pr-4 rounded-xl bg-gray-50 border border-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-[#254153]/10 focus:bg-white w-64 transition-all"
                            />
                        </div>

                        <select
                            value={selectedResponsable}
                            onChange={(e) => setSelectedResponsable(e.target.value)}
                            className="h-10 px-4 rounded-xl bg-gray-50 border border-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-[#254153]/10 focus:bg-white transition-all text-gray-600 font-bold min-w-[200px]"
                        >
                            <option value="all">Todos los Responsables</option>
                            {Array.from(new Set(invoices.map(i => i.Responsable_de_Autorizar).filter(Boolean))).sort().map(resp => (
                                <option key={resp} value={resp}>{resp}</option>
                            ))}
                        </select>

                        <button className="h-10 w-10 flex items-center justify-center rounded-xl bg-gray-50 hover:bg-gray-100 border border-gray-100 transition-colors relative">
                            <Bell className="h-5 w-5 text-gray-600" />
                            <span className="absolute top-2.5 right-2.5 h-2 w-2 bg-rose-500 rounded-full border-2 border-white" />
                        </button>
                    </div>
                </header>

                <div className="p-8 max-w-[1600px] mx-auto space-y-8">
                    {/* Título y Resumen */}
                    <div className="flex justify-between items-end">
                        <motion.div
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                        >
                            <h2 className="text-3xl font-extrabold text-[#254153]">Gestión de Facturas</h2>
                            <p className="text-gray-500 mt-1 font-medium flex items-center gap-2">
                                <span className="h-2 w-2 bg-blue-500 rounded-full animate-pulse" />
                                Datos cargados directamente desde SharePoint Online
                            </p>
                        </motion.div>

                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                onClick={() => fetchInvoices()}
                                disabled={loading}
                                className="bg-white border-gray-100 rounded-xl h-11 px-4 text-gray-600 font-bold hover:bg-gray-50 transition-all shadow-sm"
                            >
                                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                                Actualizar
                            </Button>
                        </div>
                    </div>

                    {/* Indicadores / Estadísticas */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {[
                            {
                                label: "Total Facturas",
                                value: invoices.length,
                                icon: Paperclip,
                                color: "bg-blue-500",
                                bg: "bg-blue-50"
                            },
                            {
                                label: "Pendientes por Aprobar",
                                value: invoices.filter(isPending).length,
                                icon: RefreshCw,
                                color: "bg-amber-500",
                                bg: "bg-amber-50"
                            },
                            {
                                label: "Histórico Procesadas",
                                value: invoices.filter(isProcessed).length,
                                icon: Bell,
                                color: "bg-emerald-500",
                                bg: "bg-emerald-50"
                            }
                        ].map((stat, i) => (
                            <motion.div
                                key={stat.label}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: i * 0.1 }}
                                className="bg-white p-6 rounded-3xl border border-gray-100 shadow-[0_8px_30px_rgb(0,0,0,0.02)] flex items-center gap-5 group hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-all cursor-default"
                            >
                                <div className={`${stat.bg} p-4 rounded-2xl group-hover:scale-110 transition-transform duration-300`}>
                                    <div className={`h-6 w-6 ${stat.color} rounded-lg flex items-center justify-center`}>
                                        <stat.icon className="h-4 w-4 text-white" />
                                    </div>
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">{stat.label}</p>
                                    <p className="text-3xl font-black text-[#254153] mt-1">{loading ? "..." : stat.value}</p>
                                </div>
                            </motion.div>
                        ))}
                    </div>

                    {/* Tabs de Vistas */}
                    <div className="flex items-center gap-2 bg-gray-100/50 p-1.5 rounded-2xl w-fit border border-gray-100">
                        <button
                            onClick={() => setActiveTab('pending')}
                            className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 flex items-center gap-2 ${activeTab === 'pending'
                                ? "bg-[#254153] text-white shadow-lg shadow-blue-900/10"
                                : "text-gray-500 hover:text-gray-700 hover:bg-white/50"}`}
                        >
                            <RefreshCw className={`h-4 w-4 ${activeTab === 'pending' ? 'animate-spin-slow' : ''}`} />
                            Por Aprobar
                            {invoices.filter(isPending).length > 0 && (
                                <span className={`px-2 py-0.5 rounded-md text-[10px] ${activeTab === 'pending' ? "bg-white/20" : "bg-gray-200"}`}>
                                    {invoices.filter(isPending).length}
                                </span>
                            )}
                        </button>
                        <button
                            onClick={() => setActiveTab('processed')}
                            className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 flex items-center gap-2 ${activeTab === 'processed'
                                ? "bg-[#254153] text-white shadow-lg shadow-blue-900/10"
                                : "text-gray-500 hover:text-gray-700 hover:bg-white/50"}`}
                        >
                            <Bell className="h-4 w-4" />
                            Histórico
                            {invoices.filter(isProcessed).length > 0 && (
                                <span className={`px-2 py-0.5 rounded-md text-[10px] ${activeTab === 'processed' ? "bg-white/20" : "bg-gray-200"}`}>
                                    {invoices.filter(isProcessed).length}
                                </span>
                            )}
                        </button>
                    </div>

                    {/* Tabla de Facturas */}
                    <div className="bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 overflow-hidden">
                        <div className="overflow-x-auto min-h-[400px]">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-gray-50/50 border-b border-gray-100">
                                        <th className="px-6 py-5 text-[11px] font-bold text-gray-400 uppercase tracking-widest">Factura</th>
                                        <th className="px-6 py-5 text-[11px] font-bold text-gray-400 uppercase tracking-widest">Proveedor</th>
                                        <th className="px-6 py-5 text-[11px] font-bold text-gray-400 uppercase tracking-widest text-right px-10">Valor total</th>
                                        <th className="px-6 py-5 text-[11px] font-bold text-gray-400 uppercase tracking-widest">Responsable</th>
                                        <th className="px-6 py-5 text-[11px] font-bold text-gray-400 uppercase tracking-widest">Estado</th>
                                        <th className="px-6 py-5 text-[11px] font-bold text-gray-400 uppercase tracking-widest text-right">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    <AnimatePresence mode="popLayout">
                                        {loading ? (
                                            Array.from({ length: 8 }).map((_, i) => (
                                                <tr key={`skeleton-${i}`} className="animate-pulse">
                                                    <td className="px-6 py-5"><div className="h-4 bg-gray-100 rounded w-20" /></td>
                                                    <td className="px-6 py-5"><div className="h-4 bg-gray-100 rounded w-40" /></td>
                                                    <td className="px-6 py-5"><div className="h-4 bg-gray-100 rounded w-24 ml-auto" /></td>
                                                    <td className="px-6 py-5"><div className="h-4 bg-gray-100 rounded w-32" /></td>
                                                    <td className="px-6 py-5"><div className="h-7 bg-gray-100 rounded-full w-24" /></td>
                                                    <td className="px-6 py-5 text-right"><div className="h-8 bg-gray-100 rounded-lg w-16 ml-auto" /></td>
                                                </tr>
                                            ))
                                        ) : filteredInvoices.length === 0 ? (
                                            <tr>
                                                <td colSpan={6} className="px-6 py-20 text-center">
                                                    <div className="flex flex-col items-center gap-3 opacity-30">
                                                        <Search className="h-12 w-12 text-[#254153]" />
                                                        <p className="text-lg font-bold text-[#254153]">No se encontraron resultados</p>
                                                    </div>
                                                </td>
                                            </tr>
                                        ) : (
                                            filteredInvoices.map((inv, idx) => (
                                                <motion.tr
                                                    initial={{ opacity: 0, y: 10 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    transition={{ delay: idx * 0.03 }}
                                                    key={inv.id}
                                                    className="hover:bg-[#f8fafc] transition-colors group"
                                                >
                                                    <td className="px-6 py-5">
                                                        <div className="font-bold text-[#254153] leading-none">{inv.Nro_Factura || "S/N"}</div>
                                                        <div className="text-[10px] text-gray-400 mt-1 font-medium tracking-tight">REF: {inv.id}</div>
                                                    </td>
                                                    <td className="px-6 py-5">
                                                        <div className="text-sm font-bold text-gray-800">{inv.Proveedor || "N/A"}</div>
                                                        <div className="text-[11px] text-gray-500 mt-0.5 font-medium">NIT: {inv.Nit || "N/A"}</div>
                                                    </td>
                                                    <td className="px-6 py-5 text-right px-10">
                                                        <div className="text-sm font-extrabold text-[#254153]">{formatCurrency(inv.Monto)}</div>
                                                    </td>
                                                    <td className="px-6 py-5">
                                                        <div className="text-xs font-semibold text-gray-600">{inv.Responsable_de_Autorizar || "Sin asignar"}</div>
                                                        <div className="text-[10px] text-gray-400 font-medium">
                                                            {inv.Created ? new Date(inv.Created).toLocaleDateString() : ""}
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-5">
                                                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-[10px] font-bold border ${getStatusStyles(inv.Aprobacion_Doliente)}`}>
                                                            {inv.Aprobacion_Doliente || "Pendiente"}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-5 text-right">
                                                        <div className="flex items-center justify-end gap-2">
                                                            <Button
                                                                variant="outline"
                                                                onClick={() => setSelectedInvoice(inv)}
                                                                className="h-8 w-8 p-0 text-gray-400 border-gray-100 hover:bg-gray-50 bg-white rounded-lg transition-all shadow-sm flex items-center justify-center"
                                                                title="Ver Detalle"
                                                            >
                                                                <Search className="h-3.5 w-3.5" />
                                                            </Button>
                                                            <Button
                                                                variant="outline"
                                                                onClick={() => setSelectedInvoice(inv)}
                                                                className="h-8 px-3 text-[10px] font-bold text-blue-600 border-blue-100 hover:bg-blue-50 bg-white rounded-lg transition-all shadow-sm flex items-center gap-1.5"
                                                            >
                                                                <Paperclip className="h-3 w-3" />
                                                                Enviar Factura
                                                            </Button>
                                                        </div>
                                                    </td>
                                                </motion.tr>
                                            ))
                                        )}
                                    </AnimatePresence>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Paginación - Eliminada para carga completa */}
                    {!loading && filteredInvoices.length > 0 && (
                        <div className="flex items-center justify-between pt-4">
                            <div className="text-sm text-gray-400 font-medium italic">
                                Mostrando <span className="text-[#254153] font-bold">{filteredInvoices.length}</span> registros de {activeTab === 'pending' ? 'pestaña Por Aprobar' : 'pestaña Histórico'}
                            </div>
                        </div>
                    )}
                </div>
            </main>

            {/* Modal de Detalle de Factura */}
            <AnimatePresence>
                {selectedInvoice && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setSelectedInvoice(null)}
                            className="absolute inset-0 bg-[#254153]/40 backdrop-blur-md"
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="bg-white rounded-[32px] shadow-2xl w-full max-w-4xl relative overflow-hidden border border-white/20"
                        >
                            <div className="p-8">
                                <div className="flex justify-between items-start mb-8">
                                    <div className="flex items-center gap-4">
                                        <div className="h-14 w-14 bg-blue-50 rounded-2xl flex items-center justify-center shadow-inner">
                                            <Paperclip className="h-7 w-7 text-blue-500" />
                                        </div>
                                        <div>
                                            <h3 className="text-2xl font-black text-[#254153]">Detalle de Factura</h3>
                                            <p className="text-gray-400 font-bold tabular-nums">#{selectedInvoice.Nro_Factura || selectedInvoice.id}</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setSelectedInvoice(null)}
                                        className="h-12 w-12 rounded-2xl bg-gray-50 flex items-center justify-center hover:bg-rose-50 hover:text-rose-500 transition-all text-gray-400 border border-gray-100"
                                    >
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                                    </button>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    {/* Información Básica */}
                                    <div className="space-y-6">
                                        <div className="bg-gray-50/50 p-6 rounded-[24px] border border-gray-100 space-y-4">
                                            <h4 className="text-[11px] font-black text-gray-400 uppercase tracking-[2px]">Información del Proveedor</h4>
                                            <div className="space-y-3">
                                                <div>
                                                    <p className="text-[11px] font-bold text-gray-400 uppercase">Proveedor</p>
                                                    <p className="text-lg font-black text-[#254153]">{selectedInvoice.Proveedor || "N/A"}</p>
                                                </div>
                                                <div>
                                                    <p className="text-[11px] font-bold text-gray-400 uppercase">NIT</p>
                                                    <p className="font-bold text-gray-600">{selectedInvoice.Nit || "N/A"}</p>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="bg-gray-50/50 p-6 rounded-[24px] border border-gray-100 space-y-4">
                                            <h4 className="text-[11px] font-black text-gray-400 uppercase tracking-[2px]">Montos y Fechas</h4>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <p className="text-[11px] font-bold text-gray-400 uppercase">Valor Total</p>
                                                    <p className="text-xl font-black text-[#254153]">{formatCurrency(selectedInvoice.Monto)}</p>
                                                </div>
                                                <div>
                                                    <p className="text-[11px] font-bold text-gray-400 uppercase">Fecha Registro</p>
                                                    <p className="font-bold text-gray-600">{selectedInvoice.Created ? new Date(selectedInvoice.Created).toLocaleDateString() : "N/A"}</p>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Documento Adjunto */}
                                        {selectedInvoice.documentInfo && (
                                            <div className="bg-[#254153]/5 p-6 rounded-[24px] border border-[#254153]/10 space-y-4">
                                                <div className="flex items-center justify-between">
                                                    <h4 className="text-[11px] font-black text-gray-400 uppercase tracking-[2px]">Documento Adjunto</h4>
                                                    <span className="px-2 py-0.5 rounded bg-blue-100 text-[10px] font-bold text-blue-600 uppercase">
                                                        {selectedInvoice.documentInfo.fileName?.split('.').pop()}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-4">
                                                    <div className="h-12 w-12 bg-white rounded-xl flex items-center justify-center shadow-sm border border-gray-100">
                                                        <FileText className="h-6 w-6 text-blue-500" />
                                                    </div>
                                                    <div className="flex-1 overflow-hidden">
                                                        <p className="text-sm font-bold text-[#254153] truncate">{selectedInvoice.documentInfo.fileName || "Factura Adjunta"}</p>
                                                        <p className="text-[10px] text-gray-400 font-medium italic">Archivo original de SharePoint</p>
                                                    </div>
                                                    <a
                                                        href={`https://firplaksa.sharepoint.com${selectedInvoice.documentInfo.serverRelativeUrl}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="h-10 px-4 flex items-center justify-center rounded-xl bg-white border border-gray-100 text-xs font-bold text-[#254153] hover:bg-gray-50 transition-all shadow-sm"
                                                    >
                                                        Ver PDF
                                                    </a>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Estados y Responsables */}
                                    <div className="space-y-6">
                                        <div className="bg-gray-50/50 p-6 rounded-[24px] border border-gray-100 space-y-4">
                                            <h4 className="text-[11px] font-black text-gray-400 uppercase tracking-[2px]">Gestión y Aprobación</h4>
                                            <div className="space-y-4">
                                                <div>
                                                    <p className="text-[11px] font-bold text-gray-400 uppercase mb-1.5">Estado Aprobación</p>
                                                    <span className={`inline-flex items-center px-4 py-1.5 rounded-full text-xs font-black border ${getStatusStyles(selectedInvoice.Aprobacion_Doliente)}`}>
                                                        {selectedInvoice.Aprobacion_Doliente || "Pendiente"}
                                                    </span>
                                                </div>
                                                <div>
                                                    <p className="text-[11px] font-bold text-gray-400 uppercase mb-1">Responsable de Autorizar</p>
                                                    {!isEditingResponsible ? (
                                                        <div className="flex flex-col gap-1">
                                                            <div className="flex items-center gap-2 group cursor-pointer" onClick={() => setIsEditingResponsible(true)}>
                                                                <p className={`font-extrabold ${pendingResponsibleUser ? 'text-blue-600 italic' : 'text-[#254153]'} hover:text-blue-600 transition-colors`}>
                                                                    {pendingResponsibleUser ? pendingResponsibleUser.name : (selectedInvoice.Responsable_de_Autorizar || "No asignado")}
                                                                </p>
                                                                <Edit2 className="h-3 w-3 text-gray-300 group-hover:text-blue-500 transition-colors" />
                                                            </div>
                                                            {pendingResponsibleUser && (
                                                                <p className="text-[9px] font-bold text-blue-400 uppercase tracking-tighter">⚠️ Cambio pendiente por guardar</p>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <div className="relative space-y-2">
                                                            <div className="flex items-center gap-2">
                                                                <div className="relative flex-1">
                                                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                                                                    <input
                                                                        autoFocus
                                                                        type="text"
                                                                        placeholder="Buscar persona..."
                                                                        className="w-full pl-9 pr-4 py-2 bg-white border border-blue-100 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                                                        value={userSearchQuery}
                                                                        onChange={(e) => setUserSearchQuery(e.target.value)}
                                                                    />
                                                                    {isSearchingUsers && (
                                                                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                                                            <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                <button
                                                                    onClick={() => {
                                                                        setIsEditingResponsible(false);
                                                                        setUserSearchQuery("");
                                                                        setUserSearchResults([]);
                                                                    }}
                                                                    className="p-2 hover:bg-rose-50 text-rose-500 rounded-lg transition-colors border border-rose-100"
                                                                >
                                                                    <X className="h-4 w-4" />
                                                                </button>
                                                            </div>

                                                            {userSearchResults.length > 0 && (
                                                                <div className="absolute z-[110] left-0 right-0 mt-1 bg-white border border-gray-100 rounded-2xl shadow-xl overflow-hidden max-h-[220px] overflow-y-auto custom-scrollbar">
                                                                    {userSearchResults.map((user) => (
                                                                        <button
                                                                            key={user.id}
                                                                            onClick={() => {
                                                                                setPendingResponsibleUser(user);
                                                                                setIsEditingResponsible(false);
                                                                                setUserSearchQuery("");
                                                                                setUserSearchResults([]);
                                                                            }}
                                                                            className="w-full px-4 py-3 flex items-center gap-3 hover:bg-blue-50/50 transition-colors text-left border-b border-gray-50 last:border-0"
                                                                        >
                                                                            <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                                                                                <User className="h-4 w-4 text-blue-600" />
                                                                            </div>
                                                                            <div className="min-w-0">
                                                                                <p className="text-[13px] font-bold text-[#254153] truncate">{user.name}</p>
                                                                                <p className="text-[10px] text-gray-400 truncate">{user.email}</p>
                                                                            </div>
                                                                            {isUpdatingResponsible && (
                                                                                <Loader2 className="h-3 w-3 animate-spin ml-auto text-blue-500" />
                                                                            )}
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                                <div>
                                                    <p className="text-[11px] font-bold text-gray-400 uppercase">Gestión Contabilidad</p>
                                                    <p className="font-bold text-gray-600">{selectedInvoice.Gestion_Contabilidad || "Pendiente"}</p>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex gap-3 pt-2">
                                            {pendingResponsibleUser ? (
                                                <Button
                                                    onClick={handleUpdateResponsible}
                                                    disabled={isUpdatingResponsible}
                                                    className="flex-1 h-14 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-black text-sm shadow-xl shadow-blue-900/10 flex items-center justify-center gap-2"
                                                >
                                                    {isUpdatingResponsible ? (
                                                        <Loader2 className="h-5 w-5 animate-spin" />
                                                    ) : (
                                                        <Check className="h-5 w-5" />
                                                    )}
                                                    Actualizar Responsable
                                                </Button>
                                            ) : (
                                                <Button className="flex-1 h-14 rounded-2xl bg-[#254153] hover:bg-[#1a2d3a] text-white font-black text-sm shadow-xl shadow-blue-900/10">
                                                    Enviar Factura
                                                </Button>
                                            )}
                                            <Button variant="outline" className="h-14 rounded-2xl px-6 border-gray-100 font-bold text-gray-500 hover:bg-gray-50">
                                                Imprimir
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
