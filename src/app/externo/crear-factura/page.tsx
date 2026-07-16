"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, Loader2, CheckCircle2, AlertCircle, FileText, User, Hash, Search, ChevronDown, Check } from "lucide-react";
import { Button } from "@/components/ui/Button";

export default function PublicCreateInvoicePage() {
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
    
    const [file, setFile] = useState<File | null>(null);
    
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
        if (!file) {
            setError("Debes adjuntar el archivo PDF de la factura.");
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
            if (file) {
                data.append("files", file);
            }

            const res = await fetch("/api/sharepoint/create", {
                method: "POST",
                body: data
            });

            const result = await res.json();

            if (result.success) {
                setSuccess(true);
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

    const handleReset = () => {
        setFormData({
            nroFactura: "",
            nit: "",
            proveedor: "",
            responsableEmail: "",
            valorTotal: ""
        });
        setFile(null);
        setSuccess(false);
        setError(null);
        setUserSearch("");
        setProviderSearch("");
        setAutoFilledResponsable(false);
    };

    return (
        <div className="min-h-screen bg-[#f8fafc] flex flex-col items-center justify-center p-4 md:p-8">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full max-w-2xl bg-white rounded-[32px] shadow-2xl overflow-hidden border border-gray-100"
            >
                {/* Header */}
                <div className="px-8 py-6 bg-[#254153] text-white flex items-center gap-4">
                    <div className="h-12 w-12 rounded-2xl bg-white/10 flex items-center justify-center">
                        <FileText className="h-6 w-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold">Cargue de Factura</h1>
                        <p className="text-white/60 text-sm font-medium tracking-wide">Portal Proveedores</p>
                    </div>
                </div>

                {success ? (
                    <div className="p-12 flex flex-col items-center text-center space-y-6">
                        <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="h-24 w-24 rounded-full bg-emerald-50 flex items-center justify-center"
                        >
                            <CheckCircle2 className="h-14 w-14 text-emerald-500" />
                        </motion.div>
                        <div>
                            <h2 className="text-2xl font-black text-gray-800 mb-2">¡Factura Cargada con Éxito!</h2>
                            <p className="text-gray-500">Su factura ha sido registrada correctamente y está en proceso de revisión.</p>
                        </div>
                        <Button
                            onClick={handleReset}
                            className="bg-[#254153] text-white rounded-xl h-12 px-8 font-black hover:bg-[#1a2f3d] transition-all shadow-lg"
                        >
                            Cargar Otra Factura
                        </Button>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="p-8 space-y-6">
                        {error && (
                            <motion.div
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="p-4 rounded-xl bg-rose-50 border border-rose-100 text-rose-700 flex items-start gap-3 shadow-sm"
                            >
                                <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                                <p className="text-sm font-bold">{error}</p>
                            </motion.div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Proveedor (Searchable) */}
                            <div className="md:col-span-2 space-y-2" ref={providerDropdownRef}>
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">Proveedor</label>
                                <div className="relative group">
                                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
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
                                        className="w-full pl-11 pr-10 py-3.5 bg-gray-50 border border-gray-100 rounded-2xl text-base focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all font-bold text-[#254153]"
                                        placeholder="Buscar por Razón Social o NIT..."
                                    />
                                    <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
                                        {isSearchingProviders && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
                                        <ChevronDown className="h-4 w-4 text-gray-400" />
                                    </div>
                                </div>

                                <AnimatePresence>
                                    {showProviderResults && (
                                        <motion.div
                                            initial={{ opacity: 0, y: 5 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: 5 }}
                                            className="absolute z-[110] w-full mt-2 bg-white border border-gray-100 rounded-2xl shadow-xl overflow-hidden max-h-64 overflow-y-auto custom-scrollbar"
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
                                                            className="w-full px-5 py-3 text-left hover:bg-blue-50/80 border-b border-gray-50 last:border-0 transition-colors flex flex-col"
                                                        >
                                                            <span className="text-sm font-bold text-[#254153]">{p.razon_social}</span>
                                                            <span className="text-xs text-gray-500 mt-0.5">NIT: {p.numero_identificacion}</span>
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
                                                            className="w-full py-3 text-xs font-bold text-blue-500 hover:bg-gray-50 transition-colors bg-white sticky bottom-0 border-t border-gray-100"
                                                        >
                                                            Cargar más...
                                                        </button>
                                                    )}
                                                </>
                                            ) : (
                                                <div className="px-5 py-4 text-sm text-gray-500 text-center bg-gray-50/50">
                                                    {isSearchingProviders ? "Buscando..." : "No se encontraron proveedores"}
                                                </div>
                                            )}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>

                            {/* NIT (Auto-filled) */}
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">NIT</label>
                                <div className="relative group">
                                    <User className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                                    <input
                                        readOnly
                                        type="text"
                                        value={formData.nit}
                                        className="w-full pl-11 pr-4 py-3.5 bg-gray-100 border border-gray-100 rounded-2xl text-base font-bold text-gray-500 cursor-not-allowed shadow-inner"
                                        placeholder="NIT automático"
                                    />
                                </div>
                            </div>

                            {/* Número de Factura */}
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">Nro. Factura</label>
                                <div className="relative group">
                                    <Hash className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                                    <input
                                        required
                                        disabled={!formData.nit}
                                        type="text"
                                        value={formData.nroFactura}
                                        onChange={(e) => setFormData({...formData, nroFactura: e.target.value})}
                                        className={`w-full pl-11 pr-4 py-3.5 border rounded-2xl text-base focus:outline-none focus:ring-4 transition-all font-bold ${
                                            !formData.nit ? "bg-gray-100 cursor-not-allowed text-gray-400" :
                                            isDuplicate 
                                            ? "bg-red-50 border-red-200 text-red-900 focus:ring-red-500/20 focus:border-red-500" 
                                            : "bg-gray-50 border-gray-200 text-[#254153] focus:ring-blue-500/20 focus:border-blue-500"
                                        }`}
                                        placeholder={formData.nit ? "FE123" : "Seleccione proveedor primero"}
                                    />
                                </div>
                                {isDuplicate && (
                                    <p className="text-xs text-red-500 font-bold ml-1 animate-pulse">
                                        {duplicateMessage}
                                    </p>
                                )}
                            </div>

                            {/* Valor de la Factura */}
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">Valor Total</label>
                                <div className="relative group">
                                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">$</div>
                                    <input
                                        required
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={formData.valorTotal}
                                        onChange={(e) => setFormData({...formData, valorTotal: e.target.value})}
                                        className="w-full pl-8 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-2xl text-base focus:outline-none focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-bold text-[#254153]"
                                        placeholder="0.00"
                                    />
                                </div>
                            </div>

                            {/* Responsable */}
                            <div className="md:col-span-2 space-y-2 relative" ref={userDropdownRef}>
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1 flex items-center justify-between">
                                    <span>Responsable de Autorizar</span>
                                    {autoFilledResponsable && (
                                        <span className="text-[10px] text-emerald-600 bg-emerald-100/50 px-2.5 py-0.5 rounded-full font-black border border-emerald-200">✓ Asignado automáticamente</span>
                                    )}
                                </label>
                                <div className="relative group">
                                    <User className={`absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 transition-colors ${autoFilledResponsable ? 'text-emerald-500' : 'text-gray-400 group-focus-within:text-blue-500'}`} />
                                    <input
                                        required
                                        type="text"
                                        value={userSearch}
                                        onChange={(e) => {
                                            setUserSearch(e.target.value);
                                            setAutoFilledResponsable(false);
                                            setFormData({...formData, responsableEmail: ""});
                                        }}
                                        className={`w-full pl-11 pr-10 py-3.5 border rounded-2xl text-base focus:outline-none focus:ring-4 transition-all font-bold text-[#254153] ${
                                            autoFilledResponsable ? 'bg-emerald-50/50 border-emerald-200 focus:ring-emerald-500/20 focus:border-emerald-500' : 'bg-gray-50 border-gray-200 focus:ring-blue-500/20 focus:border-blue-500'
                                        }`}
                                        placeholder="Buscar responsable por nombre o correo..."
                                    />
                                    {(isSearchingUsers || isLookingUpResponsable) && (
                                        <div className="absolute right-4 top-1/2 -translate-y-1/2">
                                            <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                                        </div>
                                    )}
                                </div>

                                <AnimatePresence>
                                    {userResults.length > 0 && (
                                        <motion.div
                                            initial={{ opacity: 0, y: 5 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: 5 }}
                                            className="absolute z-[110] w-full mt-2 bg-white border border-gray-100 rounded-2xl shadow-xl overflow-hidden max-h-56 overflow-y-auto custom-scrollbar"
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
                                                    className="w-full px-5 py-3 text-left hover:bg-gray-50 flex items-center justify-between border-b border-gray-50 last:border-0 transition-colors"
                                                >
                                                    <div>
                                                        <p className="text-sm font-bold text-[#254153]">{user.name}</p>
                                                        <p className="text-xs text-gray-500 mt-0.5">{user.email}</p>
                                                    </div>
                                                    <CheckCircle2 className={`h-5 w-5 ${formData.responsableEmail === user.email ? "text-emerald-500" : "text-transparent"}`} />
                                                </button>
                                            ))}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </div>

                        {/* Subida de Archivo */}
                        <div className="space-y-2 mt-2">
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">Archivo PDF de Factura</label>
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">Archivo de Factura</label>
                            <div 
                                className={`relative border-2 border-dashed rounded-3xl p-8 flex flex-col items-center justify-center text-center space-y-3 transition-all
                                    ${file ? "border-blue-400 bg-blue-50/50" : "border-gray-200 bg-gray-50/50 hover:bg-gray-100/50 hover:border-gray-300"}`}
                            >
                                <input
                                    required
                                    type="file"
                                    accept=".pdf,.zip,.rar,.7z,application/zip,application/x-zip-compressed,application/octet-stream,application/x-rar-compressed"
                                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                />
                                {file ? (
                                    <div className="flex flex-col items-center justify-center w-full max-w-sm">
                                        <div className="h-16 w-16 rounded-2xl bg-blue-100 flex items-center justify-center shrink-0 mb-4 shadow-sm">
                                            <FileText className="h-8 w-8 text-blue-600" />
                                        </div>
                                        <p className="text-base font-bold text-blue-700 truncate w-full px-4">{file.name}</p>
                                        <p className="text-xs text-blue-500/80 font-semibold mt-1">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                                        <div className="mt-4 px-4 py-2 bg-white rounded-xl shadow-sm border border-blue-100 text-xs font-bold text-blue-600 flex items-center gap-2 pointer-events-none">
                                            <Check className="h-3 w-3" /> PDF Seleccionado
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <div className="h-16 w-16 rounded-2xl bg-white shadow-sm border border-gray-100 flex items-center justify-center mb-2">
                                            <Upload className="h-7 w-7 text-gray-400" />
                                        </div>
                                        <div>
                                            <p className="text-base font-bold text-[#254153]">Haz clic o arrastra el PDF aquí</p>
                                            <p className="text-sm text-gray-500 font-medium mt-1">Tamaño máximo recomendado: 10MB</p>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Submit Button */}
                        <div className="pt-6 border-t border-gray-100">
                            <Button
                                type="submit"
                                disabled={isLoading || !file || !formData.proveedor || !formData.responsableEmail || !formData.nroFactura || !formData.nit || isDuplicate}
                                className="w-full rounded-2xl h-14 text-base font-black bg-[#254153] hover:bg-[#1a2f3d] text-white shadow-xl shadow-[#254153]/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isLoading ? (
                                    <span className="flex items-center gap-2">
                                        <Loader2 className="h-5 w-5 animate-spin" /> Procesando Factura...
                                    </span>
                                ) : (
                                    "Cargar Factura"
                                )}
                            </Button>
                        </div>
                    </form>
                )}
            </motion.div>
            
            <style jsx global>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 6px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: #cbd5e1;
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: #94a3b8;
                }
            `}</style>
        </div>
    );
}
