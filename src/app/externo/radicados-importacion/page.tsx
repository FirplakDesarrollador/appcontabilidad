"use client";

import React, { useState, useEffect } from "react";
import { X, Loader2, Save, Paperclip, Ship } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

interface Provider {
    razon_social: string;
    numero_identificacion: string;
    responsable?: string;
}

export default function ExternoRadicadoImportacionPage() {
    const [loading, setLoading] = useState(false);
    const [providers, setProviders] = useState<Provider[]>([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [isSearching, setIsSearching] = useState(false);
    const [showProviderDropdown, setShowProviderDropdown] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    const [invoiceError, setInvoiceError] = useState<string | null>(null);
    const [isValidatingInvoice, setIsValidatingInvoice] = useState(false);

    const [formData, setFormData] = useState({
        Nit: "",
        Proveedor: "",
        Nro_Factura: "",
        Monto: "",
        Responsable_de_Autorizar: "",
        Observaciones: "",
    });

    useEffect(() => {
        const fetchProviders = async () => {
            if (!searchTerm || searchTerm.length < 2) {
                setProviders([]);
                return;
            }
            setIsSearching(true);
            try {
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

    useEffect(() => {
        const validateInvoice = async () => {
            if (!formData.Nro_Factura || !formData.Nit) {
                setInvoiceError(null);
                return;
            }
            
            setIsValidatingInvoice(true);
            try {
                const { data, error } = await supabase
                    .from("Radicados_de_importacion")
                    .select("id")
                    .eq("Nit", formData.Nit)
                    .eq("Nro_Factura", formData.Nro_Factura)
                    .limit(1);
                    
                if (error) throw error;
                
                if (data && data.length > 0) {
                    setInvoiceError("Este número de factura ya está registrado para el proveedor.");
                } else {
                    setInvoiceError(null);
                }
            } catch (err) {
                console.error("Error validating invoice:", err);
            } finally {
                setIsValidatingInvoice(false);
            }
        };

        const timeoutId = setTimeout(() => {
            validateInvoice();
        }, 500);

        return () => clearTimeout(timeoutId);
    }, [formData.Nro_Factura, formData.Nit]);

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
        file !== null &&
        invoiceError === null;

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

            const { data: lastRecord, error: fetchError } = await supabase
                .from("Radicados_de_importacion")
                .select("Consecutivo")
                .not("Consecutivo", "is", null)
                .order("Consecutivo", { ascending: false })
                .limit(1);
            
            if (fetchError) throw fetchError;

            let nextConsecutivo = "3001020";
            if (lastRecord && lastRecord.length > 0 && lastRecord[0].Consecutivo) {
                const lastConsecutivoStr = lastRecord[0].Consecutivo.replace(/\D/g, "");
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

            const { data: insertedData, error } = await supabase
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
                }
            }
            
            alert("Radicado creado exitosamente.");
            window.location.reload();
        } catch (error) {
            console.error("Error inserting data:", error);
            alert("Ocurrió un error al guardar el radicado.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
            <div className="w-full max-w-2xl bg-white shadow-xl rounded-2xl overflow-hidden border border-gray-100 flex flex-col">
                <div className="bg-[#254153] p-6 text-white flex items-center gap-4 shrink-0">
                    <div className="h-12 w-12 bg-white/10 rounded-xl flex items-center justify-center">
                        <Ship className="h-6 w-6 text-white" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-bold tracking-tight">Radicación de Importación</h2>
                        <p className="text-blue-100/80 text-sm mt-0.5">Complete el formulario para crear un nuevo radicado</p>
                    </div>
                </div>

                <form id="radicado-form" onSubmit={handleSubmit} className="p-8 space-y-6">
                    <div className="space-y-2 relative">
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

                    <div className="space-y-2">
                        <label className="text-sm font-semibold text-gray-700">NIT Seleccionado</label>
                        <input
                            type="text"
                            readOnly
                            value={formData.Nit}
                            className="w-full h-11 px-4 rounded-xl border border-gray-200 bg-gray-50 text-gray-500 outline-none text-sm font-mono"
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="text-sm font-semibold text-gray-700">Nro. Factura</label>
                            <input
                                type="text"
                                required
                                value={formData.Nro_Factura}
                                onChange={(e) => setFormData({ ...formData, Nro_Factura: e.target.value })}
                                className={`w-full h-11 px-4 rounded-xl border outline-none transition-all text-sm ${
                                    invoiceError 
                                    ? 'border-red-500 focus:border-red-500 focus:ring-1 focus:ring-red-500' 
                                    : 'border-gray-200 focus:border-[#254153] focus:ring-1 focus:ring-[#254153]'
                                }`}
                                placeholder="Número de factura"
                            />
                            {isValidatingInvoice && <p className="text-xs text-gray-500 mt-1">Validando factura...</p>}
                            {invoiceError && <p className="text-xs text-red-500 mt-1">{invoiceError}</p>}
                        </div>
                        <div className="space-y-2">
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

                    <div className="space-y-2">
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

                    <div className="space-y-2">
                        <label className="text-sm font-semibold text-gray-700">Observaciones</label>
                        <textarea
                            rows={3}
                            value={formData.Observaciones}
                            onChange={(e) => setFormData({ ...formData, Observaciones: e.target.value })}
                            className="w-full p-4 rounded-xl border border-gray-200 focus:border-[#254153] focus:ring-1 focus:ring-[#254153] outline-none transition-all text-sm resize-none"
                            placeholder="Agregar observaciones adicionales..."
                        />
                    </div>

                    <div className="space-y-2">
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
                                className={`flex items-center justify-between w-full h-11 px-4 rounded-xl border border-gray-200 focus-within:border-[#254153] outline-none transition-all text-sm cursor-pointer ${
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

                <div className="px-8 py-5 border-t border-gray-100 bg-gray-50 flex items-center justify-end">
                    <button
                        type="submit"
                        form="radicado-form"
                        disabled={loading || !isFormValid}
                        className="px-6 py-3 text-sm font-bold text-white bg-[#254153] hover:bg-[#1a2e3b] rounded-xl transition-all shadow hover:shadow-md flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed w-full sm:w-auto justify-center"
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
            </div>
        </div>
    );
}
