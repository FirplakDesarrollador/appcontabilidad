"use client";

import { useEffect, useState } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { supabase } from "@/lib/supabaseClient";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, Search, Menu, Filter, Download, RefreshCw, Link as LinkIcon, Check, Copy, Database, X, FileText, User, Landmark, Calendar, Hash, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/Button";
import Link from "next/link";

interface Invoice {
    ID: number;
    Nit: string | null;
    Proveedor: string | null;
    Nro_Factura: string | null;
    Aprobacion_Doliente: string | null;
    Gestion_Contabilidad: string | null;
    Observaciones: string | null;
    Consecutivo: string | null;
    Responsable_de_Autorizar: string | null;
    FechaAprobacion: string | null;
    centro_costos: string | null;
    "Valor total": string | null;
    tiene_anticipo: string | null;
    Creado: string | null;
    "Creado por": string | null;
    CUFE: string | null;
    InformeRecepcion: string | null;
    FechaProcesado: string | null;
    DigitadoPor: string | null;
    "Datos adjuntos": number | null;
    tablaCostos: string | null;
    Procesado: string | null;
    Modificado: string | null;
    "Modificado por": string | null;
    fp: string | null;
    notificar_reasignacion: boolean | null;
    notificacionContabilidadEnviada: string | null;
}

