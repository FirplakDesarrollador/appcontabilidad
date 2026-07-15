"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Upload, Loader2, CheckCircle2, AlertCircle, FileText, User, DollarSign, Hash, Search, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface CreateInvoiceModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export function CreateInvoiceModal({ isOpen, onClose, onSuccess }: CreateInvoiceModalProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    
    const [formData, setFormData] = useState({
        nroFactura: "",
        nit: "",
        proveedor: "",
        responsableEmail: "",
        valorTotal: ""
    });
    
    const [files, setFiles] = useState<File[]>([]);
    
    // Estados para búsqueda de Responsable
    const [userSearch, setUserSearch] = useState("");
    const [userResults, setUserResults] = useState<any[]>([]);
    const [isSearchingUsers, setIsSearchingUsers] = useState(false);

    // Estados para búsqueda de Proveedor
    const [providerSearch, setProviderSearch] = useState("");
    const [providerResults, setProviderResults] = useState<any[]>([]);
    const [isSearchingProviders, setIsSearchingProviders] = useState(false);
    const [showProviderResults, setShowProviderResults] = useState(false);
    const [providerPage, setProviderPage] = useState(0);
    const [hasMoreProviders, setHasMoreProviders] = useState(true);

    const [isDuplicate, setIsDuplicate] = useState(false);
    const [duplicateMessage, setDuplicateMessage] = useState("");
    const [isLookingUpResponsable, setIsLookingUpResponsable] = useState(false);
    const [autoFilledResponsable, setAutoFilledResponsable] = useState(false);

    const providerDropdownRef = useRef<HTMLDivElement>(null);
    const userDropdownRef = useRef<HTMLDivElement>(null);

    // Cerrar dropdowns al hacer click fuera
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (providerDropdownRef.current && !providerDropdownRef.current.contains(event.target as Node)) {
                setShowProviderResults(false);
            }
            if (userDropdownRef.current && !userDropdownRef.current.contains(event.target as Node)) {
                setUserResults([]);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Búsqueda de proveedores
    const searchProviders = useCallback(async (query: string, page: number = 0, append: boolean = false) => {
        setIsSearchingProviders(true);
        try {
            const res = await fetch(`/api/providers/search?q=${encodeURIComponent(query)}&page=${page}&limit=15`);
            const data = await res.json();
            if (append) {
                setProviderResults(prev => [...prev, ...data.providers]);
            } else {
                setProviderResults(data.providers || []);
            }
            setHasMoreProviders(data.hasMore);
        } catch (e) {
            console.error("Error searching providers:", e);
        } finally {
            setIsSearchingProviders(false);
        }
    }, []);

    useEffect(() => {
        const timer = setTimeout(() => {
            if (showProviderResults) {
                setProviderPage(0);
                searchProviders(providerSearch, 0, false);
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [providerSearch, searchProviders, showProviderResults]);

    // Búsqueda de usuarios para responsable
    useEffect(() => {
        const timer = setTimeout(async () => {
            if (userSearch.length >= 3) {
                setIsSearchingUsers(true);
                try {
                    const res = await fetch(`/api/users/search?q=${encodeURIComponent(userSearch)}`);
                    const data = await res.json();
                    setUserResults(data.users || []);
                } catch (e) {
                    console.error("Error searching users:", e);
                } finally {
                    setIsSearchingUsers(false);
                }
            } else {
                setUserResults([]);
            }
        }, 500);
        return () => clearTimeout(timer);
    }, [userSearch]);

    // Validar duplicado en tiempo real
    useEffect(() => {
        const timer = setTimeout(async () => {
            if (formData.nroFactura && formData.nit) {
                try {
                    const res = await fetch(`/api/sharepoint/check-duplicate?nit=${encodeURIComponent(formData.nit)}&nroFactura=${encodeURIComponent(formData.nroFactura)}`);
                    const data = await res.json();
                    if (data.exists) {
                        setIsDuplicate(true);
                        setDuplicateMessage(data.message);
                    } else {
                        setIsDuplicate(false);
                        setDuplicateMessage("");
                    }
                } catch (e) {
                    console.error("Error checking duplicate:", e);
                }
            } else {
                setIsDuplicate(false);
                setDuplicateMessage("");
            }
        }, 600);
        return () => clearTimeout(timer);
    }, [formData.nroFactura, formData.nit]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (files.length === 0) {
            setError("Debes adjuntar al menos un archivo (PDF, ZIP, RAR, etc.).");
            return;
        }

        if (isDuplicate) {
            setError(duplicateMessage);
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            const data = new FormData();
            data.append("nroFactura", formData.nroFactura);
            data.append("nit", formData.nit);
            data.append("proveedor", formData.proveedor);
            data.append("responsableEmail", formData.responsableEmail);
            if (formData.valorTotal) {
                data.append("valorTotal", formData.valorTotal);
            }
            files.forEach((f) => {
                data.append("files", f);
            });

            const res = await fetch("/api/sharepoint/create", {
                method: "POST",
                body: data
            });

            const result = await res.json();

            if (result.success) {
                setSuccess(true);
                setTimeout(() => {
                    onSuccess();
                    handleClose();
                }, 2000);
            } else {
                if (result.error === 'DUPLICATED') {
                    throw new Error(result.message);
                }
                throw new Error(result.error || "Error al crear la factura");
            }
        } catch (e: any) {
            setError(e.message || "Error de conexión.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleClose = () => {
        setFormData({
            nroFactura: "",
            nit: "",
            proveedor: "",
            responsableEmail: "",
            valorTotal: ""
        });
        setFiles([]);
        setSuccess(false);
        setError(null);
        setUserSearch("");
        setProviderSearch("");
        setAutoFilledResponsable(false);
        onClose();
    };

    return (
        <>
            <AnimatePresence>
                {isOpen && (
                    <div key="invoice-modal-container" className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={handleClose}
                    className="absolute inset-0 bg-[#254153]/40 backdrop-blur-sm"
                />
                
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden"
                >
                    {/* Header */}
                    <div className="px-6 py-4 bg-white border-b border-gray-100 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-xl bg-blue-50 flex items-center justify-center">
                                <FileText className="h-5 w-5 text-blue-600" />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-[#254153]">Crear Factura</h2>
                                <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">Registro Manual</p>
                            </div>
                        </div>
                        <button 
                            onClick={handleClose}
                            className="h-8 w-8 rounded-lg hover:bg-gray-50 flex items-center justify-center text-gray-400 transition-colors"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>

                    {success ? (
                        <div className="p-12 flex flex-col items-center text-center space-y-4">
                            <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                className="h-16 w-16 rounded-full bg-emerald-50 flex items-center justify-center"
                            >
                                <CheckCircle2 className="h-10 w-10 text-emerald-500" />
                            </motion.div>
                            <h3 className="text-xl font-bold text-gray-800">¡Factura Creada!</h3>
                            <p className="text-sm text-gray-500">La factura se ha registrado y el PDF ha sido cargado.</p>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto custom-scrollbar">
                            {error && (
                                <motion.div
                                    initial={{ opacity: 0, y: -10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="p-3 rounded-xl bg-rose-50 border border-rose-100 text-rose-700 flex items-center gap-3"
                                >
                                    <AlertCircle className="h-4 w-4 shrink-0" />
                                    <p className="text-xs font-bold">{error}</p>
                                </motion.div>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* Proveedor (Searchable) */}
                                <div className="md:col-span-2 space-y-1.5" ref={providerDropdownRef}>
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider ml-1">Proveedor</label>
                                    <div className="relative group">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                                        <input
                                            required
                                            type="text"
                                            value={formData.proveedor ? formData.proveedor : providerSearch}
                                            onChange={(e) => {
                                                setProviderSearch(e.target.value);
                                                if (formData.proveedor) {
                                                    setFormData({...formData, proveedor: "", nit: ""});
                                                }
                                            }}
                                            onFocus={() => setShowProviderResults(true)}
                                            className="w-full pl-9 pr-10 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all font-bold text-[#254153]"
                                            placeholder="Buscar proveedor..."
                                        />
                                        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                                            {isSearchingProviders && <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />}
                                            <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
                                        </div>
                                    </div>

                                    <AnimatePresence>
                                        {showProviderResults && (
                                            <motion.div
                                                initial={{ opacity: 0, y: 5 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: 5 }}
                                                className="absolute z-[110] w-full mt-1 bg-white border border-gray-100 rounded-xl shadow-xl overflow-hidden max-h-48 overflow-y-auto custom-scrollbar"
                                            >
                                                {providerResults.length > 0 ? (
                                                    <>
                                                        {providerResults.map((p, idx) => (
                                                            <button
                                                                key={`${p.numero_identificacion}-${idx}`}
                                                                type="button"
                                                                onClick={async () => {
                                                                    setFormData({...formData, proveedor: p.razon_social, nit: p.numero_identificacion});
                                                                    setProviderSearch(p.razon_social);
                                                                    setShowProviderResults(false);
                                                                    // Auto-lookup responsible person
                                                                    try {
                                                                        setIsLookingUpResponsable(true);
                                                                        setAutoFilledResponsable(false);
                                                                        const res = await fetch(`/api/providers/responsable?nit=${encodeURIComponent(p.numero_identificacion)}`);
                                                                        const data = await res.json();
                                                                        if (data.found && data.responsable) {
                                                                            if (data.correo) {
                                                                                setFormData(prev => ({...prev, proveedor: p.razon_social, nit: p.numero_identificacion, responsableEmail: data.correo}));
                                                                                setUserSearch(data.responsable);
                                                                                setAutoFilledResponsable(true);
                                                                            } else {
                                                                                const searchUser = async (nameToSearch: string) => {
                                                                                    let cleanSearchName = nameToSearch.replace(/\uFFFD/g, 'ñ');
                                                                                    const parts = cleanSearchName.split(' ').filter(p => p.trim() !== '');
                                                                                    const searchQuery = parts.length > 1 ? `${parts[0]} ${parts[1]}` : cleanSearchName;
                                                                                    
                                                                                    const userRes = await fetch(`/api/users/search?q=${encodeURIComponent(searchQuery)}`);
                                                                                    const userData = await userRes.json();
                                                                                    const users = userData.users || [];
                                                                                    
                                                                                    if (users.length > 0) {
                                                                                        const exactMatch = users.find((u: any) => u.name.toLowerCase() === cleanSearchName.toLowerCase());
                                                                                        if (exactMatch) return exactMatch;
                                                                                        
                                                                                        const allPartsMatch = users.find((u: any) => {
                                                                                            const name = u.name.toLowerCase();
                                                                                            return parts.every(p => name.includes(p.toLowerCase()));
                                                                                        });
                                                                                        if (allPartsMatch) return allPartsMatch;
                                                                                        
                                                                                        return null;
                                                                                    }
                                                                                    return null;
                                                                                };

                                                                                let exactMatch = await searchUser(data.responsable);
                                                                                
                                                                                if (!exactMatch && data.autorizador && data.autorizador !== data.responsable) {
                                                                                    exactMatch = await searchUser(data.autorizador);
                                                                                }

                                                                                if (exactMatch) {
                                                                                    setFormData(prev => ({...prev, proveedor: p.razon_social, nit: p.numero_identificacion, responsableEmail: exactMatch.email}));
                                                                                    setUserSearch(exactMatch.name);
                                                                                    setAutoFilledResponsable(true);
                                                                                } else {
                                                                                    // User not found in AD, just show the name
                                                                                    setUserSearch(data.responsable);
                                                                                }
                                                                            }
                                                                        }
                                                                    } catch (e) {
                                                                        console.error('Error looking up responsable:', e);
                                                                    } finally {
                                                                        setIsLookingUpResponsable(false);
                                                                    }
                                                                }}
                                                                className="w-full px-4 py-2.5 text-left hover:bg-blue-50/50 border-b border-gray-50 last:border-0 transition-colors flex flex-col"
                                                            >
                                                                <span className="text-xs font-bold text-[#254153] line-clamp-1">{p.razon_social}</span>
                                                                <span className="text-[10px] text-gray-400">NIT: {p.numero_identificacion}</span>
                                                            </button>
                                                        ))}
                                                        {hasMoreProviders && (
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    const nextPage = providerPage + 1;
                                                                    setProviderPage(nextPage);
                                                                    searchProviders(providerSearch, nextPage, true);
                                                                }}
                                                                className="w-full py-2 text-[10px] font-bold text-blue-500 hover:bg-gray-50 transition-colors"
                                                            >
                                                                Cargar más...
                                                            </button>
                                                        )}
                                                    </>
                                                ) : (
                                                    <div className="px-4 py-3 text-xs text-gray-400 text-center">
                                                        {isSearchingProviders ? "Buscando..." : "No se encontraron proveedores"}
                                                    </div>
                                                )}
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>

                                {/* NIT (Auto-filled) */}
                                <div className="md:col-span-2 space-y-1.5">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider ml-1">NIT</label>
                                    <div className="relative group">
                                        <User className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                                        <input
                                            readOnly
                                            type="text"
                                            value={formData.nit}
                                            className="w-full pl-9 pr-3 py-2.5 bg-gray-100 border border-gray-100 rounded-xl text-sm font-bold text-gray-500 cursor-not-allowed"
                                            placeholder="NIT automático"
                                        />
                                    </div>
                                </div>

                                {/* Número de Factura */}
                                <div className="md:col-span-2 space-y-1.5">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider ml-1">Nro. Factura</label>
                                    <div className="relative group">
                                        <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                                        <input
                                            required
                                            disabled={!formData.nit}
                                            type="text"
                                            value={formData.nroFactura}
                                            onChange={(e) => setFormData({...formData, nroFactura: e.target.value})}
                                            className={`w-full pl-9 pr-3 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 transition-all font-bold ${
                                                !formData.nit ? "bg-gray-100 cursor-not-allowed text-gray-400" :
                                                isDuplicate 
                                                ? "bg-red-50 border-red-200 text-red-900 focus:ring-red-500/10 focus:border-red-500" 
                                                : "bg-gray-50 border-gray-100 text-[#254153] focus:ring-blue-500/10 focus:border-blue-500"
                                            }`}
                                            placeholder={formData.nit ? "FE123" : "Seleccione proveedor primero"}
                                        />
                                    </div>
                                    {isDuplicate && (
                                        <p className="text-[10px] text-red-500 font-bold ml-1 animate-pulse">
                                            {duplicateMessage}
                                        </p>
                                    )}
                                </div>

                                {/* Valor de la Factura */}
                                <div className="md:col-span-2 space-y-1.5">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider ml-1">Valor Total</label>
                                    <div className="relative group">
                                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-sm">$</div>
                                        <input
                                            required
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            value={formData.valorTotal}
                                            onChange={(e) => setFormData({...formData, valorTotal: e.target.value})}
                                            className="w-full pl-8 pr-3 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all font-bold text-[#254153]"
                                            placeholder="0.00"
                                        />
                                    </div>
                                </div>

                                {/* Responsable */}
                                <div className="md:col-span-2 space-y-1.5 relative" ref={userDropdownRef}>
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider ml-1 flex items-center gap-2">
                                        Responsable de Autorizar
                                        {autoFilledResponsable && (
                                            <span className="text-[9px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full font-black">✓ Asignado automáticamente</span>
                                        )}
                                    </label>
                                    <div className="relative group">
                                        <User className={`absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 transition-colors ${autoFilledResponsable ? 'text-emerald-500' : 'text-gray-400 group-focus-within:text-blue-500'}`} />
                                        <input
                                            type="text"
                                            value={userSearch}
                                            onChange={(e) => {
                                                setUserSearch(e.target.value);
                                                setAutoFilledResponsable(false);
                                                setFormData({...formData, responsableEmail: ""});
                                            }}
                                            className={`w-full pl-9 pr-3 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all font-bold text-[#254153] ${
                                                autoFilledResponsable ? 'bg-emerald-50/50 border-emerald-200' : 'bg-gray-50 border-gray-100'
                                            }`}
                                            placeholder="Buscar por nombre o correo..."
                                        />
                                        {(isSearchingUsers || isLookingUpResponsable) && (
                                            <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                                <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
                                            </div>
                                        )}
                                    </div>

                                    <AnimatePresence>
                                        {userResults.length > 0 && (
                                            <motion.div
                                                initial={{ opacity: 0, y: 5 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: 5 }}
                                                className="absolute z-[110] w-full mt-1 bg-white border border-gray-100 rounded-xl shadow-xl overflow-hidden max-h-40 overflow-y-auto"
                                            >
                                                {userResults.map((user) => (
                                                    <button
                                                        key={user.email}
                                                        type="button"
                                                        onClick={() => {
                                                            setFormData({...formData, responsableEmail: user.email});
                                                            setUserSearch(user.name);
                                                            setUserResults([]);
                                                        }}
                                                        className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center justify-between border-b border-gray-50 last:border-0 transition-colors"
                                                    >
                                                        <div>
                                                            <p className="text-xs font-bold text-[#254153]">{user.name}</p>
                                                            <p className="text-[9px] text-gray-400">{user.email}</p>
                                                        </div>
                                                        <CheckCircle2 className={`h-3.5 w-3.5 ${formData.responsableEmail === user.email ? "text-emerald-500" : "text-transparent"}`} />
                                                    </button>
                                                ))}
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            </div>

                            {/* Subida de Archivos */}
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider ml-1">Archivos Adjuntos</label>
                                <div 
                                    className={`relative border-2 border-dashed rounded-2xl p-4 flex flex-col items-center text-center space-y-2 transition-all
                                        ${files.length > 0 ? "border-blue-400 bg-blue-50/30" : "border-gray-100 bg-gray-50/50 hover:bg-gray-50 hover:border-gray-200"}`}
                                >
                                    {files.length === 0 && (
                                        <input
                                            type="file"
                                            accept=".pdf,.zip,.rar,.7z,image/*"
                                            multiple
                                            onChange={(e) => {
                                                if (e.target.files) {
                                                    setFiles(prev => [...prev, ...Array.from(e.target.files!)]);
                                                }
                                                e.target.value = '';
                                            }}
                                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                        />
                                    )}
                                    {files.length > 0 ? (
                                        <div className="flex flex-col gap-2 w-full px-2 max-h-40 overflow-y-auto custom-scrollbar">
                                            {files.map((f, idx) => (
                                                <div key={idx} className="flex items-center gap-3 w-full p-2 bg-white rounded-xl border border-blue-100 shadow-sm relative group">
                                                    <div className="h-8 w-8 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                                                        <FileText className="h-4 w-4 text-blue-600" />
                                                    </div>
                                                    <div className="text-left overflow-hidden flex-1">
                                                        <p className="text-xs font-bold text-blue-600 truncate pr-6">{f.name}</p>
                                                        <p className="text-[10px] text-blue-400">{(f.size / 1024 / 1024).toFixed(2)} MB</p>
                                                    </div>
                                                    <button 
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            setFiles(prev => prev.filter((_, i) => i !== idx));
                                                        }}
                                                        className="absolute right-2 p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
                                                    >
                                                        <X className="h-4 w-4" />
                                                    </button>
                                                </div>
                                            ))}
                                            <div className="pt-2 flex justify-center">
                                                <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-blue-600 bg-blue-50 rounded-xl hover:bg-blue-100 transition-colors border border-blue-100 shadow-sm">
                                                    <Upload className="h-3.5 w-3.5" />
                                                    Agregar más archivos
                                                    <input
                                                        type="file"
                                                        accept=".pdf,.zip,.rar,.7z,image/*"
                                                        multiple
                                                        onChange={(e) => {
                                                            if (e.target.files) {
                                                                setFiles(prev => [...prev, ...Array.from(e.target.files!)]);
                                                            }
                                                            e.target.value = '';
                                                        }}
                                                        className="hidden"
                                                    />
                                                </label>
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="h-8 w-8 rounded-lg bg-gray-100 flex items-center justify-center">
                                                <Upload className="h-4 w-4 text-gray-400" />
                                            </div>
                                            <div>
                                                <p className="text-xs font-bold text-[#254153]">Arrastra los archivos aquí</p>
                                                <p className="text-[9px] text-gray-400">PDF, ZIP, RAR, Imágenes (Máx. 10MB)</p>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* Footer */}
                            <div className="flex gap-3 pt-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={handleClose}
                                    className="flex-1 rounded-xl h-12 text-sm font-bold border-gray-100"
                                >
                                    Cancelar
                                </Button>
                                <Button
                                    type="submit"
                                    disabled={isLoading || files.length === 0 || !formData.proveedor || !formData.responsableEmail}
                                    className="flex-[2] rounded-xl h-12 text-sm font-black bg-[#254153] hover:bg-[#1a2f3d] text-white shadow-lg"
                                >
                                    {isLoading ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        "Crear Factura"
                                    )}
                                </Button>
                            </div>
                        </form>
                    )}
                </motion.div>
            </div>
            )}
            </AnimatePresence>
            
            <style jsx global>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 4px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: #e2e8f0;
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: #cbd5e1;
                }
            `}</style>
        </>
    );
}
