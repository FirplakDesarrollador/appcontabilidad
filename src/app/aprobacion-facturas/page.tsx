"use client";

import { useEffect, useState } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { supabase } from "@/lib/supabaseClient";
import { motion } from "framer-motion";
import { Bell, Search, Menu, Filter, Download, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";

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
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);

    useEffect(() => {
        fetchInvoices();
    }, []);

    const fetchInvoices = async () => {
        try {
            console.log("Fetching invoices from 'Registro_Facturas'...");
            const { data, error } = await supabase
                .from('Registro_Facturas')
                .select('*')
                .order('ID', { ascending: false });

            console.log("Supabase response:", { data, error });

            if (error) {
                console.error('Supabase error:', error);
                throw error;
            }
            if (data) {
                console.log(`Fetched ${data.length} invoices.`);
                setInvoices(data as Invoice[]);
            }
        } catch (error) {
            console.error('Error fetching invoices:', error);
        } finally {
            setLoading(false);
        }
    };

    const syncInvoices = async () => {
        setSyncing(true);
        try {
            const res = await fetch('/api/sync-invoices', { method: 'POST' });
            const data = await res.json();

            if (data.success) {
                alert(`Sincronización completada.\nProcesadas: ${data.results.processed}\nNuevas: ${data.results.processed}`);
                fetchInvoices();
            } else {
                alert('Error al sincronizar: ' + (data.error || 'Error desconocido'));
            }
        } catch (error) {
            console.error('Sync error:', error);
            alert('Error de conexión con el servidor.');
        } finally {
            syncing && setSyncing(false);
        }
    };

    const getStatusColor = (status: string | null) => {
        if (!status) return 'bg-yellow-100 text-yellow-700 border-yellow-200';
        const s = status.toLowerCase();
        if (s.includes('aprobado') || s.includes('procesado')) return 'bg-green-100 text-green-700 border-green-200';
        if (s.includes('rechazado') || s.includes('anulado')) return 'bg-red-100 text-red-700 border-red-200';
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
                                placeholder="Buscar factura..."
                                className="h-10 pl-10 pr-4 rounded-full bg-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-[#254153]/20 w-64"
                            />
                        </div>
                        <button className="h-10 w-10 flex items-center justify-center rounded-full hover:bg-gray-100 relative">
                            <Bell className="h-5 w-5 text-gray-600" />
                        </button>
                    </div>
                </header>

                <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-6">
                    <div className="flex justify-between items-center">
                        <div>
                            <h1 className="text-3xl font-bold text-[#254153]">Gestión de Facturas</h1>
                            <p className="text-gray-500 mt-1">Revisa y aprueba las facturas de proveedores registrados en Registro_Facturas</p>
                        </div>
                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                className="bg-white text-[#254153] border-[#254153]/20 hover:bg-[#254153]/5"
                                onClick={syncInvoices}
                                disabled={syncing}
                            >
                                <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
                                {syncing ? 'Sincronizando...' : 'Sincronizar Facturas'}
                            </Button>
                            <Button variant="outline" className="bg-white">
                                <Filter className="mr-2 h-4 w-4" /> Filtros
                            </Button>
                            <Button variant="outline" className="bg-white">
                                <Download className="mr-2 h-4 w-4" /> Exportar
                            </Button>
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
                                                <td className="px-6 py-4"><div className="h-6 bg-gray-200 rounded-full w-24"></div></td>
                                                <td className="px-6 py-4"></td>
                                            </tr>
                                        ))
                                    ) : invoices.length === 0 ? (
                                        <tr>
                                            <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                                                No hay facturas registradas en la tabla Registro_Facturas.
                                            </td>
                                        </tr>
                                    ) : (
                                        invoices.map((invoice) => (
                                            <tr key={invoice.ID} className="hover:bg-gray-50/50 transition-colors">
                                                <td className="px-6 py-4 font-medium text-[#254153]">
                                                    {invoice.Nro_Factura || 'S/N'}
                                                    <div className="text-[10px] text-gray-400 font-normal">ID: {invoice.ID}</div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="text-sm font-medium text-gray-900">{invoice.Proveedor || 'N/A'}</div>
                                                    <div className="text-xs text-gray-500">NIT: {invoice.Nit || 'N/A'}</div>
                                                </td>
                                                <td className="px-6 py-4 text-gray-500 text-sm">
                                                    {invoice.FechaAprobacion || invoice.Creado || 'N/A'}
                                                </td>
                                                <td className="px-6 py-4 font-semibold text-gray-900">
                                                    {formatCurrency(invoice["Valor total"])}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(invoice.Gestion_Contabilidad)}`}>
                                                        {getStatusLabel(invoice.Gestion_Contabilidad)}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <Button variant="ghost" className="text-xs h-8">
                                                        Ver Detalles
                                                    </Button>
                                                </td>
                                            </tr>
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
