"use client";

import { useEffect, useState } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { supabase } from "@/lib/supabaseClient";
import { motion } from "framer-motion";
import { Bell, Search, Menu, Filter, Download, RefreshCw, Link as LinkIcon, Check, Copy, Database } from "lucide-react";
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
    const [filterStatus, setFilterStatus] = useState<string>("todos");
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [copiedId, setCopiedId] = useState<number | null>(null);

    useEffect(() => {
        fetchInvoices();
    }, []);

    const fetchInvoices = async () => {
        try {
            setLoading(true);
            let allData: Invoice[] = [];
            let from = 0;
            const step = 1000;
            let hasMore = true;

            while (hasMore) {
                const { data, error } = await supabase
                    .from('Registro_Facturas')
                    .select('*')
                    .order('ID', { ascending: false })
                    .range(from, from + step - 1);

                if (error) {
                    console.error('Supabase error:', error);
                    throw error;
                }

                if (data && data.length > 0) {
                    allData = [...allData, ...(data as Invoice[])];
                    from += step;
                    hasMore = data.length === step;
                } else {
                    hasMore = false;
                }
            }

            setInvoices(allData);
        } catch (error) {
            console.error('Error fetching invoices:', error);
        } finally {
            setLoading(false);
        }
    };

    const syncInvoices = async () => {
        setSyncing(true);
        try {
            const res = await fetch('/api/sharepoint/sync', { method: 'POST' });
            const data = await res.json();

            if (data.success) {
                alert(data.message || 'Sincronización con SharePoint completada.');
                fetchInvoices();
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

    const filteredInvoices = invoices.filter(invoice => {
        const query = searchTerm.toLowerCase();
        const matchesSearch = !query || (
            invoice.Nro_Factura?.toLowerCase().includes(query) ||
            invoice.Proveedor?.toLowerCase().includes(query) ||
            invoice.Nit?.toLowerCase().includes(query) ||
            invoice.Responsable_de_Autorizar?.toLowerCase().includes(query)
        );

        const statusLower = filterStatus.toLowerCase();
        const matchesStatus = filterStatus === "todos" ||
            (invoice.Aprobacion_Doliente?.toLowerCase() === statusLower);

        return matchesSearch && matchesStatus;
    });

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
                                    {filteredInvoices.length} {filteredInvoices.length === 1 ? 'Factura' : 'Facturas'}
                                </span>
                            </div>
                            <p className="text-gray-500 mt-1">Sincronización bidireccional con SharePoint Online</p>
                        </div>

                        <div className="flex flex-wrap items-center gap-4">
                            <div className="flex bg-gray-100/50 p-1.5 rounded-2xl border border-gray-100 shadow-sm backdrop-blur-md">
                                {[
                                    { id: "todos", label: "Todas", color: "bg-gray-500" },
                                    { id: "Por Aprobar", label: "Pendientes", color: "bg-blue-500" },
                                    { id: "Aprobado", label: "Aprobadas", color: "bg-green-500" },
                                    { id: "Rechazado", label: "Rechazadas", color: "bg-red-500" }
                                ].map((tab) => {
                                    const count = tab.id === "todos"
                                        ? invoices.length
                                        : invoices.filter(i => i.Aprobacion_Doliente === tab.id).length;

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
                                    ) : filteredInvoices.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} className="px-6 py-12 text-center">
                                                <div className="flex flex-col items-center justify-center text-gray-400 gap-2">
                                                    <Search className="h-8 w-8 opacity-20" />
                                                    <p className="text-sm italic">No se encontraron facturas que coincidan con la búsqueda.</p>
                                                </div>
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredInvoices.map((invoice) => (
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
                                                        <Button variant="ghost" className="text-xs h-8">
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
                    </div>
                </div>
            </main>
        </div>
    );
}
