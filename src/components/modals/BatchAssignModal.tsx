"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Users, User, Mail, ShieldCheck, Loader2, Check, Search, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface BatchAssignModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    selectedIds: number[];
    selectedCount: number;
    source?: 'firplak' | 'viventta';
    userEmail?: string;
}

export function BatchAssignModal({
    isOpen,
    onClose,
    onSuccess,
    selectedIds,
    selectedCount,
    source = 'firplak',
    userEmail
}: BatchAssignModalProps) {
    const [userSearch, setUserSearch] = useState("");
    const [autorizador, setAutorizador] = useState("");
    const [correo, setCorreo] = useState("");
    const [userOptions, setUserOptions] = useState<Array<{ name: string; email: string }>>([]);
    const [isSearchingUser, setIsSearchingUser] = useState(false);
    const [showUserDropdown, setShowUserDropdown] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (isOpen) {
            setUserSearch("");
            setAutorizador("");
            setCorreo("");
            setUserOptions([]);
            setShowUserDropdown(false);
            setErrorMessage(null);
        }
    }, [isOpen]);

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
        setUserSearch(user.name);
        setAutorizador(user.name);
        setCorreo(user.email || "");
        setShowUserDropdown(false);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMessage(null);

        if (!userSearch.trim()) {
            setErrorMessage("Debe seleccionar o escribir el nombre del responsable.");
            return;
        }

        setIsSubmitting(true);
        try {
            const res = await fetch("/api/proveedores-responsables/batch", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ids: selectedIds,
                    responsable: userSearch.trim(),
                    autorizador: autorizador.trim() || userSearch.trim(),
                    correo: correo.trim(),
                    source,
                    user_email: userEmail || "Usuario"
                })
            });

            const result = await res.json();
            if (!res.ok) {
                throw new Error(result.error || "Error al actualizar en lote");
            }

            onSuccess();
            onClose();
        } catch (err: any) {
            console.error("Error batch assigning responsable:", err);
            setErrorMessage(err.message || "Ocurrió un error inesperado");
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
                    className="bg-white rounded-3xl shadow-2xl border border-gray-100 w-full max-w-lg overflow-hidden flex flex-col"
                >
                    {/* Header */}
                    <div className="bg-[#254153] text-white px-6 py-5 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-xl bg-white/10 flex items-center justify-center backdrop-blur-sm">
                                <Users className="h-5 w-5 text-white" />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold">Asignación Masiva de Responsable</h2>
                                <p className="text-xs text-white/70">
                                    Aplicar a <span className="font-bold text-white bg-white/20 px-2 py-0.5 rounded-full">{selectedCount}</span> proveedores seleccionados
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
                    <form onSubmit={handleSubmit} className="p-6 space-y-4">
                        {errorMessage && (
                            <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3 text-red-700 text-xs">
                                <AlertCircle className="h-4 w-4 shrink-0" />
                                <span>{errorMessage}</span>
                            </div>
                        )}

                        <div className="p-3 bg-blue-50/70 border border-blue-100 rounded-2xl text-xs text-blue-900 leading-relaxed">
                            💡 Todos los <strong>{selectedCount}</strong> proveedores seleccionados quedarán asociados al responsable y autorizador indicado a continuación.
                        </div>

                        {/* Responsable Autocomplete */}
                        <div className="relative" ref={dropdownRef}>
                            <label className="text-xs font-bold text-gray-700 uppercase tracking-wider block mb-1.5">
                                Nuevo Responsable <span className="text-red-500">*</span>
                            </label>
                            <div className="relative">
                                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                <input
                                    type="text"
                                    required
                                    value={userSearch}
                                    onChange={(e) => {
                                        setUserSearch(e.target.value);
                                        setShowUserDropdown(true);
                                    }}
                                    onFocus={() => setShowUserDropdown(true)}
                                    placeholder="Buscar usuario de SharePoint / Office 365..."
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

                        {source === 'firplak' && (
                            <>
                                <div>
                                    <label className="text-xs font-bold text-gray-700 uppercase tracking-wider block mb-1.5">
                                        Autorizador
                                    </label>
                                    <div className="relative">
                                        <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                        <input
                                            type="text"
                                            value={autorizador}
                                            onChange={(e) => setAutorizador(e.target.value)}
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
                                            value={correo}
                                            onChange={(e) => setCorreo(e.target.value)}
                                            placeholder="correo@firplak.com"
                                            className="w-full pl-9 pr-3 py-2.5 bg-gray-50/70 border border-gray-200 rounded-xl text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#254153]/20 focus:border-[#254153] transition-all"
                                        />
                                    </div>
                                </div>
                            </>
                        )}

                        {/* Footer */}
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
                                        Aplicando cambios...
                                    </>
                                ) : (
                                    `Asignar a ${selectedCount} Proveedores`
                                )}
                            </Button>
                        </div>
                    </form>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
