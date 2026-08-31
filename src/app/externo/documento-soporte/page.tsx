"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    CheckCircle2,
    AlertCircle,
    FileText,
    Upload,
    Building2,
    Hash,
    Loader2,
    ShieldCheck,
    ArrowRight,
    Search,
    ChevronDown,
    User,
    DollarSign
} from "lucide-react";
import { Button } from "@/components/ui/Button";

export default function DocumentoSoporteExternoPage() {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    const [formData, setFormData] = useState({
        nit: "",
        proveedor: "",
        responsableEmail: "",
        responsableNombre: "",
        valor: ""
    });

    const [file, setFile] = useState<File | null>(null);
    const [attachments, setAttachments] = useState<File[]>([]);
    const [isLookingUp, setIsLookingUp] = useState(false);
    const [autoFilled, setAutoFilled] = useState(false);

    // Estados para búsqueda de Responsable
    const [userSearch, setUserSearch] = useState("");
    const [userResults, setUserResults] = useState<any[]>([]);
    const [isSearchingUsers, setIsSearchingUsers] = useState(false);
    const userDropdownRef = useRef<HTMLDivElement>(null);

    // Estados para búsqueda de Proveedor
    const [providerSearch, setProviderSearch] = useState("");
    const [providerResults, setProviderResults] = useState<any[]>([]);
    const [isSearchingProviders, setIsSearchingProviders] = useState(false);
    const [showProviderResults, setShowProviderResults] = useState(false);
    const [providerPage, setProviderPage] = useState(0);
    const [hasMoreProviders, setHasMoreProviders] = useState(true);
    const providerDropdownRef = useRef<HTMLDivElement>(null);

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

    // Búsqueda de usuarios para responsable
    useEffect(() => {
        const timer = setTimeout(async () => {
            if (userSearch && userSearch.length >= 3 && !autoFilled) {
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
    }, [userSearch, autoFilled]);

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

    const handleSelectProvider = async (p: any) => {
        setFormData({ ...formData, proveedor: p.razon_social, nit: p.numero_identificacion });
        setProviderSearch(p.razon_social);
        setShowProviderResults(false);
        
        // Buscar el responsable automáticamente
        try {
            setIsLookingUp(true);
            setAutoFilled(false);
            const res = await fetch(`/api/providers/responsable?nit=${encodeURIComponent(p.numero_identificacion)}`);
            const data = await res.json();
            if (data.found && data.responsable) {
                // Fix encoding issues like replacement char mapping to ñ
                let cleanName = data.responsable.replace(/\uFFFD/g, 'ñ');
                
                    if (data.correo) {
                        setFormData(prev => ({ 
                            ...prev, 
                            proveedor: p.razon_social, 
                            nit: p.numero_identificacion, 
                            responsableEmail: data.correo,
                            responsableNombre: cleanName 
                        }));
                        setUserSearch(cleanName);
                        setAutoFilled(true);
                    } else {
                        // Función auxiliar para buscar usuario
                        const searchUser = async (nameToSearch: string) => {
                            let cleanSearchName = nameToSearch.replace(/\uFFFD/g, 'ñ');
                            const parts = cleanSearchName.split(' ').filter(p => p.trim() !== '');
                            const searchQuery = parts.length > 1 ? `${parts[0]} ${parts[1]}` : cleanSearchName;
                            
                            const userRes = await fetch(`/api/users/search?q=${encodeURIComponent(searchQuery)}`);
                            const userData = await userRes.json();
                            const users = userData.users || [];
                            
                            if (users.length > 0) {
                                const exact = users.find((u: any) => u.name.toLowerCase() === cleanSearchName.toLowerCase());
                                if (exact) return exact;

                                let bestMatch = users[0];
                                let bestScore = -1;

                                for (const user of users) {
                                    const userNameLower = user.name.toLowerCase();
                                    let score = 0;
                                    for (const part of parts) {
                                        if (userNameLower.includes(part.toLowerCase())) {
                                            score++;
                                        }
                                    }
                                    if (score > bestScore) {
                                        bestScore = score;
                                        bestMatch = user;
                                    }
                                }
                                return bestMatch;
                            }
                            return null;
                        };

                        let exactMatch = await searchUser(data.responsable);
                        
                        // Si no lo encuentra por responsable y hay un autorizador distinto, intentamos con el autorizador
                        if (!exactMatch && data.autorizador && data.autorizador !== data.responsable) {
                            exactMatch = await searchUser(data.autorizador);
                        }

                        if (exactMatch) {
                            setFormData(prev => ({ 
                                ...prev, 
                                proveedor: p.razon_social, 
                                nit: p.numero_identificacion, 
                                responsableEmail: exactMatch.email, 
                                responsableNombre: exactMatch.name 
                            }));
                            setUserSearch(exactMatch.name);
                            setAutoFilled(true);
                        }
                    }
            }
        } catch (e) {
            console.error('Error looking up responsable:', e);
        } finally {
            setIsLookingUp(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!file) {
            setError("Debes adjuntar el archivo PDF del documento soporte.");
            return;
        }

        if (!formData.nit || !formData.proveedor || !formData.valor) {
            setError("El NIT, la Razón Social y el Valor Total son obligatorios.");
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            const data = new FormData();
            data.append("nit", formData.nit);
            data.append("proveedor", formData.proveedor);
            if (formData.responsableEmail) {
                data.append("responsableEmail", formData.responsableEmail);
            }
            const finalRespName = formData.responsableNombre || userSearch;
            if (finalRespName) {
                data.append("responsableNombre", finalRespName);
            }
            if (formData.valor) {
                data.append("valorTotal", formData.valor);
            }
            data.append("file", file);
            attachments.forEach(att => {
                data.append("attachments", att);
            });

            const res = await fetch("/api/sharepoint/documentos/create", {
                method: "POST",
                body: data
            });

            const result = await res.json();

            if (result.success) {
                setSuccess(true);
            } else {
                throw new Error(result.error || "Error al enviar el documento soporte");
            }
        } catch (e: any) {
            setError(e.message || "Error de conexión al enviar el documento.");
        } finally {
            setIsLoading(false);
        }
    };

    if (success) {
        return (
            <div className="min-h-screen bg-[#f8fafc] flex flex-col items-center justify-center p-4">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-white rounded-3xl shadow-2xl p-10 max-w-md w-full text-center space-y-6 border border-gray-100"
                >
                    <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: "spring", delay: 0.2 }}
                        className="h-24 w-24 rounded-full bg-emerald-50 flex items-center justify-center mx-auto"
                    >
                        <CheckCircle2 className="h-12 w-12 text-emerald-500" />
                    </motion.div>
                    <div>
                        <h2 className="text-2xl font-black text-[#254153]">¡Documento Enviado!</h2>
                        <p className="text-gray-500 mt-2 font-medium">
                            Tu documento soporte ha sido registrado exitosamente y enviado para revisión.
                        </p>
                    </div>
                    <Button
                        onClick={() => {
                            setSuccess(false);
                            setFormData({ nit: "", proveedor: "", responsableEmail: "", responsableNombre: "", valor: "" });
                            setUserSearch("");
                            setUserResults([]);
                            setFile(null);
                            setAttachments([]);
                            setAutoFilled(false);
                            setProviderSearch("");
                        }}
                        className="w-full h-12 rounded-xl bg-[#254153] hover:bg-[#1a2f3d] text-white font-bold"
                    >
                        Enviar otro documento
                    </Button>
                </motion.div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#f8fafc] flex flex-col items-center justify-center p-4">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full max-w-xl bg-white rounded-[32px] shadow-2xl border border-gray-100 overflow-hidden"
            >
                {/* Header */}
                <div className="bg-[#254153] p-8 text-center relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-full bg-[url('/noise.png')] opacity-10 mix-blend-overlay"></div>
                    <div className="relative z-10 flex flex-col items-center gap-3">
                        <div className="h-16 w-16 bg-white/10 rounded-2xl flex items-center justify-center backdrop-blur-md border border-white/20">
                            <FileText className="h-8 w-8 text-white" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-black text-white">Recepción Documento Soporte</h1>
                            <p className="text-blue-100 text-sm font-medium mt-1">Sube tu documento soporte en formato PDF</p>
                        </div>
                    </div>
                </div>

                {/* Form */}
                <div className="p-8">
                    <form onSubmit={handleSubmit} className="space-y-6">
                        {error && (
                            <motion.div
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="p-4 rounded-xl bg-rose-50 border border-rose-100 text-rose-700 flex items-start gap-3"
                            >
                                <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                                <p className="text-sm font-bold">{error}</p>
                            </motion.div>
                        )}

                        <div className="space-y-4">
                            {/* Proveedor (Searchable) */}
                            <div className="space-y-1.5 relative" ref={providerDropdownRef}>
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">Proveedor (Razón Social o NIT)</label>
                                <div className="relative group">
                                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 group-focus-within:text-[#254153] transition-colors" />
                                    <input
                                        required
                                        type="text"
                                        value={formData.proveedor ? formData.proveedor : providerSearch}
                                        onChange={(e) => {
                                            setProviderSearch(e.target.value);
                                            if (formData.proveedor) {
                                                setFormData({ ...formData, proveedor: "", nit: "" });
                                            }
                                        }}
                                        onFocus={() => setShowProviderResults(true)}
                                        className="w-full h-14 pl-12 pr-12 bg-gray-50 border border-gray-200 rounded-2xl text-lg focus:outline-none focus:ring-2 focus:ring-[#254153]/10 focus:border-[#254153] transition-all font-bold text-[#254153]"
                                        placeholder="Buscar proveedor..."
                                    />
                                    <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
                                        {isSearchingProviders && <Loader2 className="h-5 w-5 animate-spin text-[#254153]" />}
                                        <ChevronDown className="h-5 w-5 text-gray-400" />
                                    </div>
                                </div>

                                <AnimatePresence>
                                    {showProviderResults && (
                                        <>
                                            <div className="fixed inset-0 z-40" onClick={() => setShowProviderResults(false)}></div>
                                            <motion.div
                                                initial={{ opacity: 0, y: 5 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: 5 }}
                                                className="absolute z-50 w-full mt-1 bg-white border border-gray-100 rounded-2xl shadow-xl overflow-hidden max-h-60 overflow-y-auto"
                                            >
                                                {providerResults.length > 0 ? (
                                                    <>
                                                        {providerResults.map((p, idx) => (
                                                            <button
                                                                key={`${p.numero_identificacion}-${idx}`}
                                                                type="button"
                                                                onClick={() => handleSelectProvider(p)}
                                                                className="w-full px-5 py-4 text-left hover:bg-slate-50 border-b border-slate-100 last:border-0 transition-colors flex flex-col gap-1"
                                                            >
                                                                <span className="text-base font-bold text-slate-800 line-clamp-1">{p.razon_social}</span>
                                                                <span className="text-sm text-slate-500 font-medium">NIT: {p.numero_identificacion}</span>
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
                                                                className="w-full py-3 text-sm font-bold text-[#254153] hover:bg-gray-50 transition-colors"
                                                            >
                                                                Cargar más...
                                                            </button>
                                                        )}
                                                    </>
                                                ) : (
                                                    <div className="px-5 py-6 text-sm text-gray-500 text-center font-medium">
                                                        {isSearchingProviders ? "Buscando..." : "No se encontraron proveedores. Asegúrate de digitar bien el nombre o NIT."}
                                                    </div>
                                                )}
                                            </motion.div>
                                        </>
                                    )}
                                </AnimatePresence>
                            </div>

                            {/* NIT (Auto-filled) */}
                            <div className="space-y-1.5 pt-2">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">NIT</label>
                                <div className="relative group">
                                    <Hash className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 group-focus-within:text-[#254153] transition-colors" />
                                    <input
                                        readOnly
                                        type="text"
                                        value={formData.nit}
                                        className="w-full h-14 pl-12 pr-4 bg-gray-100 border border-gray-100 rounded-2xl text-lg font-bold text-gray-500 cursor-not-allowed"
                                        placeholder="NIT (Automático)"
                                    />
                                    {isLookingUp && (
                                        <div className="absolute right-4 top-1/2 -translate-y-1/2">
                                            <Loader2 className="h-5 w-5 animate-spin text-[#254153]" />
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Responsable de Autorizar */}
                            <div className="space-y-1.5 pt-2 relative" ref={userDropdownRef}>
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1 flex items-center justify-between">
                                    <span>Responsable de Autorizar</span>
                                    {autoFilled && (
                                        <span className="text-[10px] text-emerald-600 bg-emerald-100/50 px-2.5 py-0.5 rounded-full font-black border border-emerald-200">✓ Asignado automáticamente</span>
                                    )}
                                </label>
                                <div className="relative group">
                                    <User className={`absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 transition-colors ${autoFilled ? 'text-emerald-500' : 'text-gray-400 group-focus-within:text-[#254153]'}`} />
                                    <input
                                        required
                                        type="text"
                                        value={userSearch}
                                        onChange={(e) => {
                                            setUserSearch(e.target.value);
                                            setAutoFilled(false);
                                            setFormData(prev => ({ ...prev, responsableEmail: "", responsableNombre: e.target.value }));
                                        }}
                                        className={`w-full h-14 pl-12 pr-10 border rounded-2xl text-base focus:outline-none focus:ring-4 transition-all font-bold text-[#254153] ${
                                            autoFilled ? 'bg-emerald-50/50 border-emerald-200 focus:ring-emerald-500/20 focus:border-emerald-500' : 'bg-gray-50 border-gray-200 focus:ring-[#254153]/10 focus:border-[#254153]'
                                        }`}
                                        placeholder="Buscar responsable por nombre o correo..."
                                    />
                                    {(isSearchingUsers || isLookingUp) && (
                                        <div className="absolute right-4 top-1/2 -translate-y-1/2">
                                            <Loader2 className="h-5 w-5 animate-spin text-[#254153]" />
                                        </div>
                                    )}
                                </div>
                                {formData.responsableEmail && (
                                    <p className="text-[12px] text-emerald-600 font-medium ml-1 mt-1">
                                        Se notificará a: <span className="font-bold">{formData.responsableEmail}</span>
                                    </p>
                                )}

                                {!autoFilled && userSearch && !formData.responsableEmail && !isSearchingUsers && (
                                    <p className="text-[10px] text-amber-600 font-bold ml-1 mt-1 flex items-start gap-1">
                                        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                                        Debes seleccionar una opción de la lista desplegable. Si no aparece, busca por otro nombre o correo.
                                    </p>
                                )}

                                <AnimatePresence>
                                    {userResults.length > 0 && (
                                        <motion.div
                                            initial={{ opacity: 0, y: 5 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: 5 }}
                                            className="absolute z-[110] w-full mt-1 bg-white border border-gray-100 rounded-2xl shadow-xl overflow-hidden max-h-56 overflow-y-auto custom-scrollbar"
                                        >
                                            {userResults.map((user) => (
                                                <button
                                                    key={user.email}
                                                    type="button"
                                                    onClick={() => {
                                                        setFormData(prev => ({ ...prev, responsableEmail: user.email, responsableNombre: user.name }));
                                                        setUserSearch(user.name);
                                                        setUserResults([]);
                                                    }}
                                                    className="w-full px-5 py-3 text-left hover:bg-gray-50 flex items-center justify-between border-b border-gray-50 last:border-0 transition-colors"
                                                >
                                                    <div>
                                                        <p className="text-sm font-bold text-[#254153]">{user.name}</p>
                                                        <p className="text-xs text-gray-500">{user.email}</p>
                                                    </div>
                                                </button>
                                            ))}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>

                            {/* Valor Total */}
                            <div className="space-y-1.5 pt-2">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">Valor Total</label>
                                <div className="relative group">
                                    <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 group-focus-within:text-[#254153] transition-colors" />
                                    <input
                                        required
                                        type="number"
                                        min="0"
                                        step="any"
                                        value={formData.valor}
                                        onChange={(e) => setFormData({ ...formData, valor: e.target.value })}
                                        className="w-full h-14 pl-12 pr-4 bg-white border border-gray-200 rounded-2xl text-lg focus:outline-none focus:ring-2 focus:ring-[#254153]/10 focus:border-[#254153] transition-all font-bold text-[#254153]"
                                        placeholder="Ej: 150000"
                                    />
                                </div>
                            </div>

                            {/* Archivo PDF */}
                            <div className="space-y-1.5 pt-2">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">Documento PDF</label>
                                <div 
                                    className={`relative border-2 border-dashed rounded-3xl p-8 flex flex-col items-center text-center space-y-3 transition-all cursor-pointer group
                                        ${file ? "border-[#254153]/50 bg-[#254153]/5" : "border-gray-200 bg-gray-50 hover:bg-gray-100 hover:border-gray-300"}`}
                                >
                                    <input
                                        required
                                        type="file"
                                        accept=".pdf"
                                        onChange={(e) => setFile(e.target.files?.[0] || null)}
                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                    />
                                    {file ? (
                                        <div className="flex flex-col items-center gap-2 w-full">
                                            <div className="h-12 w-12 rounded-2xl bg-[#254153] flex items-center justify-center shrink-0 shadow-lg shadow-[#254153]/20">
                                                <FileText className="h-6 w-6 text-white" />
                                            </div>
                                            <div className="text-center overflow-hidden w-full px-4">
                                                <p className="text-sm font-bold text-[#254153] truncate">{file.name}</p>
                                                <p className="text-xs text-gray-500 font-medium mt-0.5">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                                            </div>
                                            <p className="text-xs text-[#254153] font-bold underline mt-2 relative z-20">Haz clic para cambiar el archivo</p>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="h-16 w-16 rounded-3xl bg-white border border-gray-100 shadow-sm flex items-center justify-center group-hover:scale-110 transition-transform">
                                                <Upload className="h-8 w-8 text-gray-400 group-hover:text-[#254153] transition-colors" />
                                            </div>
                                            <div>
                                                <p className="text-base font-bold text-[#254153]">Selecciona o arrastra el PDF aquí</p>
                                                <p className="text-sm text-gray-400 font-medium mt-1">Peso máximo permitido: 10MB</p>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* Anexos (Opcional) */}
                            <div className="space-y-1.5 pt-2">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">Anexos / Archivos Adjuntos (Opcional)</label>
                                <div 
                                    className={`relative border-2 border-dashed rounded-3xl p-6 flex flex-col items-center text-center space-y-3 transition-all cursor-pointer group
                                        ${attachments.length > 0 ? "border-[#254153]/50 bg-[#254153]/5" : "border-gray-200 bg-gray-50 hover:bg-gray-100 hover:border-gray-300"}`}
                                >
                                    <input
                                        type="file"
                                        multiple
                                        onChange={(e) => {
                                            if (e.target.files) {
                                                setAttachments(prev => [...prev, ...Array.from(e.target.files as FileList)]);
                                            }
                                        }}
                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                    />
                                    {attachments.length > 0 ? (
                                        <div className="flex flex-col gap-2 w-full text-left relative z-20">
                                            {attachments.map((att, i) => (
                                                <div key={i} className="flex items-center justify-between bg-white p-3 rounded-xl border border-gray-100 shadow-sm">
                                                    <div className="flex items-center gap-3 overflow-hidden">
                                                        <FileText className="h-5 w-5 text-[#254153] shrink-0" />
                                                        <div className="overflow-hidden">
                                                            <p className="text-sm font-bold text-[#254153] truncate">{att.name}</p>
                                                            <p className="text-xs text-gray-500 font-medium">{(att.size / 1024 / 1024).toFixed(2)} MB</p>
                                                        </div>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setAttachments(prev => prev.filter((_, index) => index !== i));
                                                        }}
                                                        className="p-2 hover:bg-rose-50 text-gray-400 hover:text-rose-500 rounded-lg transition-colors"
                                                    >
                                                        <AlertCircle className="h-4 w-4" />
                                                    </button>
                                                </div>
                                            ))}
                                            <p className="text-xs text-[#254153] font-bold underline mt-2 text-center">Haz clic o arrastra para añadir más archivos</p>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="h-14 w-14 rounded-2xl bg-white border border-gray-100 shadow-sm flex items-center justify-center group-hover:scale-110 transition-transform">
                                                <Upload className="h-6 w-6 text-gray-400 group-hover:text-[#254153] transition-colors" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-bold text-[#254153]">Selecciona o arrastra anexos adicionales aquí</p>
                                                <p className="text-xs text-gray-400 font-medium mt-1">Puedes subir múltiples archivos</p>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>

                        <Button
                            type="submit"
                            disabled={isLoading || !file || !formData.nit || !formData.proveedor || !formData.valor}
                            className="w-full h-14 rounded-2xl bg-[#254153] hover:bg-[#1a2f3d] text-white font-black text-lg shadow-xl shadow-[#254153]/20 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="h-6 w-6 animate-spin" />
                                    Enviando documento...
                                </>
                            ) : (
                                <>
                                    Enviar Documento Soporte
                                    <ArrowRight className="h-5 w-5" />
                                </>
                            )}
                        </Button>
                    </form>
                </div>
            </motion.div>
            
            <p className="mt-8 text-sm text-gray-400 font-medium">
                Plataforma segura de recepción de documentos Firplak
            </p>
        </div>
    );
}