export default function InvoicesPage() {
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [filterStatus, setFilterStatus] = useState<string>("todos");
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [page, setPage] = useState(0);
    const [syncing, setSyncing] = useState(false);
    const [copiedId, setCopiedId] = useState<number | null>(null);
    const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [counts, setCounts] = useState({ todos: 0, pendientes: 0, aprobadas: 0, rechazadas: 0 });
    const [sapStatus, setSapStatus] = useState<'idle' | 'loading' | 'found' | 'not_found' | 'error'>('idle');
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [selectedResponsible, setSelectedResponsible] = useState<string>("todos");
    const [responsibles, setResponsibles] = useState<string[]>([]);
    const ITEMS_PER_PAGE = 20;

    useEffect(() => {
        const handler = setTimeout(() => setDebouncedSearch(searchTerm), 500);
        return () => clearTimeout(handler);
    }, [searchTerm]);

    useEffect(() => {
        fetchInvoices(true);
        fetchCounts();
        fetchResponsibles();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [debouncedSearch, filterStatus, selectedResponsible]);

    useEffect(() => {
        if (isModalOpen && selectedInvoice) {
            checkSapStatus(selectedInvoice.Nro_Factura, selectedInvoice.Nit);
        } else {
            setSapStatus('idle');
        }
    }, [isModalOpen, selectedInvoice]);

    const checkSapStatus = async (nroFactura: string | null, nit: string | null) => {
        if (!nroFactura) {
            setSapStatus('not_found');
            return;
        }

        setSapStatus('loading');
        try {
            const res = await fetch('/api/sap/validate-invoice', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nroFactura, nit })
            });

            if (!res.ok) {
                const errData = await res.text();
                console.error('SAP Validation API error response:', res.status, errData);
                throw new Error('Failed to validate in SAP');
            }

            const data = await res.json();
            if (data.exists) {
                setSapStatus('found');
            } else {
                setSapStatus('not_found');
            }
        } catch (error) {
            console.error("Error checking SAP status:", error);
            setSapStatus('error');
        }
    };

    const fetchCounts = async () => {
        try {
            let queryTodos = supabase.from('Registro_Facturas').select('*', { count: 'exact', head: true });
            let queryPendientes = supabase.from('Registro_Facturas').select('*', { count: 'exact', head: true }).eq('Aprobacion_Doliente', 'Por Aprobar');
            let queryAprobadas = supabase.from('Registro_Facturas').select('*', { count: 'exact', head: true }).eq('Aprobacion_Doliente', 'Aprobado');
            let queryRechazadas = supabase.from('Registro_Facturas').select('*', { count: 'exact', head: true }).eq('Aprobacion_Doliente', 'Rechazado');

            const applyFilters = (q: any) => {
                let filteredQuery = q;
                if (selectedResponsible === 'null') {
                    filteredQuery = filteredQuery.is('Responsable_de_Autorizar', null);
                } else if (selectedResponsible !== 'todos') {
                    filteredQuery = filteredQuery.eq('Responsable_de_Autorizar', selectedResponsible);
                }
                if (debouncedSearch) {
                    filteredQuery = filteredQuery.or(`Nro_Factura.ilike.%${debouncedSearch}%,Proveedor.ilike.%${debouncedSearch}%,Nit.ilike.%${debouncedSearch}%,Responsable_de_Autorizar.ilike.%${debouncedSearch}%`);
                }
                return filteredQuery;
            };

            const { count: countTodos } = await applyFilters(queryTodos);
            const { count: countPendientes } = await applyFilters(queryPendientes);
            const { count: countAprobadas } = await applyFilters(queryAprobadas);
            const { count: countRechazadas } = await applyFilters(queryRechazadas);
            
            setCounts({
                todos: countTodos || 0,
                pendientes: countPendientes || 0,
                aprobadas: countAprobadas || 0,
                rechazadas: countRechazadas || 0
            });
        } catch (error) {
            console.error('Error fetching counts:', error);
        }
    };

    const fetchResponsibles = async () => {
        try {
            const { data, error } = await supabase
                .from('Registro_Facturas')
                .select('Responsable_de_Autorizar')
                .not('Responsable_de_Autorizar', 'is', null);

            if (error) throw error;

            if (data) {
                const uniqueResponsibles = Array.from(new Set(data.map(item => item.Responsable_de_Autorizar))).sort();
                setResponsibles(uniqueResponsibles as string[]);
            }
        } catch (error) {
            console.error('Error fetching responsibles:', error);
        }
    };

    const fetchInvoices = async (reset = false) => {
        try {
            if (reset) {
                setLoading(true);
                setPage(0);
            } else {
                setLoadingMore(true);
            }

            let query = supabase.from('Registro_Facturas').select('*').order('ID', { ascending: false });

            if (filterStatus !== 'todos') {
                query = query.eq('Aprobacion_Doliente', filterStatus);
            }

            if (selectedResponsible === 'null') {
                query = query.is('Responsable_de_Autorizar', null);
            } else if (selectedResponsible !== 'todos') {
                query = query.eq('Responsable_de_Autorizar', selectedResponsible);
            }

            if (debouncedSearch) {
                query = query.or(`Nro_Factura.ilike.%${debouncedSearch}%,Proveedor.ilike.%${debouncedSearch}%,Nit.ilike.%${debouncedSearch}%,Responsable_de_Autorizar.ilike.%${debouncedSearch}%`);
            }

            const from = reset ? 0 : (page + 1) * ITEMS_PER_PAGE;
            const to = from + ITEMS_PER_PAGE - 1;

            const { data, error } = await query.range(from, to);

            if (error) throw error;

            if (data) {
                if (reset) {
                    setInvoices(data as Invoice[]);
                } else {
                    setInvoices(prev => [...prev, ...(data as Invoice[])]);
                }
                setHasMore(data.length === ITEMS_PER_PAGE);
                if (!reset) setPage(p => p + 1);
            }
        } catch (error) {
            console.error('Error fetching invoices:', error);
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    };

    const syncInvoices = async () => {
        setSyncing(true);
        try {
            const res = await fetch('/api/sharepoint/sync', { method: 'POST' });
            const data = await res.json();

            if (data.success) {
                alert(data.message || 'Sincronización con SharePoint completada.');
                fetchInvoices(true);
                fetchCounts();
            } else {
                alert('Error al sincronizar con SharePoint: ' + (data.error || 'Error desconocido'));
            }
        } catch (error) {
            console.error('Sync error:', error);
            alert('Error de conexión con el servidor SharePoint.');
        } finally {
            syncing && setSyncing(false);
        }
    };

    const handleAction = async (action: 'Aprobado' | 'Rechazado') => {
        if (!selectedInvoice) return;
        
        setActionLoading(action);
        try {
            const res = await fetch('/api/public-action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: selectedInvoice.ID, action }),
            });

            const data = await res.json();
            if (data.success) {
                // Update local lists
                setInvoices(prev => prev.map(inv => 
                    inv.ID === selectedInvoice.ID ? { ...inv, Aprobacion_Doliente: action, Gestion_Contabilidad: action } : inv
                ));
                setSelectedInvoice(prev => prev ? { ...prev, Aprobacion_Doliente: action, Gestion_Contabilidad: action } : null);
                
                // Refresh counts
                fetchCounts();
            } else {
                throw new Error(data.error || 'Error al procesar la acción');
            }
        } catch (error: any) {
            console.error('Action error:', error);
            alert('Error: ' + error.message);
        } finally {
            setActionLoading(null);
        }
    };

    const getStatusColor = (status: string | null) => {
        if (!status) return 'bg-yellow-100 text-yellow-700 border-yellow-200';
        const s = status.toLowerCase();
        if (s.includes('aprobado') || s.includes('procesado')) return 'bg-green-100 text-green-700 border-green-200';
        if (s.includes('rechazado') || s.includes('anulado')) return 'bg-red-100 text-red-700 border-red-200';
        if (s.includes('por aprobar')) return 'bg-yellow-100 text-yellow-700 border-yellow-200';
        return 'bg-blue-100 text-blue-700 border-blue-200';
    };

    const getStatusLabel = (status: string | null) => {
        return status || 'Pendiente';
    };

    const formatCurrency = (value: string | null) => {
        if (!value) return '$0.00';
        // Remove currency symbols and format as number
        const numericValue = parseFloat(value.replace(/[^\d.,]/g, '').replace(',', '.'));
        if (isNaN(numericValue)) return value;
        return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' }).format(numericValue);
    };

    const copyApprovalLink = (id: number) => {
        const url = `${window.location.origin}/p/aprobacion/${id}`;
        navigator.clipboard.writeText(url);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    return (
        <div className="min-h-screen bg-[#f8fafc] flex">
            <Sidebar />

            <main className="flex-1 md:ml-64 relative bg-[#f8fafc]">
                {/* Header */}
                <header className="h-20 bg-white/80 backdrop-blur-xl border-b border-gray-100 flex items-center justify-between px-6 sticky top-0 z-10">
                    <div className="font-semibold text-gray-800 text-lg">Aprobación de Facturas</div>
                    <div className="flex items-center gap-4">
                        <div className="relative hidden md:block">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Buscar por factura, proveedor o NIT..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="h-10 pl-10 pr-4 rounded-full bg-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-[#254153]/20 w-80"
                            />
                        </div>
                        <button className="h-10 w-10 flex items-center justify-center rounded-full hover:bg-gray-100 relative">
                            <Bell className="h-5 w-5 text-gray-600" />
                        </button>
                    </div>
                </header>

                <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-6">
                    <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
                        <div>
                            <div className="flex items-center gap-3">
                                <h1 className="text-3xl font-bold text-[#254153]">Gestión de Facturas</h1>
                                <span className="px-3 py-1 bg-[#254153]/5 text-[#254153] text-xs font-bold rounded-full border border-[#254153]/10">
                                    {counts.todos} {counts.todos === 1 ? 'Factura' : 'Facturas'} en total
                                </span>
                            </div>
                            <p className="text-gray-500 mt-1">Sincronización bidireccional con SharePoint Online</p>
                        </div>

                        <div className="flex flex-wrap items-center gap-4">
                            <div className="flex bg-gray-100/50 p-1.5 rounded-2xl border border-gray-100 shadow-sm backdrop-blur-md">
                                {[
                                    { id: "todos", label: "Todas", color: "bg-gray-500", key: "todos" },
                                    { id: "Por Aprobar", label: "Pendientes", color: "bg-blue-500", key: "pendientes" },
                                    { id: "Aprobado", label: "Aprobadas", color: "bg-green-500", key: "aprobadas" },
                                    { id: "Rechazado", label: "Rechazadas", color: "bg-red-500", key: "rechazadas" }
                                ].map((tab) => {
                                    const count = counts[tab.key as keyof typeof counts] || 0;

                                    return (
                                        <button
                                            key={tab.id}
                                            onClick={() => setFilterStatus(tab.id)}
                                            className={`relative px-4 py-2 text-sm font-bold rounded-xl transition-all duration-300 flex items-center gap-2.5 ${filterStatus === tab.id
                                                ? "bg-white text-[#254153] shadow-sm ring-1 ring-black/5"
                                                : "text-gray-400 hover:text-gray-600 hover:bg-white/50"
                                                }`}
                                        >
                                            <span className={`w-1.5 h-1.5 rounded-full ${tab.color} ${filterStatus === tab.id ? "opacity-100" : "opacity-40"}`} />
                                            {tab.label}
                                            {count > 0 && (
                                                <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-mono ${filterStatus === tab.id ? "bg-[#254153] text-white" : "bg-gray-200 text-gray-500"
                                                    }`}>
                                                    {count}
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>

                            <Button
                                variant="outline"
                                className="h-12 bg-[#254153] text-white hover:bg-[#1a2e3b] border-none shadow-lg shadow-[#254153]/20 px-6 rounded-2xl font-bold flex items-center gap-2"
                                onClick={syncInvoices}
                                disabled={syncing}
                            >
                                <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
                                {syncing ? 'Sincronizando...' : 'Sincronizar'}
                            </Button>
                        </div>
                    </div>

                    <div className="flex items-center justify-between pb-2">
                        <div className="flex gap-2">
                            <Button variant="outline" className="bg-white border-gray-100 rounded-xl h-10 shadow-sm text-gray-600 text-xs font-bold uppercase transition-all hover:border-[#254153]/30">
                                <Download className="mr-2 h-4 w-4" /> Exportar reporte
                            </Button>
                            <Link href="/p/test-sharepoint">
                                <Button variant="outline" className="bg-white border-gray-100 rounded-xl h-10 shadow-sm text-[#254153] text-xs font-bold uppercase transition-all hover:border-[#254153]/30">
                                    <Database className="mr-2 h-4 w-4" /> Inspeccionar SharePoint
                                </Button>
                            </Link>
                        </div>

                        <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2 px-4 h-11 rounded-2xl bg-white border border-gray-100 shadow-sm focus-within:border-[#254153]/30 transition-all group">
                                <User className="h-4 w-4 text-[#254153]/40 group-focus-within:text-[#254153] transition-colors" />
                                <div className="flex flex-col">
                                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-[0.1em] leading-none mb-0.5">Filtrar por Responsable</span>
                                    <select
                                        value={selectedResponsible}
                                        onChange={(e) => setSelectedResponsible(e.target.value)}
                                        className="bg-transparent text-[11px] font-bold text-[#254153] focus:outline-none cursor-pointer min-w-[180px] appearance-none"
                                    >
                                        <option value="todos">TODOS LOS RESPONSABLES</option>
                                        <option value="null">SIN RESPONSABLE ASIGNADO</option>
                                        {responsibles.map(resp => (
                                            <option key={resp} value={resp}>{resp?.toUpperCase()}</option>
                                        ))}
                                    </select>
                                </div>
                                <Filter className="h-3 w-3 text-gray-300" />
                            </div>
                        </div>
                    </div>

                    {/* Invoices Table */}
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="bg-gray-50 border-b border-gray-100">
                                    <tr>
                                        <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">No. Factura</th>
                                        <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Proveedor</th>
                                        <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Fecha</th>
                                        <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Monto</th>
                                        <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Responsable</th>
                                        <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Estado</th>
                                        <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {loading ? (
                                        Array.from({ length: 5 }).map((_, i) => (
                                            <tr key={i} className="animate-pulse">
                                                <td className="px-6 py-4"><div className="h-4 bg-gray-200 rounded w-20"></div></td>
                                                <td className="px-6 py-4"><div className="h-4 bg-gray-200 rounded w-32"></div></td>
                                                <td className="px-6 py-4"><div className="h-4 bg-gray-200 rounded w-24"></div></td>
                                                <td className="px-6 py-4"><div className="h-4 bg-gray-200 rounded w-20"></div></td>
                                                <td className="px-6 py-4"><div className="h-4 bg-gray-200 rounded w-20"></div></td>
                                                <td className="px-6 py-4"><div className="h-6 bg-gray-200 rounded-full w-24"></div></td>
                                                <td className="px-6 py-4 text-right"></td>
                                            </tr>
                                        ))
                                    ) : invoices.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} className="px-6 py-12 text-center">
                                                <div className="flex flex-col items-center justify-center text-gray-400 gap-2">
                                                    <Search className="h-8 w-8 opacity-20" />
                                                    <p className="text-sm italic">No se encontraron facturas que coincidan con la búsqueda.</p>
                                                </div>
                                            </td>
                                        </tr>
                                    ) : (
                                        invoices.map((invoice) => (
                                            <motion.tr
                                                layout
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                key={invoice.ID}
                                                className="hover:bg-gray-50/50 transition-colors group"
                                            >
                                                <td className="px-6 py-4 font-medium text-[#254153]">
                                                    {invoice.Nro_Factura || 'S/N'}
                                                    <div className="text-[10px] text-gray-400 font-normal">ID: {invoice.ID}</div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="text-sm font-medium text-gray-900">{invoice.Proveedor || 'N/A'}</div>
                                                    <div className="text-xs text-gray-500">NIT: {invoice.Nit || 'N/A'}</div>
                                                </td>
                                                <td className="px-6 py-4 text-gray-500 text-sm">
                                                    <div className="flex flex-col">
                                                        <span>{invoice.FechaAprobacion ? new Date(invoice.FechaAprobacion).toLocaleDateString() :
                                                            invoice.Creado ? new Date(invoice.Creado).toLocaleDateString() : 'N/A'}</span>
                                                        <span className="text-[10px] text-gray-400">
                                                            {invoice.FechaAprobacion ? new Date(invoice.FechaAprobacion).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 font-semibold text-gray-900">
                                                    {formatCurrency(invoice["Valor total"])}
                                                </td>
                                                <td className="px-6 py-4 text-gray-600 text-sm">
                                                    {invoice.Responsable_de_Autorizar || 'No asignado'}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(invoice.Aprobacion_Doliente)}`}>
                                                        {getStatusLabel(invoice.Aprobacion_Doliente)}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <div className="flex justify-end gap-2 text-right">
                                                        <Button
                                                            variant="ghost"
                                                            className={`h-8 w-8 p-0 ${copiedId === invoice.ID ? 'text-green-500' : 'text-gray-400 hover:text-[#254153]'}`}
                                                            onClick={() => copyApprovalLink(invoice.ID)}
                                                            title="Copiar link de aprobación"
                                                        >
                                                            {copiedId === invoice.ID ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                                                        </Button>
                                                        <Button 
                                                            variant="ghost" 
                                                            className="text-xs h-8"
                                                            onClick={() => {
                                                                setSelectedInvoice(invoice);
                                                                setIsModalOpen(true);
                                                            }}
                                                        >
                                                            Ver Detalles
                                                        </Button>
                                                    </div>
                                                </td>
                                            </motion.tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                        {hasMore && invoices.length > 0 && !loading && (
                            <div className="p-4 border-t border-gray-100 flex justify-center">
                                <Button
                                    variant="outline"
                                    className="bg-white border-gray-200 text-gray-600 hover:bg-gray-50 font-medium rounded-xl h-10 px-6"
                                    onClick={() => fetchInvoices(false)}
                                    disabled={loadingMore}
                                >
                                    {loadingMore ? (
                                        <>
                                            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                                            Cargando más...
                                        </>
                                    ) : (
                                        'Cargar más facturas'
                                    )}
                                </Button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Invoice Details Modal */}
                <AnimatePresence>
                    {isModalOpen && selectedInvoice && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-6">
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                onClick={() => setIsModalOpen(false)}
                                className="absolute inset-0 bg-[#254153]/40 backdrop-blur-sm"
                            />
                            <motion.div
                                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                                className="bg-white rounded-[2.5rem] shadow-2xl border border-white overflow-hidden max-w-2xl w-full relative z-10"
                            >
                                <div className="h-3 bg-gradient-to-r from-[#254153] to-[#4a6b8a]" />
                                <button 
                                    onClick={() => setIsModalOpen(false)}
                                    className="absolute top-6 right-6 h-10 w-10 flex items-center justify-center rounded-full bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600 transition-colors"
                                >
                                    <X className="h-5 w-5" />
                                </button>

                                <div className="p-8 md:p-12">
                                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-12">
                                        <div>
                                            <div className="flex items-center gap-2 mb-3">
                                                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#254153]/5 text-[#254153] text-[10px] font-bold uppercase tracking-wider">
                                                    <FileText className="h-3 w-3" /> Detalles de Factura
                                                </div>
                                                
                                                {sapStatus === 'loading' && (
                                                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 text-blue-600 text-[10px] font-bold uppercase tracking-wider border border-blue-200">
                                                        <RefreshCw className="h-3 w-3 animate-spin" /> Consultando SAP...
                                                    </div>
                                                )}
                                                {sapStatus === 'found' && (
                                                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-green-50 text-green-700 text-[10px] font-bold uppercase tracking-wider border border-green-200">
                                                        <Check className="h-3 w-3" /> Ingresado a SAP
                                                    </div>
                                                )}
                                                {sapStatus === 'not_found' && (
                                                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-50 text-red-700 text-[10px] font-bold uppercase tracking-wider border border-red-200">
                                                        <X className="h-3 w-3" /> Factura no ingresada a SAP
                                                    </div>
                                                )}
                                                {sapStatus === 'error' && (
                                                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-yellow-50 text-yellow-700 text-[10px] font-bold uppercase tracking-wider border border-yellow-200">
                                                        <RefreshCw className="h-3 w-3" /> Error al consultar
                                                    </div>
                                                )}
                                            </div>
                                            <h1 className="text-3xl font-extrabold text-[#254153] tracking-tight">
                                                {selectedInvoice.Nro_Factura || 'S/N'}
                                            </h1>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-1">Monto Total</p>
                                            <p className="text-3xl font-black text-[#254153] font-mono tracking-tighter">
                                                {formatCurrency(selectedInvoice["Valor total"])}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8 mb-12">
                                        <ModalInfoItem icon={<User />} label="Proveedor" value={selectedInvoice.Proveedor} />
                                        <ModalInfoItem icon={<Landmark />} label="NIT" value={selectedInvoice.Nit} />
                                        <ModalInfoItem icon={<Calendar />} label="Fecha" value={selectedInvoice.FechaAprobacion || selectedInvoice.Creado ? new Date(selectedInvoice.FechaAprobacion || selectedInvoice.Creado!).toLocaleDateString() : 'N/A'} />
                                        <ModalInfoItem icon={<Hash />} label="ID de Registro" value={selectedInvoice.ID.toString()} />
                                        <div className="col-span-full pt-4 border-t border-gray-50">
                                            <ModalInfoItem icon={<User />} label="Responsable" value={selectedInvoice.Responsable_de_Autorizar} subValue="Autoridad asignada para esta gestión" />
                                        </div>
                                    </div>

                                    {selectedInvoice.Gestion_Contabilidad === 'Aprobado' || selectedInvoice.Gestion_Contabilidad === 'Rechazado' ? (
                                        <div className={`w-full rounded-2xl p-6 mb-4 text-center border ${selectedInvoice.Gestion_Contabilidad === 'Aprobado'
                                            ? 'bg-green-50/50 border-green-100 text-green-800'
                                            : 'bg-red-50/50 border-red-100 text-red-800'
                                            }`}>
                                            <div className="flex items-center justify-center gap-3 mb-2 font-bold uppercase tracking-wide">
                                                {selectedInvoice.Gestion_Contabilidad === 'Aprobado' ? <Check className="h-5 w-5" /> : <X className="h-5 w-5" />}
                                                Factura {selectedInvoice.Gestion_Contabilidad}
                                            </div>
                                            <p className="opacity-70 text-xs font-medium italic">Esta factura ya ha sido procesada.</p>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col sm:flex-row gap-4 w-full mb-6">
                                            <Button
                                                className="flex-1 h-14 rounded-2xl bg-[#254153] hover:bg-[#1a2e3b] text-white font-bold text-lg shadow-lg shadow-[#254153]/20 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                                                onClick={() => handleAction('Aprobado')}
                                                disabled={!!actionLoading}
                                            >
                                                {actionLoading === 'Aprobado' ? <RefreshCw className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
                                                Aprobar
                                            </Button>
                                            <Button
                                                variant="outline"
                                                className="flex-1 h-14 rounded-2xl border-2 border-red-100 text-red-600 hover:bg-red-50 font-bold text-lg transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                                                onClick={() => handleAction('Rechazado')}
                                                disabled={!!actionLoading}
                                            >
                                                {actionLoading === 'Rechazado' ? <RefreshCw className="h-5 w-5 animate-spin" /> : <X className="h-5 w-5" />}
                                                Rechazar
                                            </Button>
                                        </div>
                                    )}

                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>
            </main>
        </div>
    );
}

function ModalInfoItem({ icon, label, value, subValue }: { icon: React.ReactNode, label: string, value: string | null | undefined, subValue?: string }) {
    return (
        <div className="flex items-start gap-4 group">
            <div className="mt-1 h-10 w-10 rounded-xl bg-gray-50 flex items-center justify-center text-[#254153]/40 transition-colors shadow-sm border border-transparent">
                {icon}
            </div>
            <div>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-1">{label}</p>
                <p className="text-sm font-bold text-[#254153] leading-tight">{value || 'N/A'}</p>
                {subValue && <p className="text-[10px] text-gray-400 mt-1 italic font-medium">{subValue}</p>}
            </div>
        </div>
    );
}
