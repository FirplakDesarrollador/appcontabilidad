"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle, XCircle, FileText, Calendar, Hash, User, DollarSign, Loader2, Landmark } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface Invoice {
    ID: number;
    Nit: string | null;
    Proveedor: string | null;
    Nro_Factura: string | null;
    FechaAprobacion: string | null;
    "Valor total": string | null;
    Creado: string | null;
    Gestion_Contabilidad: string | null;
    Responsable_de_Autorizar: string | null;
}

export default function PublicApprovalPage() {
    const { id } = useParams();
    const [invoice, setInvoice] = useState<Invoice | null>(null);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [status, setStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);

    useEffect(() => {
        if (id) fetchInvoice();
    }, [id]);

    const fetchInvoice = async () => {
        try {
            const { data, error } = await supabase
                .from('Registro_Facturas')
                .select('*')
                .eq('ID', id)
                .single();

            if (error) throw error;
            setInvoice(data as Invoice);
        } catch (error) {
            console.error('Error fetching invoice:', error);
            setStatus({ type: 'error', message: 'No se pudo encontrar la factura o el enlace ha caducado.' });
        } finally {
            setLoading(false);
        }
    };

    const handleAction = async (action: 'Aprobado' | 'Rechazado') => {
        setActionLoading(action);
        try {
            const res = await fetch('/api/public-action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, action }),
            });

            const data = await res.json();
            if (data.success) {
                setStatus({
                    type: 'success',
                    message: `Factura ${action === 'Aprobado' ? 'aprobada' : 'rechazada'} exitosamente.`
                });
                setInvoice(prev => prev ? { ...prev, Gestion_Contabilidad: action } : null);
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

    const formatCurrency = (value: string | null) => {
        if (!value) return '$0.00';
        const numericValue = parseFloat(value.replace(/[^\d.,]/g, '').replace(',', '.'));
        if (isNaN(numericValue)) return value;
        return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' }).format(numericValue);
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-[#f8fafc] flex flex-col items-center justify-center p-6 text-center">
                <Loader2 className="h-10 w-10 text-[#254153] animate-spin mb-4" />
                <p className="text-gray-500 font-medium italic">Cargando detalles de la factura...</p>
            </div>
        );
    }

    if (status && status.type === 'error' && !invoice) {
        return (
            <div className="min-h-screen bg-[#f8fafc] flex flex-col items-center justify-center p-6 text-center">
                <div className="bg-white p-10 rounded-3xl shadow-xl shadow-slate-200/50 max-w-md w-full border border-gray-100">
                    <XCircle className="h-16 w-16 text-red-500 mx-auto mb-6" />
                    <h2 className="text-2xl font-bold text-[#254153] mb-4">¡Ups! Algo salió mal</h2>
                    <p className="text-gray-500 mb-8 leading-relaxed">{status.message}</p>
                    <div className="h-1 w-20 bg-gray-100 mx-auto rounded-full" />
                </div>
            </div>
        );
    }

    const isProcessed = invoice?.Gestion_Contabilidad === 'Aprobado' || invoice?.Gestion_Contabilidad === 'Rechazado';

    return (
        <div className="min-h-screen bg-[#f8fafc] flex flex-col items-center justify-center p-4 md:p-10">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-[2.5rem] shadow-2xl shadow-slate-200/60 border border-white overflow-hidden max-w-2xl w-full"
            >
                {/* Header Decoration */}
                <div className="h-3 bg-gradient-to-r from-[#254153] to-[#4a6b8a]" />

                <div className="p-8 md:p-12">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-12">
                        <div>
                            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#254153]/5 text-[#254153] text-[10px] font-bold uppercase tracking-wider mb-3">
                                <FileText className="h-3 w-3" /> Revisión de Factura
                            </div>
                            <h1 className="text-3xl md:text-4xl font-extrabold text-[#254153] tracking-tight">
                                {invoice?.Nro_Factura || 'S/N'}
                            </h1>
                        </div>
                        <div className="text-right">
                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-1">Monto Total</p>
                            <p className="text-3xl font-black text-[#254153] font-mono tracking-tighter">
                                {formatCurrency(invoice?.["Valor total"] || '0')}
                            </p>
                        </div>
                    </div>

                    <AnimatePresence mode="wait">
                        {status?.type === 'success' ? (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="bg-green-50/50 border border-green-100 rounded-3xl p-8 mb-10 text-center"
                            >
                                <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
                                <h3 className="text-xl font-bold text-green-800 mb-2">¡Completado!</h3>
                                <p className="text-green-700/80 font-medium">{status.message}</p>
                            </motion.div>
                        ) : isProcessed ? (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className={`rounded-3xl p-8 mb-10 text-center border ${invoice?.Gestion_Contabilidad === 'Aprobado'
                                        ? 'bg-blue-50/50 border-blue-100 text-blue-800'
                                        : 'bg-red-50/50 border-red-100 text-red-800'
                                    }`}
                            >
                                <div className="h-12 w-12 rounded-full flex items-center justify-center mx-auto mb-4 bg-white shadow-sm">
                                    {invoice?.Gestion_Contabilidad === 'Aprobado' ? <CheckCircle className="h-6 w-6 text-green-500" /> : <XCircle className="h-6 w-6 text-red-500" />}
                                </div>
                                <h3 className="text-xl font-bold mb-2 uppercase tracking-wide">
                                    Factura {invoice?.Gestion_Contabilidad}
                                </h3>
                                <p className="opacity-70 font-medium italic">Esta factura ya ha sido procesada previamente.</p>
                            </motion.div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8 mb-12">
                                <InfoItem icon={<User />} label="Proveedor" value={invoice?.Proveedor} />
                                <InfoItem icon={<Landmark />} label="NIT" value={invoice?.Nit} />
                                <InfoItem icon={<Calendar />} label="Fecha de Aprobación" value={invoice?.FechaAprobacion || invoice?.Creado} />
                                <InfoItem icon={<Hash />} label="ID de Registro" value={invoice?.ID.toString()} />
                                <div className="col-span-full pt-4 border-t border-gray-50">
                                    <InfoItem icon={<User />} label="Responsable" value={invoice?.Responsable_de_Autorizar} subValue="Autoridad asignada para esta gestión" />
                                </div>
                            </div>
                        )}
                    </AnimatePresence>

                    {!isProcessed && !status && (
                        <div className="flex flex-col sm:flex-row gap-4">
                            <Button
                                className="flex-1 h-14 rounded-2xl bg-[#254153] hover:bg-[#1a2e3b] text-white font-bold text-lg shadow-lg shadow-[#254153]/20 transition-all hover:-translate-y-1 active:scale-[0.98] group"
                                onClick={() => handleAction('Aprobado')}
                                disabled={!!actionLoading}
                            >
                                {actionLoading === 'Aprobado' ? (
                                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                ) : (
                                    <CheckCircle className="mr-2 h-5 w-5 opacity-70 group-hover:scale-110 transition-transform" />
                                )}
                                Aprobar Factura
                            </Button>
                            <Button
                                variant="outline"
                                className="flex-1 h-14 rounded-2xl border-2 border-red-100 text-red-600 hover:bg-red-50 font-bold text-lg transition-all hover:-translate-y-1 active:scale-[0.98] group"
                                onClick={() => handleAction('Rechazado')}
                                disabled={!!actionLoading}
                            >
                                {actionLoading === 'Rechazado' ? (
                                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                ) : (
                                    <XCircle className="mr-2 h-5 w-5 opacity-70 group-hover:scale-110 transition-transform" />
                                )}
                                Rechazar
                            </Button>
                        </div>
                    )}
                </div>

                {/* Footer Info */}
                <div className="bg-[#f8fafc] px-12 py-6 border-t border-gray-100 flex justify-between items-center">
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Financial App Internal Review</p>
                    <div className="flex gap-2">
                        <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                        <div className="h-1.5 w-1.5 rounded-full bg-gray-200" />
                    </div>
                </div>
            </motion.div>
        </div>
    );
}

function InfoItem({ icon, label, value, subValue }: { icon: React.ReactNode, label: string, value: string | null | undefined, subValue?: string }) {
    return (
        <div className="flex items-start gap-4 group">
            <div className="mt-1 h-10 w-10 rounded-xl bg-gray-50 flex items-center justify-center text-[#254153]/40 group-hover:bg-[#254153]/5 group-hover:text-[#254153] transition-colors shadow-sm border border-transparent group-hover:border-[#254153]/10">
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
