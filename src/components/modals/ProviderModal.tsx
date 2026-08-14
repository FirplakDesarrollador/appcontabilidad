"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, User, Building2, Mail, Phone, Hash, ShieldCheck, Bell, Loader2, Check, Search, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Switch";

export interface ProviderItem {
    id?: number;
    source?: 'firplak' | 'viventta';
    nit: string;
    codigo_sn?: string;
    razon_social: string;
    responsable?: string;
    autorizador?: string;
    correo?: string;
    telefono?: string;
    notificar?: string | boolean;
    modificado?: string | null;
    modificado_por?: string | null;
    creado?: string | null;
}

interface ProviderModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSaveSuccess: () => void;
    providerToEdit?: ProviderItem | null;
    userEmail?: string;
}

export function ProviderModal({
    isOpen,
    onClose,
    onSaveSuccess,
    providerToEdit,
    userEmail
}: ProviderModalProps) {
    const isEdit = Boolean(providerToEdit?.id);

    const [formData, setFormData] = useState({
        nit: "",
        codigo_sn: "",
        razon_social: "",
        responsable: "",
        autorizador: "",
        correo: "",
        telefono: "",
        notificar: false,
        source: "firplak" as "firplak" | "viventta"
    });

    // Responsable search state
    const [userSearch, setUserSearch] = useState("");
    const [userOptions, setUserOptions] = useState<Array<{ name: string; email: string }>>([]);
    const [isSearchingUser, setIsSearchingUser] = useState(false);
    const [showUserDropdown, setShowUserDropdown] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const dropdownRef = useRef<HTMLDivElement>(null);

    // Initialize form when opening
    useEffect(() => {
        if (isOpen) {
            if (providerToEdit) {
                setFormData({
                    nit: providerToEdit.nit || "",
                    codigo_sn: providerToEdit.codigo_sn || "",
                    razon_social: providerToEdit.razon_social || "",
                    responsable: providerToEdit.responsable || "",
                    autorizador: providerToEdit.autorizador || providerToEdit.responsable || "",
                    correo: providerToEdit.correo || "",
                    telefono: providerToEdit.telefono || "",
                    notificar: String(providerToEdit.notificar).toLowerCase() === "true" || providerToEdit.notificar === true,
                    source: providerToEdit.source || "firplak"
                });
                setUserSearch(providerToEdit.responsable || "");
            } else {
                setFormData({
                    nit: "",
                    codigo_sn: "",
                    razon_social: "",
                    responsable: "",
                    autorizador: "",
                    correo: "",
                    telefono: "",
                    notificar: false,
                    source: "firplak"
                });
                setUserSearch("");
            }
            setUserOptions([]);
            setShowUserDropdown(false);
            setErrorMessage(null);
        }
    }, [isOpen, providerToEdit]);

    // Handle user search debounce
    useEffect(() => {
        if (!userSearch || userSearch.length < 2) {
            setUserOptions([]);
            return;
        }

        const timer = setTimeout(async () => {
            setIsSearchingUser(true);
            try {
                const res = await fetch(`/api/users/search?q=${encodeURIComponent(userSearch)}`);
                if (res.ok) {
                    const data = await res.json();
                    setUserOptions(data.users || []);
                }
            } catch (err) {
                console.error("Error buscando usuarios:", err);
            } finally {
                setIsSearchingUser(false);
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [userSearch]);

    // Close dropdown on click outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setShowUserDropdown(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleSelectUser = (user: { name: string; email: string }) => {
        setFormData(prev => ({
            ...prev,
            responsable: user.name,
            autorizador: user.name,
            correo: user.email || prev.correo
        }));
        setUserSearch(user.name);
        setShowUserDropdown(false);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMessage(null);

        if (!formData.nit.trim()) {
            setErrorMessage("El NIT o identificación es obligatorio.");
            return;
        }
        if (!formData.razon_social.trim()) {
            setErrorMessage("La Razón Social o Nombre es obligatorio.");
            return;
        }

        setIsSubmitting(true);
        try {
            const method = isEdit ? "PUT" : "POST";
            const payload: any = {
                ...formData,
                responsable: userSearch.trim(),
                autorizador: formData.autorizador.trim() || userSearch.trim(),
                user_email: userEmail || "Usuario"
            };

            if (isEdit && providerToEdit?.id) {
                payload.id = providerToEdit.id;
            }

            const res = await fetch("/api/proveedores-responsables", {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            const result = await res.json();

            if (!res.ok) {
                throw new Error(result.error || "Error al guardar el proveedor");
            }

            onSaveSuccess();
            onClose();
        } catch (err: any) {
            console.error("Error guardando proveedor:", err);
            setErrorMessage(err.message || "Ocurrió un error inesperado.");
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 15 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 15 }}
                    transition={{ duration: 0.2 }}
                    className="bg-white rounded-3xl shadow-2xl border border-gray-100 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]"
                >
                    {/* Header */}
                    <div className="bg-[#254153] text-white px-6 py-5 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-xl bg-white/10 flex items-center justify-center backdrop-blur-sm">
                                <Building2 className="h-5 w-5 text-white" />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold">
                                    {isEdit ? "Editar Proveedor y Responsable" : "Matricular Nuevo Proveedor"}
                                </h2>
                                <p className="text-xs text-white/70">
                                    {isEdit ? "Actualiza los datos del socio y dolientes asignados" : "Ingresa la información para auto-asignación de radicados"}
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="text-white/70 hover:text-white hover:bg-white/10 p-2 rounded-xl transition-colors"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>

                    {/* Form Body */}
                    <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
                        {errorMessage && (
                            <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3 text-red-700 text-xs">
                                <AlertCircle className="h-4 w-4 shrink-0" />
                                <span>{errorMessage}</span>
                            </div>
                        )}

                        {/* Empresa / Origen selector */}
                        {!isEdit && (
                            <div>
                                <label className="text-xs font-bold text-gray-700 uppercase tracking-wider block mb-1.5">
                                    Empresa / Destino
                                </label>
                                <div className="grid grid-cols-2 gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setFormData({ ...formData, source: "firplak" })}
                                        className={`py-2.5 px-4 rounded-xl text-xs font-bold border transition-all text-center ${
                                            formData.source === "firplak"
                                                ? "bg-[#254153] text-white border-[#254153] shadow-sm"
                                                : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"
                                        }`}
                                    >
                                        🏢 Firplak (Proveedores_con_Responsable)
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setFormData({ ...formData, source: "viventta" })}
                                        className={`py-2.5 px-4 rounded-xl text-xs font-bold border transition-all text-center ${
                                            formData.source === "viventta"
                                                ? "bg-[#254153] text-white border-[#254153] shadow-sm"
                                                : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"
                                        }`}
                                    >
                                        🏡 Viventta (Proveedores_Viventta)
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* NIT & Código SN */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs font-bold text-gray-700 uppercase tracking-wider block mb-1.5">
                                    NIT / Identificación <span className="text-red-500">*</span>
                                </label>
                                <div className="relative">
                                    <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                    <input
                                        type="text"
                                        required
                                        value={formData.nit}
                                        onChange={(e) => setFormData({ ...formData, nit: e.target.value })}
                                        placeholder="Ej: 900123456-1"
                                        className="w-full pl-9 pr-3 py-2.5 bg-gray-50/70 border border-gray-200 rounded-xl text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#254153]/20 focus:border-[#254153] transition-all"
                                    />
                                </div>
                            </div>

                            {formData.source === "firplak" && (
                                <div>
                                    <label className="text-xs font-bold text-gray-700 uppercase tracking-wider block mb-1.5">
                                        Código SN (SAP)
                                    </label>
                                    <div className="relative">
                                        <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                        <input
                                            type="text"
                                            value={formData.codigo_sn}
                                            onChange={(e) => setFormData({ ...formData, codigo_sn: e.target.value })}
                                            placeholder="Ej: AC900123456-01"
                                            className="w-full pl-9 pr-3 py-2.5 bg-gray-50/70 border border-gray-200 rounded-xl text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#254153]/20 focus:border-[#254153] transition-all"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Razón Social */}
                        <div>
                            <label className="text-xs font-bold text-gray-700 uppercase tracking-wider block mb-1.5">
                                Razón Social / Nombre del Proveedor <span className="text-red-500">*</span>
                            </label>
                            <div className="relative">
                                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                <input
                                    type="text"
                                    required
                                    value={formData.razon_social}
                                    onChange={(e) => setFormData({ ...formData, razon_social: e.target.value })}
                                    placeholder="Ej: DISTRIBUIDORA NACIONAL SAS"
                                    className="w-full pl-9 pr-3 py-2.5 bg-gray-50/70 border border-gray-200 rounded-xl text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#254153]/20 focus:border-[#254153] transition-all uppercase"
                                />
                            </div>
                        </div>

                        <hr className="border-gray-100" />

                        {/* Responsable Autocomplete */}
                        <div className="relative" ref={dropdownRef}>
                            <label className="text-xs font-bold text-gray-700 uppercase tracking-wider block mb-1.5">
                                Responsable de Autorizar / Doliente
                            </label>
                            <div className="relative">
                                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                <input
                                    type="text"
                                    value={userSearch}
                                    onChange={(e) => {
                                        setUserSearch(e.target.value);
                                        setFormData(prev => ({ ...prev, responsable: e.target.value }));
                                        setShowUserDropdown(true);
                                    }}
                                    onFocus={() => setShowUserDropdown(true)}
                                    placeholder="Escribe para buscar usuario de SharePoint / Office 365..."
                                    className="w-full pl-9 pr-9 py-2.5 bg-gray-50/70 border border-gray-200 rounded-xl text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#254153]/20 focus:border-[#254153] transition-all"
                                />
                                {isSearchingUser ? (
                                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 animate-spin" />
                                ) : (
                                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                )}
                            </div>

                            {/* Dropdown Options */}
                            {showUserDropdown && userOptions.length > 0 && (
                                <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-2xl shadow-xl z-20 max-h-48 overflow-y-auto divide-y divide-gray-50">
                                    {userOptions.map((user, idx) => (
                                        <button
                                            key={idx}
                                            type="button"
                                            onClick={() => handleSelectUser(user)}
                                            className="w-full px-4 py-2.5 text-left hover:bg-emerald-50/60 flex items-center justify-between group transition-colors"
                                        >
                                            <div>
                                                <p className="text-xs font-bold text-gray-800 group-hover:text-[#254153]">{user.name}</p>
                                                <p className="text-[11px] text-gray-400">{user.email}</p>
                                            </div>
                                            <Check className="h-4 w-4 text-[#254153] opacity-0 group-hover:opacity-100 transition-opacity" />
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {formData.source === "firplak" && (
                            <>
                                {/* Autorizador & Correo */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-xs font-bold text-gray-700 uppercase tracking-wider block mb-1.5">
                                            Autorizador (Si difiere del responsable)
                                        </label>
                                        <div className="relative">
                                            <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                            <input
                                                type="text"
                                                value={formData.autorizador}
                                                onChange={(e) => setFormData({ ...formData, autorizador: e.target.value })}
                                                placeholder="Nombre del autorizador"
                                                className="w-full pl-9 pr-3 py-2.5 bg-gray-50/70 border border-gray-200 rounded-xl text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#254153]/20 focus:border-[#254153] transition-all"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="text-xs font-bold text-gray-700 uppercase tracking-wider block mb-1.5">
                                            Correo Electrónico
                                        </label>
                                        <div className="relative">
                                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                            <input
                                                type="email"
                                                value={formData.correo}
                                                onChange={(e) => setFormData({ ...formData, correo: e.target.value })}
                                                placeholder="correo@firplak.com"
                                                className="w-full pl-9 pr-3 py-2.5 bg-gray-50/70 border border-gray-200 rounded-xl text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#254153]/20 focus:border-[#254153] transition-all"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Teléfono & Notificar */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                                    <div>
                                        <label className="text-xs font-bold text-gray-700 uppercase tracking-wider block mb-1.5">
                                            Número de Teléfono
                                        </label>
                                        <div className="relative">
                                            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                            <input
                                                type="text"
                                                value={formData.telefono}
                                                onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
                                                placeholder="+57 300 123 4567"
                                                className="w-full pl-9 pr-3 py-2.5 bg-gray-50/70 border border-gray-200 rounded-xl text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#254153]/20 focus:border-[#254153] transition-all"
                                            />
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between bg-gray-50/80 p-3 rounded-2xl border border-gray-200/80 mt-2 sm:mt-5">
                                        <div className="flex items-center gap-2.5">
                                            <Bell className="h-4 w-4 text-[#254153]" />
                                            <div>
                                                <p className="text-xs font-bold text-gray-800">Notificar al Responsable</p>
                                                <p className="text-[10px] text-gray-500">Enviar correos automáticos al radicar</p>
                                            </div>
                                        </div>
                                        <Switch
                                            checked={formData.notificar}
                                            onChange={(val: boolean) => setFormData({ ...formData, notificar: val })}
                                        />
                                    </div>
                                </div>
                            </>
                        )}

                        {/* Footer Actions */}
                        <div className="pt-4 border-t border-gray-100 flex items-center justify-end gap-3">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={onClose}
                                disabled={isSubmitting}
                                className="rounded-xl"
                            >
                                Cancelar
                            </Button>
                            <Button
                                type="submit"
                                disabled={isSubmitting}
                                className="bg-[#254153] hover:bg-[#1a2f3d] text-white font-bold rounded-xl px-5"
                            >
                                {isSubmitting ? (
                                    <>
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        Guardando...
                                    </>
                                ) : isEdit ? (
                                    "Actualizar Proveedor"
                                ) : (
                                    "Matricular Proveedor"
                                )}
                            </Button>
                        </div>
                    </form>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
