"use client";

import React from "react";
import { X, Search, Paperclip, Ship, Calendar, User, Hash, DollarSign, CheckCircle, Save, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/context/AuthContext";

interface DetalleRadicadoModalProps {
    isOpen: boolean;
    onClose: () => void;
    data: any;
    onSuccess?: () => void;
}

export function DetalleRadicadoModal({ isOpen, onClose, data, onSuccess }: DetalleRadicadoModalProps) {
    const { user } = useAuth();
    const [estado, setEstado] = React.useState("");
    const [gestionContabilidad, setGestionContabilidad] = React.useState("");
    const [observaciones, setObservaciones] = React.useState("");

    const getProcesadoPorName = (email?: string) => {
        if (!email) return "Desconocido";
        const e = email.toLowerCase();
        if (e.includes("mateo.benavides")) return "Mateo Benavides Rios";
        if (e.includes("duvan.ramirez")) return "Duvan Esteban Ramirez Rua";
        if (e.includes("practicontabilidad")) return "Jesús Angel Villalobos Rincon";
        return email;
    };

    React.useEffect(() => {
        if (data) {
            setEstado(data.Aprobacion_Doliente || "Pendiente");
            setGestionContabilidad((data.Gestion_Contabilidad && data.Gestion_Contabilidad !== "Pendiente") ? data.Gestion_Contabilidad : "Por Procesar");
            setObservaciones(data.Observaciones || "");
        }
    }, [data, isOpen]);

    const handleUpdateField = async (field: string, value: string) => {
        if (!data) return;
        try {
            const updatePayload: any = { [field]: value };
            if (field === 'Gestion_Contabilidad' && value === 'Procesado') {
                updatePayload.FechaProcesado = new Date().toISOString();
            }

            const { error } = await supabase
                .from('Radicados_de_importacion')
                .update(updatePayload)
                .eq('id', data.id);

            if (error) throw error;
            if (onSuccess) onSuccess();
        } catch (error) {
            console.error(`Error updating ${field}:`, error);
            alert("Ocurrió un error al guardar los cambios.");
        }
    };

    if (!data) return null;

    const formatCurrency = (value: any) => {
        if (!value) return "USD $0";
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 2
        }).format(Number(value));
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
                        onClick={onClose}
                    />
                    <motion.div
                        initial={{ opacity: 0, x: "100%" }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: "100%" }}
                        transition={{ type: "spring", damping: 25, stiffness: 200 }}
                        className="fixed right-0 top-0 bottom-0 w-full max-w-lg bg-white shadow-2xl z-50 flex flex-col"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0 bg-[#254153] text-white">
                            <div className="flex items-center gap-3">
                                <Ship className="h-5 w-5 opacity-80" />
                                <div>
                                    <h2 className="text-lg font-bold">Detalle Radicado</h2>
                                    <p className="text-xs font-medium text-white/70">Ref: {data.id}</p>
                                </div>
                            </div>
                            <button
                                onClick={onClose}
                                className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-gray-50/30">
                            
                            {/* Proveedor Section */}
                            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-4">
                                <div className="flex items-center gap-2 border-b border-gray-50 pb-2">
                                    <User className="h-4 w-4 text-gray-400" />
                                    <h3 className="text-sm font-bold text-gray-700">Información del Proveedor</h3>
                                </div>
                                <div className="grid grid-cols-1 gap-4">
                                    <div>
                                        <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-1">Razón Social</p>
                                        <p className="text-sm font-bold text-gray-800">{data.Proveedor || "N/A"}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-1">NIT</p>
                                        <p className="text-sm font-mono text-gray-600">{data.Nit || "N/A"}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Detalles Financieros */}
                            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-4">
                                <div className="flex items-center gap-2 border-b border-gray-50 pb-2">
                                    <DollarSign className="h-4 w-4 text-gray-400" />
                                    <h3 className="text-sm font-bold text-gray-700">Detalles Financieros</h3>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-1">Nro. Factura</p>
                                        <p className="text-sm font-bold text-gray-800">{data.Nro_Factura || "N/A"}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-1">Valor Total</p>
                                        <p className="text-lg font-black text-[#254153]">{formatCurrency(data.Monto)}</p>
                                    </div>
                                    <div className="col-span-2">
                                        <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-1">Responsable de Autorizar</p>
                                        <p className="text-sm font-medium text-gray-700">{data.Responsable_de_Autorizar || "N/A"}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Fechas y Estados */}
                            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-4">
                                <div className="flex items-center justify-between border-b border-gray-50 pb-2">
                                    <div className="flex items-center gap-2">
                                        <Calendar className="h-4 w-4 text-gray-400" />
                                        <h3 className="text-sm font-bold text-gray-700">Fechas y Estados</h3>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-1">Estado</p>
                                        <select 
                                            value={estado}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                setEstado(val);
                                                handleUpdateField("Aprobacion_Doliente", val);
                                            }}
                                            className="w-full text-xs p-1.5 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 focus:ring-1 focus:ring-[#254153] outline-none font-bold text-gray-700 cursor-pointer transition-colors"
                                        >
                                            <option value="Aprobado">Aprobado</option>
                                            <option value="Rechazado">Rechazado</option>
                                        </select>
                                    </div>
                                    <div>
                                        <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-1">Gestión Contabilidad</p>
                                        <select 
                                            value={gestionContabilidad}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                setGestionContabilidad(val);
                                                if (val === 'Procesado') {
                                                    const procesadoPor = getProcesadoPorName(user?.email);
                                                    handleUpdateField("ProcesadoPor", procesadoPor).then(() => {
                                                        handleUpdateField("Gestion_Contabilidad", val);
                                                    });
                                                } else {
                                                    handleUpdateField("Gestion_Contabilidad", val);
                                                }
                                            }}
                                            className="w-full text-xs p-1.5 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 focus:ring-1 focus:ring-[#254153] outline-none font-bold text-gray-700 cursor-pointer transition-colors"
                                        >
                                            <option value="Por Procesar">Por Procesar</option>
                                            <option value="Procesado">Procesado</option>
                                        </select>
                                    </div>
                                    <div>
                                        <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-1">Consecutivo</p>
                                        <p className="text-sm font-bold text-gray-700">{data.Consecutivo || "N/A"}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-1">Fecha Creación</p>
                                        <p className="text-sm font-medium text-gray-600">{data.Created ? new Date(data.Created).toLocaleString() : "Sin fecha"}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-1">C. Costos / Cuenta</p>
                                        <p className="text-sm font-medium text-gray-600">{data.centro_costos || "N/A"}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Observaciones */}
                            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-4">
                                <h3 className="text-sm font-bold text-gray-700">Observaciones</h3>
                                <textarea
                                    value={observaciones}
                                    onChange={(e) => setObservaciones(e.target.value)}
                                    onBlur={(e) => {
                                        if (e.target.value !== (data.Observaciones || "")) {
                                            handleUpdateField("Observaciones", e.target.value);
                                        }
                                    }}
                                    className="w-full p-4 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white hover:bg-gray-100 focus:hover:bg-white focus:border-[#254153] focus:ring-1 focus:ring-[#254153] outline-none transition-all text-sm resize-none custom-scrollbar min-h-[80px]"
                                    placeholder="Sin observaciones adicionales..."
                                />
                            </div>

                            {/* Adjunto */}
                            {data.Attachments && data.adjuntos_url && (
                                <div className="bg-blue-50/50 border border-blue-100 p-5 rounded-2xl">
                                    <h3 className="text-sm font-bold text-blue-800 mb-3 flex items-center gap-2">
                                        <Paperclip className="h-4 w-4" />
                                        Documento Adjunto
                                    </h3>
                                    <a 
                                        href={`/api/externo/radicado/${data.id}/download`} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-blue-200 text-blue-600 rounded-xl text-sm font-bold shadow-sm hover:bg-blue-50 hover:shadow transition-all w-full justify-center"
                                    >
                                        <Search className="h-4 w-4" />
                                        Ver / Descargar Archivo
                                    </a>
                                </div>
                            )}

                        </div>

                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
