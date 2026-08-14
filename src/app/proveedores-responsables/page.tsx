"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { useAuth } from "@/context/AuthContext";
import { useSidebar } from "@/context/SidebarContext";
import { motion, AnimatePresence } from "framer-motion";
import { 
    Users, 
    UserCheck, 
    UserX, 
    Building2, 
    Search, 
    Plus, 
    Download, 
    RefreshCw, 
    Edit2, 
    Trash2, 
    Copy, 
    Check, 
    AlertCircle, 
    ChevronLeft, 
    ChevronRight, 
    Menu, 
    Loader2, 
    ArrowUpDown, 
    CheckCircle2, 
    XCircle, 
    Phone, 
    Mail, 
    SlidersHorizontal,
    Sparkles
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ProviderModal, ProviderItem } from "@/components/modals/ProviderModal";
import { BatchAssignModal } from "@/components/modals/BatchAssignModal";
import * as XLSX from "xlsx";

export default function ProveedoresResponsablesPage() {
    const { user, role, isLoading: authLoading } = useAuth();
    const { toggleSidebar } = useSidebar();

    // Data states
    const [items, setItems] = useState<ProviderItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);
    const [totalPages, setTotalPages] = useState(1);
    const [stats, setStats] = useState({
        totalFirplak: 0,
        withResponsibleFirplak: 0,
        withoutResponsibleFirplak: 0,
        totalViventta: 0
    });

    // Filters and sorting
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState<"all" | "with_responsible" | "without_responsible">("all");
    const [sourceFilter, setSourceFilter] = useState<"firplak" | "viventta">("firplak");
    const [sortBy, setSortBy] = useState("Nombre de socio de negocios");
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

    // Selection for batch actions
    const [selectedIds, setSelectedIds] = useState<number[]>([]);

    // Modals
    const [isProviderModalOpen, setIsProviderModalOpen] = useState(false);
    const [editingProvider, setEditingProvider] = useState<ProviderItem | null>(null);
    const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
    const [itemToDelete, setItemToDelete] = useState<ProviderItem | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    // Notification toast / copy feedback
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [toastMessage, setToastMessage] = useState<string | null>(null);

    const showToast = (msg: string) => {
        setToastMessage(msg);
        setTimeout(() => setToastMessage(null), 4000);
    };

    const fetchProviders = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                page: String(page),
                pageSize: String(pageSize),
                search: search.trim(),
                status: statusFilter,
                source: sourceFilter,
                sortBy,
                sortOrder
            });

            const res = await fetch(`/api/proveedores-responsables?${params.toString()}`);
            if (!res.ok) {
                throw new Error("Error al obtener los proveedores");
            }

            const data = await res.json();
            setItems(data.items || []);
            setTotal(data.total || 0);
            setTotalPages(data.totalPages || 1);
            if (data.stats) {
                setStats(prev => ({
                    totalFirplak: data.stats.totalFirplak ?? prev.totalFirplak ?? 0,
                    withResponsibleFirplak: data.stats.withResponsibleFirplak ?? prev.withResponsibleFirplak ?? 0,
                    withoutResponsibleFirplak: data.stats.withoutResponsibleFirplak ?? prev.withoutResponsibleFirplak ?? 0,
                    totalViventta: data.stats.totalViventta ?? prev.totalViventta ?? 0
                }));
            }
        } catch (err: any) {
            console.error("Error cargando proveedores:", err);
            showToast("Error al cargar proveedores: " + err.message);
        } finally {
            setLoading(false);
        }
    }, [page, pageSize, search, statusFilter, sourceFilter, sortBy, sortOrder]);

    useEffect(() => {
        fetchProviders();
    }, [fetchProviders]);

    // Handle search input debounce
    const [searchInput, setSearchInput] = useState("");
    useEffect(() => {
        const timer = setTimeout(() => {
            setSearch(searchInput);
            setPage(1);
        }, 350);
        return () => clearTimeout(timer);
    }, [searchInput]);

    // Copy NIT
    const handleCopyNit = (nit: string) => {
        navigator.clipboard.writeText(nit);
        setCopiedId(nit);
        setTimeout(() => setCopiedId(null), 2000);
    };

    // Toggle single selection
    const handleToggleSelect = (id: number) => {
        setSelectedIds(prev => 
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    // Toggle select all on current page
    const handleToggleSelectAll = () => {
        const pageIds = items.map(i => i.id).filter(Boolean) as number[];
        const allSelected = pageIds.every(id => selectedIds.includes(id));
        if (allSelected) {
            setSelectedIds(prev => prev.filter(id => !pageIds.includes(id)));
        } else {
            setSelectedIds(prev => Array.from(new Set([...prev, ...pageIds])));
        }
    };

    // Delete single provider
    const confirmDelete = async () => {
        if (!itemToDelete?.id) return;
        setIsDeleting(true);
        try {
            const res = await fetch(`/api/proveedores-responsables?id=${itemToDelete.id}&source=${itemToDelete.source || 'firplak'}`, {
                method: "DELETE"
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Error al eliminar");

            showToast("Proveedor eliminado correctamente");
            setItemToDelete(null);
            setSelectedIds(prev => prev.filter(id => id !== itemToDelete.id));
            fetchProviders();
        } catch (err: any) {
            showToast("Error: " + err.message);
        } finally {
            setIsDeleting(false);
        }
    };

    // Export to Excel
    const [isExporting, setIsExporting] = useState(false);
    const handleExportExcel = async () => {
        setIsExporting(true);
        try {
            const params = new URLSearchParams({
                pageSize: "all",
                search: search.trim(),
                status: statusFilter,
                source: sourceFilter,
                sortBy,
                sortOrder
            });

            const res = await fetch(`/api/proveedores-responsables?${params.toString()}`);
            const data = await res.json();
            const exportItems = data.items || [];

            const excelRows = exportItems.map((item: ProviderItem, index: number) => ({
                "N°": index + 1,
                "NIT / Identificación": item.nit,
                "Código SN (SAP)": item.codigo_sn || "",
                "Razón Social / Proveedor": item.razon_social,
                "Responsable de Autorizar": item.responsable || "SIN ASIGNAR",
                "Autorizador": item.autorizador || item.responsable || "",
                "Correo Electrónico": item.correo || "",
                "Teléfono": item.telefono || "",
                "Notificar": item.notificar === "True" ? "Sí" : "No",
                "Última Modificación": item.modificado || "",
                "Modificado Por": item.modificado_por || "",
                "Empresa / Origen": item.source === "viventta" ? "Viventta" : "Firplak"
            }));

            const worksheet = XLSX.utils.json_to_sheet(excelRows);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Proveedores y Responsables");

            // Auto column widths
            const colWidths = [
                { wch: 6 },
                { wch: 18 },
                { wch: 18 },
                { wch: 38 },
                { wch: 32 },
                { wch: 32 },
                { wch: 28 },
                { wch: 16 },
                { wch: 10 },
                { wch: 22 },
                { wch: 24 },
                { wch: 12 },
            ];
            worksheet['!cols'] = colWidths;

            const dateStr = new Date().toISOString().split('T')[0];
            XLSX.writeFile(workbook, `Matriz_Proveedores_Responsables_${sourceFilter}_${dateStr}.xlsx`);
            showToast("Archivo Excel exportado exitosamente");
        } catch (err: any) {
            console.error("Error exportando a Excel:", err);
            showToast("Error exportando a Excel: " + err.message);
        } finally {
            setIsExporting(false);
        }
    };

    // Calculate completion percentage
    const coveragePercentage = (stats?.totalFirplak || 0) > 0 
        ? Math.round(((stats?.withResponsibleFirplak || 0) / stats.totalFirplak) * 100) 
        : 0;

    return (
        <div className="flex h-screen bg-[#f8fafc] font-sans overflow-hidden">
            <Sidebar />

            <main className="flex-1 flex flex-col min-w-0 overflow-hidden md:ml-64 relative">
                {/* Top Toast Banner */}
                <AnimatePresence>
                    {toastMessage && (
                        <motion.div
                            initial={{ opacity: 0, y: -20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-[#254153] text-white px-5 py-2.5 rounded-2xl shadow-xl border border-white/10 flex items-center gap-3 text-xs font-semibold"
                        >
                            <Sparkles className="h-4 w-4 text-emerald-400" />
                            <span>{toastMessage}</span>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Header */}
                <header className="bg-white/80 backdrop-blur-xl border-b border-gray-200 sticky top-0 z-20 shadow-sm">
                    <div className="px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <button
                                onClick={toggleSidebar}
                                className="md:hidden p-2 rounded-xl text-gray-600 hover:bg-gray-100 transition-colors"
                            >
                                <Menu className="h-6 w-6" />
                            </button>
                            <div className="h-12 w-12 rounded-2xl bg-[#254153]/5 flex items-center justify-center border border-[#254153]/10 shadow-sm">
                                <UserCheck className="h-6 w-6 text-[#254153]" />
                            </div>
                            <div>
                                <h1 className="text-xl font-bold text-[#254153] tracking-tight">
                                    Responsables por Proveedor
                                </h1>
                                <p className="text-xs text-gray-500 font-medium">
                                    Consulta, matricula y asigna dolientes para auto-aprobación y radicación
                                </p>
                            </div>
                        </div>

                        {/* Top Action Buttons */}
                        <div className="flex items-center gap-2.5">
                            <Button
                                variant="outline"
                                onClick={() => fetchProviders()}
                                disabled={loading}
                                className="h-10 px-3.5 border-gray-200 text-gray-700 hover:bg-gray-50 rounded-xl text-xs font-bold"
                                title="Refrescar datos"
                            >
                                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                            </Button>

                            <Button
                                variant="outline"
                                onClick={handleExportExcel}
                                disabled={isExporting || items.length === 0}
                                className="h-10 px-3.5 border-gray-200 text-gray-700 hover:bg-gray-50 rounded-xl text-xs font-bold gap-2"
                            >
                                {isExporting ? <Loader2 className="h-4 w-4 animate-spin text-[#254153]" /> : <Download className="h-4 w-4 text-emerald-600" />}
                                <span className="hidden sm:inline">Exportar Excel</span>
                            </Button>

                            <Button
                                onClick={() => {
                                    setEditingProvider(null);
                                    setIsProviderModalOpen(true);
                                }}
                                className="h-10 px-4 bg-[#254153] hover:bg-[#1a2f3d] text-white rounded-xl text-xs font-bold gap-2 shadow-sm"
                            >
                                <Plus className="h-4 w-4" />
                                <span>Matricular Proveedor</span>
                            </Button>
                        </div>
                    </div>
                </header>

                {/* Main Content Area */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* KPI Metric Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {/* Total Firplak */}
                        <div 
                            onClick={() => {
                                setSourceFilter("firplak");
                                setStatusFilter("all");
                                setPage(1);
                            }}
                            className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                                sourceFilter === "firplak" && statusFilter === "all"
                                    ? "bg-[#254153] text-white border-[#254153] shadow-md ring-2 ring-[#254153]/20"
                                    : "bg-white text-gray-800 border-gray-200/80 hover:border-gray-300 shadow-sm"
                            }`}
                        >
                            <div className="flex items-center justify-between mb-2">
                                <span className={`text-[11px] font-bold uppercase tracking-wider ${sourceFilter === "firplak" && statusFilter === "all" ? "text-white/70" : "text-gray-400"}`}>
                                    Total Firplak
                                </span>
                                <div className={`p-2 rounded-xl ${sourceFilter === "firplak" && statusFilter === "all" ? "bg-white/10" : "bg-blue-50 text-blue-600"}`}>
                                    <Building2 className="h-4 w-4" />
                                </div>
                            </div>
                            <div className="flex items-baseline gap-2">
                                <span className="text-2xl font-black">{(stats?.totalFirplak ?? 0).toLocaleString()}</span>
                                <span className={`text-xs font-semibold ${sourceFilter === "firplak" && statusFilter === "all" ? "text-white/60" : "text-gray-400"}`}>proveedores</span>
                            </div>
                        </div>

                        {/* Con Responsable */}
                        <div 
                            onClick={() => {
                                setSourceFilter("firplak");
                                setStatusFilter("with_responsible");
                                setPage(1);
                            }}
                            className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                                sourceFilter === "firplak" && statusFilter === "with_responsible"
                                    ? "bg-emerald-700 text-white border-emerald-700 shadow-md ring-2 ring-emerald-600/20"
                                    : "bg-white text-gray-800 border-gray-200/80 hover:border-gray-300 shadow-sm"
                            }`}
                        >
                            <div className="flex items-center justify-between mb-2">
                                <span className={`text-[11px] font-bold uppercase tracking-wider ${sourceFilter === "firplak" && statusFilter === "with_responsible" ? "text-white/70" : "text-gray-400"}`}>
                                    Con Responsable
                                </span>
                                <div className={`p-2 rounded-xl ${sourceFilter === "firplak" && statusFilter === "with_responsible" ? "bg-white/10" : "bg-emerald-50 text-emerald-600"}`}>
                                    <UserCheck className="h-4 w-4" />
                                </div>
                            </div>
                            <div className="flex items-baseline gap-2">
                                <span className="text-2xl font-black">{(stats?.withResponsibleFirplak ?? 0).toLocaleString()}</span>
                                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                                    sourceFilter === "firplak" && statusFilter === "with_responsible" 
                                        ? "bg-white/20 text-white" 
                                        : "bg-emerald-100 text-emerald-800"
                                }`}>
                                    {coveragePercentage}%
                                </span>
                            </div>
                        </div>

                        {/* Sin Responsable */}
                        <div 
                            onClick={() => {
                                setSourceFilter("firplak");
                                setStatusFilter("without_responsible");
                                setPage(1);
                            }}
                            className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                                sourceFilter === "firplak" && statusFilter === "without_responsible"
                                    ? "bg-amber-600 text-white border-amber-600 shadow-md ring-2 ring-amber-500/20"
                                    : "bg-white text-gray-800 border-gray-200/80 hover:border-gray-300 shadow-sm"
                            }`}
                        >
                            <div className="flex items-center justify-between mb-2">
                                <span className={`text-[11px] font-bold uppercase tracking-wider ${sourceFilter === "firplak" && statusFilter === "without_responsible" ? "text-white/70" : "text-gray-400"}`}>
                                    Sin Responsable
                                </span>
                                <div className={`p-2 rounded-xl ${sourceFilter === "firplak" && statusFilter === "without_responsible" ? "bg-white/10" : "bg-amber-50 text-amber-600"}`}>
                                    <UserX className="h-4 w-4" />
                                </div>
                            </div>
                            <div className="flex items-baseline gap-2">
                                <span className="text-2xl font-black">{(stats?.withoutResponsibleFirplak ?? 0).toLocaleString()}</span>
                                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                                    sourceFilter === "firplak" && statusFilter === "without_responsible" 
                                        ? "bg-white/20 text-white" 
                                        : "bg-amber-100 text-amber-800"
                                }`}>
                                    Pendientes
                                </span>
                            </div>
                        </div>

                        {/* Viventta */}
                        <div 
                            onClick={() => {
                                setSourceFilter("viventta");
                                setStatusFilter("all");
                                setPage(1);
                            }}
                            className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                                sourceFilter === "viventta"
                                    ? "bg-[#254153] text-white border-[#254153] shadow-md ring-2 ring-[#254153]/20"
                                    : "bg-white text-gray-800 border-gray-200/80 hover:border-gray-300 shadow-sm"
                            }`}
                        >
                            <div className="flex items-center justify-between mb-2">
                                <span className={`text-[11px] font-bold uppercase tracking-wider ${sourceFilter === "viventta" ? "text-white/70" : "text-gray-400"}`}>
                                    Proveedores Viventta
                                </span>
                                <div className={`p-2 rounded-xl ${sourceFilter === "viventta" ? "bg-white/10" : "bg-purple-50 text-purple-600"}`}>
                                    <Users className="h-4 w-4" />
                                </div>
                            </div>
                            <div className="flex items-baseline gap-2">
                                <span className="text-2xl font-black">{(stats?.totalViventta ?? 0).toLocaleString()}</span>
                                <span className={`text-xs font-semibold ${sourceFilter === "viventta" ? "text-white/60" : "text-gray-400"}`}>registros</span>
                            </div>
                        </div>
                    </div>

                    {/* Filter, Search & Source Tabs */}
                    <div className="bg-white rounded-2xl border border-gray-200/80 p-4 shadow-sm space-y-4">
                        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
                            {/* Source Pills (Firplak vs Viventta) */}
                            <div className="flex items-center bg-gray-100/80 p-1 rounded-xl border border-gray-200/60 self-start">
                                <button
                                    onClick={() => {
                                        setSourceFilter("firplak");
                                        setPage(1);
                                    }}
                                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                                        sourceFilter === "firplak"
                                            ? "bg-white text-[#254153] shadow-sm"
                                            : "text-gray-500 hover:text-gray-800"
                                    }`}
                                >
                                    🏢 Firplak (Matriz Principal)
                                </button>
                                <button
                                    onClick={() => {
                                        setSourceFilter("viventta");
                                        setPage(1);
                                    }}
                                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                                        sourceFilter === "viventta"
                                            ? "bg-white text-[#254153] shadow-sm"
                                            : "text-gray-500 hover:text-gray-800"
                                    }`}
                                >
                                    🏡 Viventta
                                </button>
                            </div>

                            {/* Status Filter Tabs (Todos / Con Responsable / Sin Responsable) */}
                            <div className="flex items-center gap-2 overflow-x-auto pb-1 lg:pb-0">
                                <button
                                    onClick={() => {
                                        setStatusFilter("all");
                                        setPage(1);
                                    }}
                                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                                        statusFilter === "all"
                                            ? "bg-[#254153] text-white shadow-sm"
                                            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                                    }`}
                                >
                                    Todos ({sourceFilter === "firplak" ? (stats?.totalFirplak ?? 0) : (stats?.totalViventta ?? 0)})
                                </button>
                                <button
                                    onClick={() => {
                                        setStatusFilter("with_responsible");
                                        setPage(1);
                                    }}
                                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                                        statusFilter === "with_responsible"
                                            ? "bg-emerald-600 text-white shadow-sm"
                                            : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                    }`}
                                >
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                    Con Responsable
                                </button>
                                <button
                                    onClick={() => {
                                        setStatusFilter("without_responsible");
                                        setPage(1);
                                    }}
                                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                                        statusFilter === "without_responsible"
                                            ? "bg-amber-600 text-white shadow-sm"
                                            : "bg-amber-50 text-amber-700 hover:bg-amber-100"
                                    }`}
                                >
                                    <AlertCircle className="h-3.5 w-3.5" />
                                    Sin Responsable ({stats?.withoutResponsibleFirplak ?? 0})
                                </button>
                            </div>
                        </div>

                        {/* Search Bar & Page Size */}
                        <div className="flex flex-col sm:flex-row items-center gap-3 pt-2 border-t border-gray-100">
                            <div className="relative flex-1 w-full">
                                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                <input
                                    type="text"
                                    value={searchInput}
                                    onChange={(e) => setSearchInput(e.target.value)}
                                    placeholder="Buscar por NIT, Razón Social, Responsable, Autorizador o Correo..."
                                    className="w-full pl-10 pr-4 py-2.5 bg-gray-50/80 border border-gray-200 rounded-xl text-xs font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#254153]/20 focus:border-[#254153] transition-all"
                                />
                                {searchInput && (
                                    <button
                                        onClick={() => setSearchInput("")}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1 text-xs"
                                    >
                                        ✕
                                    </button>
                                )}
                            </div>

                            <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                                <span className="text-xs text-gray-400 font-semibold">Mostrar:</span>
                                <select
                                    value={pageSize}
                                    onChange={(e) => {
                                        setPageSize(Number(e.target.value));
                                        setPage(1);
                                    }}
                                    className="bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 py-2 px-3 focus:outline-none focus:ring-2 focus:ring-[#254153]/20"
                                >
                                    <option value={15}>15 por pág.</option>
                                    <option value={25}>25 por pág.</option>
                                    <option value={50}>50 por pág.</option>
                                    <option value={100}>100 por pág.</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Batch Actions Bar (Floating / Conditional) */}
                    <AnimatePresence>
                        {selectedIds.length > 0 && (
                            <motion.div
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                className="bg-[#254153] text-white p-3.5 rounded-2xl shadow-lg flex flex-col sm:flex-row items-center justify-between gap-3"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="h-8 w-8 rounded-xl bg-white/20 flex items-center justify-center text-xs font-bold">
                                        {selectedIds.length}
                                    </div>
                                    <span className="text-xs font-bold">
                                        {selectedIds.length} {selectedIds.length === 1 ? 'proveedor seleccionado' : 'proveedores seleccionados'}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Button
                                        onClick={() => setIsBatchModalOpen(true)}
                                        className="h-8 px-4 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold shadow-sm"
                                    >
                                        <UserCheck className="h-3.5 w-3.5 mr-1.5" />
                                        Asignar Responsable en Lote
                                    </Button>
                                    <button
                                        onClick={() => setSelectedIds([])}
                                        className="text-white/70 hover:text-white text-xs font-semibold px-3 py-1.5 hover:bg-white/10 rounded-xl transition-colors"
                                    >
                                        Deseleccionar
                                    </button>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Table View */}
                    <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm overflow-hidden flex flex-col">
                        <div className="overflow-x-auto min-h-[350px]">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-gray-50/80 border-b border-gray-200/80 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                                        <th className="p-4 w-10 text-center">
                                            <input
                                                type="checkbox"
                                                checked={items.length > 0 && items.every(i => selectedIds.includes(i.id!))}
                                                onChange={handleToggleSelectAll}
                                                className="h-4 w-4 rounded border-gray-300 text-[#254153] focus:ring-[#254153]"
                                            />
                                        </th>
                                        <th 
                                            className="p-4 cursor-pointer hover:text-[#254153] transition-colors select-none"
                                            onClick={() => {
                                                if (sortBy === "nit") {
                                                    setSortOrder(sortOrder === "asc" ? "desc" : "asc");
                                                } else {
                                                    setSortBy("nit");
                                                    setSortOrder("asc");
                                                }
                                            }}
                                        >
                                            <div className="flex items-center gap-1.5">
                                                <span>NIT / Código</span>
                                                <ArrowUpDown className="h-3.5 w-3.5" />
                                            </div>
                                        </th>
                                        <th 
                                            className="p-4 cursor-pointer hover:text-[#254153] transition-colors select-none"
                                            onClick={() => {
                                                if (sortBy === "Nombre de socio de negocios") {
                                                    setSortOrder(sortOrder === "asc" ? "desc" : "asc");
                                                } else {
                                                    setSortBy("Nombre de socio de negocios");
                                                    setSortOrder("asc");
                                                }
                                            }}
                                        >
                                            <div className="flex items-center gap-1.5">
                                                <span>Razón Social / Proveedor</span>
                                                <ArrowUpDown className="h-3.5 w-3.5" />
                                            </div>
                                        </th>
                                        <th 
                                            className="p-4 cursor-pointer hover:text-[#254153] transition-colors select-none"
                                            onClick={() => {
                                                if (sortBy === "responsable") {
                                                    setSortOrder(sortOrder === "asc" ? "desc" : "asc");
                                                } else {
                                                    setSortBy("responsable");
                                                    setSortOrder("asc");
                                                }
                                            }}
                                        >
                                            <div className="flex items-center gap-1.5">
                                                <span>Responsable Asignado</span>
                                                <ArrowUpDown className="h-3.5 w-3.5" />
                                            </div>
                                        </th>
                                        {sourceFilter === "firplak" && (
                                            <>
                                                <th className="p-4">Autorizador</th>
                                                <th className="p-4">Contacto / Notificaciones</th>
                                                <th className="p-4">Última Modificación</th>
                                            </>
                                        )}
                                        <th className="p-4 text-right pr-6">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 text-xs">
                                    {loading ? (
                                        <tr>
                                            <td colSpan={sourceFilter === "firplak" ? 8 : 5} className="p-12 text-center">
                                                <div className="flex flex-col items-center justify-center gap-2">
                                                    <Loader2 className="h-8 w-8 text-[#254153] animate-spin" />
                                                    <p className="text-gray-500 font-medium">Cargando proveedores y responsables...</p>
                                                </div>
                                            </td>
                                        </tr>
                                    ) : items.length === 0 ? (
                                        <tr>
                                            <td colSpan={sourceFilter === "firplak" ? 8 : 5} className="p-12 text-center">
                                                <div className="flex flex-col items-center justify-center gap-3">
                                                    <div className="h-12 w-12 rounded-2xl bg-gray-100 flex items-center justify-center text-gray-400">
                                                        <Building2 className="h-6 w-6" />
                                                    </div>
                                                    <div>
                                                        <p className="font-bold text-gray-700 text-sm">No se encontraron proveedores</p>
                                                        <p className="text-gray-400 text-xs mt-0.5">
                                                            {search ? "Prueba ajustando los términos de búsqueda o filtros" : "No hay registros registrados en esta vista"}
                                                        </p>
                                                    </div>
                                                    <Button
                                                        onClick={() => {
                                                            setEditingProvider(null);
                                                            setIsProviderModalOpen(true);
                                                        }}
                                                        className="mt-2 h-9 text-xs font-bold bg-[#254153] hover:bg-[#1a2f3d] text-white rounded-xl"
                                                    >
                                                        <Plus className="h-4 w-4 mr-1.5" />
                                                        Matricular Proveedor
                                                    </Button>
                                                </div>
                                            </td>
                                        </tr>
                                    ) : (
                                        items.map((item) => {
                                            const isSelected = selectedIds.includes(item.id!);
                                            const hasResp = Boolean(item.responsable && item.responsable.trim());

                                            return (
                                                <tr
                                                    key={item.id}
                                                    className={`hover:bg-slate-50/70 transition-colors ${
                                                        isSelected ? "bg-blue-50/40" : ""
                                                    }`}
                                                >
                                                    {/* Select Checkbox */}
                                                    <td className="p-4 text-center">
                                                        <input
                                                            type="checkbox"
                                                            checked={isSelected}
                                                            onChange={() => handleToggleSelect(item.id!)}
                                                            className="h-4 w-4 rounded border-gray-300 text-[#254153] focus:ring-[#254153]"
                                                        />
                                                    </td>

                                                    {/* NIT & Código SN */}
                                                    <td className="p-4">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-mono font-bold text-gray-900 bg-gray-100 px-2 py-0.5 rounded-md text-[11px]">
                                                                {item.nit}
                                                            </span>
                                                            <button
                                                                onClick={() => handleCopyNit(item.nit)}
                                                                className="text-gray-400 hover:text-gray-700 transition-colors"
                                                                title="Copiar NIT"
                                                            >
                                                                {copiedId === item.nit ? (
                                                                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                                                                ) : (
                                                                    <Copy className="h-3.5 w-3.5" />
                                                                )}
                                                            </button>
                                                        </div>
                                                        {item.codigo_sn && item.codigo_sn !== item.nit && (
                                                            <p className="text-[10px] text-gray-400 font-mono mt-0.5">
                                                                SN: {item.codigo_sn}
                                                            </p>
                                                        )}
                                                    </td>

                                                    {/* Razón Social */}
                                                    <td className="p-4 max-w-xs">
                                                        <p className="font-bold text-gray-800 uppercase line-clamp-2" title={item.razon_social}>
                                                            {item.razon_social}
                                                        </p>
                                                    </td>

                                                    {/* Responsable */}
                                                    <td className="p-4">
                                                        {hasResp ? (
                                                            <div className="flex items-center gap-2">
                                                                <div className="h-7 w-7 rounded-full bg-[#254153]/10 text-[#254153] flex items-center justify-center font-bold text-xs shrink-0">
                                                                    {item.responsable?.[0]?.toUpperCase() || "R"}
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <p className="font-bold text-gray-900 truncate">{item.responsable}</p>
                                                                    {item.correo && (
                                                                        <p className="text-[10px] text-gray-400 truncate flex items-center gap-1">
                                                                            <Mail className="h-2.5 w-2.5" /> {item.correo}
                                                                        </p>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <button
                                                                onClick={() => {
                                                                    setEditingProvider(item);
                                                                    setIsProviderModalOpen(true);
                                                                }}
                                                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 transition-colors"
                                                            >
                                                                <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
                                                                <span>Sin Asignar (Asignar)</span>
                                                            </button>
                                                        )}
                                                    </td>

                                                    {/* Firplak Specific Columns */}
                                                    {sourceFilter === "firplak" && (
                                                        <>
                                                            {/* Autorizador */}
                                                            <td className="p-4">
                                                                <span className="text-gray-700 font-medium">
                                                                    {item.autorizador || item.responsable || "—"}
                                                                </span>
                                                            </td>

                                                            {/* Contacto / Notificaciones */}
                                                            <td className="p-4">
                                                                <div className="space-y-1">
                                                                    {item.telefono && (
                                                                        <div className="flex items-center gap-1 text-[11px] text-gray-600">
                                                                            <Phone className="h-3 w-3 text-gray-400" />
                                                                            <span>{item.telefono}</span>
                                                                        </div>
                                                                    )}
                                                                    <div className="flex items-center gap-1.5">
                                                                        <span className={`inline-block h-1.5 w-1.5 rounded-full ${
                                                                            item.notificar === 'True' ? 'bg-emerald-500' : 'bg-gray-300'
                                                                        }`} />
                                                                        <span className="text-[10px] text-gray-500">
                                                                            {item.notificar === 'True' ? 'Notif. Activa' : 'Notif. Inactiva'}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            </td>

                                                            {/* Modificado */}
                                                            <td className="p-4 text-gray-500">
                                                                <p className="text-[11px]">{item.modificado || item.creado || "—"}</p>
                                                                {item.modificado_por && (
                                                                    <p className="text-[10px] text-gray-400 truncate max-w-[140px]">
                                                                        por {item.modificado_por}
                                                                    </p>
                                                                )}
                                                            </td>
                                                        </>
                                                    )}

                                                    {/* Actions */}
                                                    <td className="p-4 text-right pr-6">
                                                        <div className="flex items-center justify-end gap-1">
                                                            <button
                                                                onClick={() => {
                                                                    setEditingProvider(item);
                                                                    setIsProviderModalOpen(true);
                                                                }}
                                                                className="p-1.5 text-gray-400 hover:text-[#254153] hover:bg-gray-100 rounded-lg transition-colors"
                                                                title="Editar Proveedor y Responsable"
                                                            >
                                                                <Edit2 className="h-4 w-4" />
                                                            </button>

                                                            {role === "admin" && (
                                                                <button
                                                                    onClick={() => setItemToDelete(item)}
                                                                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                                    title="Eliminar Proveedor"
                                                                >
                                                                    <Trash2 className="h-4 w-4" />
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination Footer */}
                        <div className="p-4 border-t border-gray-200/80 bg-gray-50/50 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-500">
                            <div>
                                Mostrando{" "}
                                <span className="font-bold text-gray-800">
                                    {items.length > 0 ? (page - 1) * pageSize + 1 : 0}
                                </span>{" "}
                                a{" "}
                                <span className="font-bold text-gray-800">
                                    {Math.min(page * pageSize, total)}
                                </span>{" "}
                                de <span className="font-bold text-gray-800">{total.toLocaleString()}</span> registros
                            </div>

                            <div className="flex items-center gap-1.5">
                                <Button
                                    variant="outline"
                                    onClick={() => setPage(p => Math.max(1, p - 1))}
                                    disabled={page === 1 || loading}
                                    className="h-8 px-2.5 rounded-lg border-gray-200 text-gray-600 disabled:opacity-40"
                                >
                                    <ChevronLeft className="h-4 w-4 mr-1" />
                                    Anterior
                                </Button>

                                <div className="px-3 py-1 bg-white border border-gray-200 rounded-lg font-bold text-gray-800">
                                    Página {page} de {Math.max(1, totalPages)}
                                </div>

                                <Button
                                    variant="outline"
                                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                    disabled={page >= totalPages || loading}
                                    className="h-8 px-2.5 rounded-lg border-gray-200 text-gray-600 disabled:opacity-40"
                                >
                                    Siguiente
                                    <ChevronRight className="h-4 w-4 ml-1" />
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </main>

            {/* Provider Modal (Create / Edit) */}
            <ProviderModal
                isOpen={isProviderModalOpen}
                onClose={() => {
                    setIsProviderModalOpen(false);
                    setEditingProvider(null);
                }}
                onSaveSuccess={() => {
                    showToast(editingProvider ? "Proveedor actualizado correctamente" : "Proveedor matriculado correctamente");
                    fetchProviders();
                }}
                providerToEdit={editingProvider}
                userEmail={user?.email || "Usuario"}
            />

            {/* Batch Assign Modal */}
            <BatchAssignModal
                isOpen={isBatchModalOpen}
                onClose={() => setIsBatchModalOpen(false)}
                onSuccess={() => {
                    showToast(`Responsable asignado a ${selectedIds.length} proveedores`);
                    setSelectedIds([]);
                    fetchProviders();
                }}
                selectedIds={selectedIds}
                selectedCount={selectedIds.length}
                source={sourceFilter}
                userEmail={user?.email || "Usuario"}
            />

            {/* Delete Confirmation Modal */}
            <AnimatePresence>
                {itemToDelete && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-gray-100 space-y-4"
                        >
                            <div className="h-12 w-12 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center">
                                <Trash2 className="h-6 w-6" />
                            </div>
                            <div>
                                <h3 className="text-base font-bold text-gray-900">¿Eliminar este proveedor?</h3>
                                <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                                    Se eliminará la matrícula del proveedor <strong>{itemToDelete.razon_social}</strong> (NIT: {itemToDelete.nit}). Esta acción no se puede deshacer.
                                </p>
                            </div>
                            <div className="flex items-center justify-end gap-2.5 pt-2">
                                <Button
                                    variant="outline"
                                    onClick={() => setItemToDelete(null)}
                                    disabled={isDeleting}
                                    className="rounded-xl text-xs"
                                >
                                    Cancelar
                                </Button>
                                <Button
                                    onClick={confirmDelete}
                                    disabled={isDeleting}
                                    className="bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold gap-1.5"
                                >
                                    {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                    Eliminar Definitivamente
                                </Button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
