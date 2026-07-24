"use client";

import React, { useState, useEffect } from "react";
import { X, Loader2, Save, Paperclip } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabaseClient";

interface Provider {
    razon_social: string;
    numero_identificacion: string;
    responsable?: string;
}

interface NuevoRadicadoModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export function NuevoRadicadoModal({ isOpen, onClose, onSuccess }: NuevoRadicadoModalProps) {
    const [loading, setLoading] = useState(false);
    const [providers, setProviders] = useState<Provider[]>([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [isSearching, setIsSearching] = useState(false);
    const [showProviderDropdown, setShowProviderDropdown] = useState(false);
    const [file, setFile] = useState<File | null>(null);

    const [formData, setFormData] = useState({
        Nit: "",
        Proveedor: "",
        Nro_Factura: "",
        Monto: "",
        Responsable_de_Autorizar: "",
        Observaciones: "",
    });

    useEffect(() => {
        if (!isOpen) {
            setFormData({
                Nit: "",
                Proveedor: "",
                Nro_Factura: "",
                Monto: "",
                Responsable_de_Autorizar: "",
                Observaciones: "",
            });
            setSearchTerm("");
            setFile(null);
        }
    }, [isOpen]);

    useEffect(() => {
        const fetchProviders = async () => {
            if (!searchTerm || searchTerm.length < 2) {
                setProviders([]);
                return;
            }
            setIsSearching(true);
            try {
                // Consultar proveedores usando la tabla requerida
                const res = await fetch(`/api/providers/search?table=Proveedores_con_Responsable&q=${encodeURIComponent(searchTerm)}&limit=10`);
                const data = await res.json();
                setProviders(data.providers || []);
            } catch (error) {
                console.error("Error fetching providers:", error);
            } finally {
                setIsSearching(false);
            }
        };

        const timeoutId = setTimeout(() => {
            fetchProviders();
        }, 300);

        return () => clearTimeout(timeoutId);
    }, [searchTerm]);

    const selectProvider = (provider: Provider) => {
        setFormData((prev) => ({
            ...prev,
            Nit: provider.numero_identificacion,
            Proveedor: provider.razon_social,
            Responsable_de_Autorizar: provider.responsable || "",
        }));
        setSearchTerm(provider.razon_social);
        setShowProviderDropdown(false);
    };

    const isFormValid = 
        formData.Nit.trim() !== "" &&
        formData.Proveedor.trim() !== "" &&
        formData.Nro_Factura.trim() !== "" &&
        formData.Monto.toString().trim() !== "" &&
        formData.Responsable_de_Autorizar.trim() !== "" &&
        file !== null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!isFormValid) {
            alert("Por favor complete todos los campos requeridos, incluyendo el archivo adjunto.");
            return;
        }
        
        setLoading(true);

        try {
            // Check if invoice number already exists for this provider
            const { data: existingInvoice, error: checkError } = await supabase
                .from("Radicados_de_importacion")
                .select("id")
                .eq("Nit", formData.Nit)
                .eq("Nro_Factura", formData.Nro_Factura)
                .limit(1);

            if (checkError) throw checkError;

            if (existingInvoice && existingInvoice.length > 0) {
                alert(`El número de factura ${formData.Nro_Factura} ya se encuentra registrado para el proveedor con NIT ${formData.Nit}.`);
                setLoading(false);
                return;
            }

            // Fetch next Consecutivo
            const { data: lastRecord, error: fetchError } = await supabase
                .from("Radicados_de_importacion")
                .select("Consecutivo")
                .not("Consecutivo", "is", null)
                .order("Consecutivo", { ascending: false })
                .limit(1);
            
            if (fetchError) throw fetchError;

            let nextConsecutivo = "3001020";
            if (lastRecord && lastRecord.length > 0 && lastRecord[0].Consecutivo) {
                // Remove prefix if it had one before, but since requirement says starting at 3001020, it's just a number.
                const lastConsecutivoStr = lastRecord[0].Consecutivo.replace(/\D/g, ""); // Extrae solo los numeros
                const lastConsecutivoNum = parseInt(lastConsecutivoStr, 10);
                if (!isNaN(lastConsecutivoNum) && lastConsecutivoNum >= 3001020) {
                    nextConsecutivo = (lastConsecutivoNum + 1).toString();
                }
            }

            let adjuntos_url = null;
            let attachments = false;

            if (file) {
                const fileExt = file.name.split('.').pop();
                const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
                
                const { data: uploadData, error: uploadError } = await supabase.storage
                    .from("Radicados_impo_adjuntos")
                    .upload(fileName, file);

                if (uploadError) {
                    throw new Error("Error al subir el archivo: " + uploadError.message);
                }

                const { data: publicUrlData } = supabase.storage
                    .from("Radicados_impo_adjuntos")
                    .getPublicUrl(fileName);

                adjuntos_url = publicUrlData.publicUrl;
                attachments = true;
            }

            const { error } = await supabase
                .from("Radicados_de_importacion")
                .insert([{
                    Nit: formData.Nit,
                    Proveedor: formData.Proveedor,
                    Nro_Factura: formData.Nro_Factura,
                    Monto: Number(formData.Monto) || 0,
                    Responsable_de_Autorizar: formData.Responsable_de_Autorizar,
                    Consecutivo: nextConsecutivo,
                    Observaciones: formData.Observaciones,
                    Attachments: attachments,
                    adjuntos_url: adjuntos_url,
                    Aprobacion_Doliente: "Aprobado",
                    FechaAprobacion: new Date().toISOString(),
                    centro_costos: "N/A - 14650505 IMPORTACIONES GRAVADAS",
                    Gestion_Contabilidad: "Por Procesar"
                }])
                .select();

            if (error) throw error;
            
            // Trigger automatic SAP Sync
            if (insertedData && insertedData[0]) {
                try {
                    console.log("Triggering auto SAP sync for Radicado:", insertedData[0].id);
                    await fetch("/api/sap/manual-draft", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ 
                            invoiceId: insertedData[0].id,
                            source: "Radicados_de_importacion"
                        }),
                    });
                } catch (sapErr) {
                    console.error("Auto SAP sync error:", sapErr);
                    // Silently fail or alert user?
                    // We let it fail silently here to not block the success message,
                    // or we could show a warning. The SAP button exists for manual retry.
                }
            }
            
            onSuccess();
            onClose();
        } catch (error) {
            console.error("Error inserting data:", error);
            alert("Ocurrió un error al guardar el radicado.");
        } finally {
            setLoading(false);
        }
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
                        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
                            <h2 className="text-xl font-bold text-[#254153]">Nuevo Radicado de Importación</h2>
                            <button
                                onClick={onClose}
                                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-xl transition-colors"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        {/* Form */}
                        <form id="radicado-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5 custom-scrollbar">
                            
                            {/* Proveedor Search */}
                            <div className="space-y-1.5 relative">
                                <label className="text-sm font-semibold text-gray-700">Proveedor</label>
                                <input
                                    type="text"
                                    required
                                    value={searchTerm}
                                    onChange={(e) => {
                                        setSearchTerm(e.target.value);
                                        setShowProviderDropdown(true);
                                    }}
                                    onFocus={() => setShowProviderDropdown(true)}
                                    placeholder="Buscar por NIT o Razón Social..."
                                    className="w-full h-11 px-4 rounded-xl border border-gray-200 focus:border-[#254153] focus:ring-1 focus:ring-[#254153] outline-none transition-all text-sm"
                                />
                                {showProviderDropdown && searchTerm.length >= 2 && (
                                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-100 rounded-xl shadow-lg max-h-60 overflow-y-auto">
                                        {isSearching ? (
                                            <div className="p-4 text-center text-sm text-gray-500">Buscando...</div>
                                        ) : providers.length > 0 ? (
                                            providers.map((p, i) => (
                                                <div
                                                    key={i}
                                                    onClick={() => selectProvider(p)}
                                                    className="px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-50 last:border-0"
                                                >
                                                    <div className="font-semibold text-sm text-gray-800">{p.razon_social}</div>
                                                    <div className="text-xs text-gray-500 font-mono mt-0.5">NIT: {p.numero_identificacion}</div>
                                                </div>
                                            ))
                                        ) : (
                                            <div className="p-4 text-center text-sm text-gray-500">No se encontraron resultados</div>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-sm font-semibold text-gray-700">NIT Seleccionado</label>
                                <input
                                    type="text"
                                    readOnly
                                    value={formData.Nit}
                                    className="w-full h-11 px-4 rounded-xl border border-gray-200 bg-gray-50 text-gray-500 outline-none text-sm font-mono"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-sm font-semibold text-gray-700">Nro. Factura</label>
                                    <input
                                        type="text"
                                        required
                                        value={formData.Nro_Factura}
                                        onChange={(e) => setFormData({ ...formData, Nro_Factura: e.target.value })}
                                        className="w-full h-11 px-4 rounded-xl border border-gray-200 focus:border-[#254153] focus:ring-1 focus:ring-[#254153] outline-none transition-all text-sm"
                                        placeholder="Número de factura"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-sm font-semibold text-gray-700">Valor Total</label>
                                    <div className="relative">
                                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold text-xs">USD</span>
                                        <input
                                            type="number"
                                            step="0.01"
                                            required
                                            value={formData.Monto}
                                            onChange={(e) => setFormData({ ...formData, Monto: e.target.value })}
                                            className="w-full h-11 pl-12 pr-4 rounded-xl border border-gray-200 focus:border-[#254153] focus:ring-1 focus:ring-[#254153] outline-none transition-all text-sm font-mono"
                                            placeholder="0.00"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-sm font-semibold text-gray-700">Responsable de Autorizar</label>
                                <input
                                    type="text"
                                    required
                                    value={formData.Responsable_de_Autorizar}
                                    onChange={(e) => setFormData({ ...formData, Responsable_de_Autorizar: e.target.value })}
                                    className="w-full h-11 px-4 rounded-xl border border-gray-200 focus:border-[#254153] focus:ring-1 focus:ring-[#254153] outline-none transition-all text-sm"
                                    placeholder="Nombre del responsable"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-sm font-semibold text-gray-700">Observaciones</label>
                                <textarea
                                    rows={3}
                                    value={formData.Observaciones}
                                    onChange={(e) => setFormData({ ...formData, Observaciones: e.target.value })}
                                    className="w-full p-4 rounded-xl border border-gray-200 focus:border-[#254153] focus:ring-1 focus:ring-[#254153] outline-none transition-all text-sm resize-none custom-scrollbar"
                                    placeholder="Agregar observaciones adicionales..."
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-sm font-semibold text-gray-700">Adjuntar Archivo *</label>
                                <div className="relative">
                                    <input
                                        type="file"
                                        id="file-upload"
                                        className="hidden"
                                        onChange={(e) => setFile(e.target.files ? e.target.files[0] : null)}
                                    />
                                    <label
                                        htmlFor="file-upload"
                                        className={`flex items-center justify-between w-full h-11 px-4 rounded-xl border border-gray-200 focus-within:border-[#254153] focus-within:ring-1 focus-within:ring-[#254153] outline-none transition-all text-sm cursor-pointer ${
                                            file ? 'bg-blue-50/50 border-blue-200' : 'bg-gray-50/50 hover:bg-gray-50'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2 overflow-hidden">
                                            <Paperclip className={`h-4 w-4 shrink-0 ${file ? 'text-blue-500' : 'text-gray-400'}`} />
                                            <span className={`truncate ${file ? 'text-blue-700 font-medium' : 'text-gray-500'}`}>
                                                {file ? file.name : "Seleccionar archivo..."}
                                            </span>
                                        </div>
                                        {file && (
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    setFile(null);
                                                }}
                                                className="p-1 hover:bg-blue-100 rounded-full transition-colors text-blue-500 shrink-0"
                                            >
                                                <X className="h-4 w-4" />
                                            </button>
                                        )}
                                    </label>
                                </div>
                            </div>

                        </form>

                        {/* Footer */}
                        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 shrink-0 flex items-center justify-end gap-3">
                            <button
                                type="button"
                                onClick={onClose}
                                disabled={loading}
                                className="px-5 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-200 bg-gray-100 rounded-xl transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                form="radicado-form"
                                disabled={loading || !isFormValid}
                                className="px-5 py-2.5 text-sm font-bold text-white bg-[#254153] hover:bg-[#1a2e3b] rounded-xl transition-all shadow-sm hover:shadow flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Guardando...
                                    </>
                                ) : (
                                    <>
                                        <Save className="h-4 w-4" />
                                        Guardar Radicado
                                    </>
                                )}
                            </button>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
