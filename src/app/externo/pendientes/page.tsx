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
    Inbox
} from "lucide-react";
import { Button } from "@/components/ui/Button";

interface Invoice {
    id: string;
    proveedor: string;
    nit: string;
    valorTotal: string;
    nroFactura: string;
    fechaRegistro: string;
    aprobacionDoliente: string;
    responsableActual: string;
}

function PendientesList() {
    const searchParams = useSearchParams();
    const responsable = searchParams.get("responsable");
    
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

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
                setInvoices(data.items || []);
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
                <p className="text-gray-500 font-medium tracking-tight">Cargando tus facturas pendientes...</p>
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
                <div className="bg-green-50 h-24 w-24 rounded-full flex items-center justify-center mb-8">
                    <CheckCircle2 className="h-12 w-12 text-green-500" />
                </div>
                <h2 className="text-3xl font-black text-[#254153] mb-4">¡Todo en orden!</h2>
                <p className="text-gray-500 max-w-sm text-lg font-medium">
                    Está al día con las facturas. No tiene pendientes por aprobar en este momento.
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

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between px-4 mb-2">
                <h2 className="text-lg font-bold text-[#254153] flex items-center gap-2">
                    <Inbox className="h-5 w-5 text-blue-500" />
                    Tienes {invoices.length} {invoices.length === 1 ? 'factura pendiente' : 'facturas pendientes'}
                </h2>
            </div>
            
            <div className="grid grid-cols-1 gap-4">
                {invoices.map((inv, idx) => (
                    <motion.div
                        key={inv.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.05 }}
                        className="bg-white p-6 rounded-[28px] shadow-md border border-gray-100 hover:shadow-xl hover:border-blue-100 transition-all group flex flex-col md:flex-row md:items-center gap-6"
                    >
                        <div className="h-16 w-16 rounded-2xl bg-blue-50 flex items-center justify-center flex-shrink-0 group-hover:bg-[#254153] transition-all duration-300">
                            <FileText className="h-8 w-8 text-blue-500 group-hover:text-white transition-all" />
                        </div>
                        
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-3 mb-1">
                                <h3 className="text-lg font-bold text-gray-900 truncate">{inv.proveedor}</h3>
                                <span className="px-3 py-1 bg-gray-50 text-[10px] font-black uppercase text-gray-400 rounded-lg group-hover:bg-blue-50 group-hover:text-blue-600 transition-all">
                                    FACTURA: {inv.nroFactura}
                                </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-gray-500 font-medium">
                                <div className="flex items-center gap-2">
                                    <DollarSign className="h-4 w-4 text-emerald-500" />
                                    <span className="font-bold text-[#254153]">{formatCurrency(inv.valorTotal)}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Calendar className="h-4 w-4 text-blue-400" />
                                    <span>{inv.fechaRegistro ? new Date(inv.fechaRegistro).toLocaleDateString() : 'N/A'}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <User className="h-4 w-4 text-amber-400" />
                                    <span className="text-xs uppercase tracking-tight">{inv.responsableActual}</span>
                                </div>
                            </div>
                        </div>

                        <a 
                            href={`/externo/factura/${inv.id}`}
                            className="inline-flex items-center justify-center gap-2 bg-[#254153]/5 hover:bg-[#254153] text-[#254153] hover:text-white px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all active:scale-95 group/btn border border-[#254153]/5 h-fit shadow-sm hover:shadow-lg shadow-[#254153]/10"
                        >
                            Ver y Aprobar
                            <ChevronRight className="h-4 w-4 transform group-hover/btn:translate-x-1 transition-all" />
                        </a>
                    </motion.div>
                ))}
            </div>
        </div>
    );
}

export default function PendientesPage() {
    return (
        <div className="min-h-screen bg-[#f8fafc] p-6 lg:p-12">
            <div className="max-w-[1000px] mx-auto space-y-12">
                <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                    <div className="space-y-2">
                        <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-[10px] font-black uppercase tracking-widest mb-2 border border-blue-100">
                            Sistema de Gestión
                        </div>
                        <h1 className="text-4xl font-black text-[#254153] tracking-tight">Facturas por Aprobar</h1>
                        <p className="text-gray-500 font-medium">Revisa las facturas pendientes asignadas a tu centro de costo.</p>
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
