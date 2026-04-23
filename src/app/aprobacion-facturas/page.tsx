"use client";

import { useEffect, useState, useMemo } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { supabase } from "@/lib/supabaseClient";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Bell, RefreshCw, Paperclip, ChevronLeft, ChevronRight, Loader2, FileText, Edit2, User, X, Check, Copy, ShieldCheck, DollarSign, CloudUpload } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Switch";
import { CreateInvoiceModal } from "@/components/modals/CreateInvoiceModal";
import { useSidebar } from "@/context/SidebarContext";
import { Menu } from "lucide-react";


interface SharePointInvoice {
    id: string;
    Proveedor?: string;
    Nro_Factura?: string;
    Nit?: string;
    Monto?: string;
    Responsable_de_Autorizar?: string;
    Aprobacion_Doliente?: string;
    Gestion_Contabilidad?: string;
    Consecutivo?: string;
    OData__RegistrationDate?: string;
    Created?: string;
    Documento_x0020_PDF?: string;
    FechaAprobacion?: string;
    [key: string]: any;
}

export default function InvoicesPage() {
    const { toggleSidebar } = useSidebar();
    const [invoices, setInvoices] = useState<SharePointInvoice[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [activeTab, setActiveTab] = useState<'pending' | 'processed'>('pending');
    const [selectedInvoice, setSelectedInvoice] = useState<SharePointInvoice | null>(null);
    const [selectedResponsable, setSelectedResponsable] = useState<string>("all");
    const [isEditingResponsible, setIsEditingResponsible] = useState(false);
    const [userSearchQuery, setUserSearchQuery] = useState("");
    const [userSearchResults, setUserSearchResults] = useState<any[]>([]);
    const [isSearchingUsers, setIsSearchingUsers] = useState(false);
    const [isUpdatingResponsible, setIsUpdatingResponsible] = useState(false);
    const [pendingResponsibleUser, setPendingResponsibleUser] = useState<any>(null);
    const [isProvidersSidebarOpen, setIsProvidersSidebarOpen] = useState(false);
    const [providers, setProviders] = useState<any[]>([]);
    const [providersSearch, setProvidersSearch] = useState("");
    const [loadingProviders, setLoadingProviders] = useState(false);
    const [syncingId, setSyncingId] = useState<string | null>(null);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);


    const [columnFilters, setColumnFilters] = useState({
        invoice: "",
        provider: "",
        amount: "",
        responsible: "",
        status: "",
        contabilidad: ""
    });

    // Opciones para los filtros dropdown
    const filterOptions = useMemo(() => {
        const options = {
            invoices: new Set<string>(),
            providers: new Set<string>(),
            responsibles: new Set<string>(),
            statuses: new Set<string>(),
            contabilidades: new Set<string>(),
        };

        invoices.forEach(inv => {
            if (inv.Nro_Factura) options.invoices.add(inv.Nro_Factura);
            if (inv.Proveedor) options.providers.add(inv.Proveedor);
            if (inv.Responsable_de_Autorizar) options.responsibles.add(inv.Responsable_de_Autorizar);
            if (inv.Aprobacion_Doliente) options.statuses.add(inv.Aprobacion_Doliente);
            if (inv.Gestion_Contabilidad) options.contabilidades.add(inv.Gestion_Contabilidad);
        });

        return {
            invoices: Array.from(options.invoices).sort(),
            providers: Array.from(options.providers).sort(),
            responsibles: Array.from(options.responsibles).sort(),
            statuses: Array.from(options.statuses).sort(),
            contabilidades: Array.from(options.contabilidades).sort(),
        };
    }, [invoices]);

    const fetchInvoices = async (refresh: boolean = false) => {
        try {
            setLoading(true);
            
            // ETAPA 1: Carga rápida de las primeras 500 facturas
            const params = new URLSearchParams();
            if (refresh) params.append('refresh', 'true');
            if (!refresh) params.append('limit', '500');
            
            const quickResponse = await fetch(`/api/sharepoint/all?${params.toString()}`);
            const quickData = await quickResponse.json();

            if (quickData.success) {
                const normalize = (items: any[]) => items.map((item: any) => {
                    let documentInfo = null;
                    if (item.documentos || item.fp) {
                        documentInfo = {
                            fileName: "Factura.pdf",
                            serverRelativeUrl: item.documentos || item.fp
                        };
                    }
                    return {
                        ...item,
                        Monto: item["Valor total"] ?? item.Valor_total ?? item.Valortotal ?? item.Monto ?? 0,
                        Nit: item.Nit || item.Title || "N/A",
                        Proveedor: item.Proveedor || "N/A",
                        Responsable_de_Autorizar: item.Responsable_de_Autorizar || "Sin asignar",
                        FechaAprobacion: item.FechaAprobacion || null,
                        documentInfo,
                        Attachments: item.Attachments || !!item.documentos || !!item.fp
                    };
                });

                setInvoices(normalize(quickData.items));
                setLoading(false); // Liberamos la UI rápido

                // ETAPA 2: Si no es un refresh forzado y vinieron del cache, traemos el resto en segundo plano
                if (!refresh && quickData.source === 'cache') {
                    console.log("Fetching rest of invoices in background...");
                    const fullResponse = await fetch(`/api/sharepoint/all?offset=500`);
                    const fullData = await fullResponse.json();
                    if (fullData.success) {
                        setInvoices(prev => {
                            const newItems = normalize(fullData.items);
                            const combined = [...prev];
                            newItems.forEach(item => {
                                if (!combined.find(c => c.id === item.id)) combined.push(item);
                            });
                            return combined;
                        });
                    }
                }
            }
        } catch (error) {
            console.error("Error fetching invoices:", error);
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchInvoices();
    }, []);

    useEffect(() => {
        setPendingResponsibleUser(null);
        setIsEditingResponsible(false);
    }, [selectedInvoice]);

    useEffect(() => {
        if (isProvidersSidebarOpen) {
            fetchProviders();
        }
    }, [isProvidersSidebarOpen]);

    useEffect(() => {
        const timer = setTimeout(async () => {
            if (userSearchQuery.length >= 3) {
                setIsSearchingUsers(true);
                try {
                    const res = await fetch(`/api/users/search?q=${encodeURIComponent(userSearchQuery)}`);
                    const data = await res.json();
                    setUserSearchResults(data.users || []);
                } catch (error) {
                    console.error("Error searching users:", error);
                } finally {
                    setIsSearchingUsers(false);
                }
            } else {
                setUserSearchResults([]);
            }
        }, 500);

        return () => clearTimeout(timer);
    }, [userSearchQuery]);

    const handleUpdateResponsible = async () => {
        if (!selectedInvoice || !pendingResponsibleUser) return;

        setIsUpdatingResponsible(true);
        try {
            const res = await fetch("/api/sharepoint/update-responsible", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    itemId: selectedInvoice.id,
                    userEmail: pendingResponsibleUser.email,
                    userName: pendingResponsibleUser.name
                })
            });

            if (res.ok) {
                // Update local state
                const updatedInvoices = invoices.map(inv =>
                    inv.id === selectedInvoice.id
                        ? { ...inv, Responsable_de_Autorizar: pendingResponsibleUser.name }
                        : inv
                );
                setInvoices(updatedInvoices);
                setSelectedInvoice({ ...selectedInvoice, Responsable_de_Autorizar: pendingResponsibleUser.name });
                setIsEditingResponsible(false);
                setPendingResponsibleUser(null);
                setUserSearchQuery("");
                alert("Responsable actualizado correctamente");
            } else {
                const data = await res.json();
                alert(`Error al actualizar: ${data.error}`);
            }
        } catch (error) {
            console.error("Error updating responsible:", error);
            alert("Error de conexión al actualizar el responsable");
        } finally {
            setIsUpdatingResponsible(false);
        }
    };



    const fetchProviders = async (search?: string) => {
        setLoadingProviders(true);
        try {
            let query = supabase
                .from('proveedores')
                .select('id, razon_social, numero_identificacion, aprobacion_automatica, valor_de_referencia, porcentaje_desviacion')
                .order('razon_social', { ascending: true });

            if (search) {
                query = query.or(`razon_social.ilike.%${search}%,numero_identificacion.ilike.%${search}%`);
            }
            
            // Limitamos a 500 para que sea rápido, si busca algo específico lo encontrará
            const { data, error } = await query.limit(500);

            if (error) throw error;

            if (search) {
                // Si es búsqueda, reemplazamos los resultados
                setProviders(data || []);
            } else {
                // Si es carga inicial, combinamos con los que ya tienen aprobación automática activos
                // (Para que no desaparezcan de la vista los que ya configuró)
                setProviders(prev => {
                    const activeOnes = prev.filter(p => p.aprobacion_automatica);
                    const newOnes = data || [];
                    const combined = [...activeOnes];
                    
                    newOnes.forEach(p => {
                        if (!combined.find(c => c.id === p.id)) {
                            combined.push(p);
                        }
                    });
                    return combined;
                });
            }
        } catch (error) {
            console.error('Error fetching providers:', error);
        } finally {
            setLoadingProviders(false);
        }
    };

    // Efecto para búsqueda con debounce
    useEffect(() => {
        if (!isProvidersSidebarOpen) return;

        const timer = setTimeout(() => {
            if (providersSearch.length >= 2) {
                fetchProviders(providersSearch);
            } else if (providersSearch.length === 0) {
                fetchProviders();
            }
        }, 500);

        return () => clearTimeout(timer);
    }, [providersSearch, isProvidersSidebarOpen]);

    const toggleProviderAutoApproval = async (id: string, currentValue: boolean) => {
        const newValue = !currentValue;
        setProviders(prev => prev.map(p => p.id === id ? { ...p, aprobacion_automatica: newValue } : p));
        try {
            const { error } = await supabase
                .from('proveedores')
                .update({ aprobacion_automatica: newValue })
                .eq('id', id);
            if (error) throw error;
        } catch (error) {
            console.error('Error updating provider:', error);
            setProviders(prev => prev.map(p => p.id === id ? { ...p, aprobacion_automatica: currentValue } : p));
            alert('Error al actualizar el proveedor.');
        }
    };

    const updateProviderField = async (id: string, field: string, value: any) => {
        setProviders(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));
        try {
            const { error } = await supabase
                .from('proveedores')
                .update({ [field]: value })
                .eq('id', id);
            if (error) throw error;
        } catch (error) {
            console.error(`Error updating provider ${field}:`, error);
            alert('Error al guardar el cambio.');
        }
    };

    const handleCopyLink = (inv: SharePointInvoice) => {
        const url = `${window.location.origin}/externo/factura/${inv.id}`;
        navigator.clipboard.writeText(url).then(() => {
            alert("Enlace copiado al portapapeles");
        }).catch(err => {
            console.error("Error al copiar:", err);
            alert("No se pudo copiar el enlace");
        });
    };

    const handleManualSapSync = async (inv: SharePointInvoice) => {
        if (!confirm(`¿Estás seguro de crear un documento preliminar en SAP para la factura ${inv.Nro_Factura}?`)) return;
        
        setSyncingId(inv.id);
        try {
            const res = await fetch("/api/sap/manual-draft", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ invoiceId: inv.id })
            });

            const data = await res.json();
            if (data.success) {
                alert(`✅ Preliminar SAP creado exitosamente\nDocEntry: ${data.sap.draftId}`);
            } else {
                alert(`❌ Error al crear preliminar SAP: ${data.error}`);
            }
        } catch (error) {
            console.error("Error manual SAP sync:", error);
            alert("❌ Error de conexión al sincronizar con SAP. Revisa la consola.");
        } finally {
            setSyncingId(null);
        }
    };

    const formatCurrency = (value: any) => {
        if (value === undefined || value === null || value === "") return "$ 0,00";

        let numericValue: number;
        if (typeof value === "number") {
            numericValue = value;
        } else {
            const cleaned = value.toString().replace(/[^\d.,-]/g, "").replace(",", ".");
            numericValue = parseFloat(cleaned);
        }

        if (isNaN(numericValue)) return value.toString();

        return new Intl.NumberFormat("es-CO", {
            style: "currency",
            currency: "COP",
            minimumFractionDigits: 2
        }).format(numericValue);
    };

    const getStatusStyles = (status: string | undefined) => {
        if (!status) return "bg-gray-100 text-gray-600 border-gray-200";
        const s = status.toLowerCase();
        if (s.includes("aprobado") || s.includes("procesado")) return "bg-emerald-50 text-emerald-700 border-emerald-100";
        if (s.includes("rechazado")) return "bg-rose-50 text-rose-700 border-rose-100";
        return "bg-amber-50 text-amber-700 border-amber-100";
    };

    const isPending = (inv: SharePointInvoice) => {
        const state = (inv.Aprobacion_Doliente || "Pendiente").toLowerCase();
        return state.includes("pendiente") || state.includes("por aprobar");
    };

    const isProcessed = (inv: SharePointInvoice) => {
        const state = (inv.Aprobacion_Doliente || "").toLowerCase();
        const contabilidad = (inv.Gestion_Contabilidad || "").toLowerCase();
        return state.includes("aprobado") || state.includes("rechazado") || contabilidad.includes("procesado");
    };

    const filteredInvoices = invoices.filter(inv => {
        const matchesSearch = !searchTerm ||
            inv.Nro_Factura?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            inv.Proveedor?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            inv.Nit?.toLowerCase().includes(searchTerm.toLowerCase());

        const matchesTab = activeTab === 'pending' ? isPending(inv) : isProcessed(inv);
        const matchesResponsable = selectedResponsable === "all" || inv.Responsable_de_Autorizar === selectedResponsable;

        // Filtros por columna (Excel-style)
        const matchesColInvoice = !columnFilters.invoice || inv.Nro_Factura?.toLowerCase().includes(columnFilters.invoice.toLowerCase());
        const matchesColProvider = !columnFilters.provider || 
            inv.Proveedor?.toLowerCase().includes(columnFilters.provider.toLowerCase()) || 
            inv.Nit?.toLowerCase().includes(columnFilters.provider.toLowerCase());
        const matchesColAmount = !columnFilters.amount || String(inv.Monto).includes(columnFilters.amount);
        const matchesColResponsible = !columnFilters.responsible || inv.Responsable_de_Autorizar?.toLowerCase().includes(columnFilters.responsible.toLowerCase());
        const matchesColStatus = !columnFilters.status || (inv.Aprobacion_Doliente || "Pendiente").toLowerCase().includes(columnFilters.status.toLowerCase());
        const matchesColContabilidad = !columnFilters.contabilidad || (inv.Gestion_Contabilidad || "Pendiente").toLowerCase().includes(columnFilters.contabilidad.toLowerCase());

        return matchesSearch && matchesTab && matchesResponsable && 
               matchesColInvoice && matchesColProvider && matchesColAmount && 
               matchesColResponsible && matchesColStatus && matchesColContabilidad;
    });

    return (
        <div className="min-h-screen bg-[#f8fafc] flex">
            <Sidebar />

            <main 
                className="flex-1 relative bg-[#f8fafc] transition-all duration-300 ease-in-out"
                style={{ marginLeft: 'var(--sidebar-width, 256px)' }}
            >
                {/* Header Superior */}
                <header className="h-20 bg-white/80 backdrop-blur-xl border-b border-gray-100 flex items-center justify-between px-8 sticky top-0 z-10">
                    <div className="flex items-center gap-4">
                        <button 
                            onClick={toggleSidebar}
                            className="p-2 hover:bg-gray-100 rounded-xl transition-colors text-[#254153]"
                        >
                            <Menu className="h-6 w-6" />
                        </button>
                        <div className="flex items-center gap-3">
                            <div className="h-8 w-1.5 bg-[#254153] rounded-full" />
                            <h1 className="text-xl font-bold text-gray-800 tracking-tight">Aprobación de Facturas</h1>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="relative group">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 group-focus-within:text-[#254153] transition-colors" />
                            <input
                                type="text"
                                placeholder="Buscar facturas..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="h-10 pl-10 pr-4 rounded-xl bg-gray-50 border border-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-[#254153]/10 focus:bg-white w-64 transition-all"
                            />
                        </div>

                        <select
                            value={selectedResponsable}
                            onChange={(e) => setSelectedResponsable(e.target.value)}
                            className="h-10 px-4 rounded-xl bg-gray-50 border border-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-[#254153]/10 focus:bg-white transition-all text-gray-600 font-bold min-w-[200px]"
                        >
                            <option value="all">Todos los Responsables</option>
                            {Array.from(new Set(invoices.map(i => i.Responsable_de_Autorizar).filter(Boolean))).sort().map(resp => (
                                <option key={resp} value={resp}>{resp}</option>
                            ))}
                        </select>

                        <button className="h-10 w-10 flex items-center justify-center rounded-xl bg-gray-50 hover:bg-gray-100 border border-gray-100 transition-colors relative">
                            <Bell className="h-5 w-5 text-gray-600" />
                            <span className="absolute top-2.5 right-2.5 h-2 w-2 bg-rose-500 rounded-full border-2 border-white" />
                        </button>
                    </div>
                </header>

                <div className="p-8 max-w-[1600px] mx-auto space-y-8">
                    {/* Título y Resumen */}
                    <div className="flex justify-between items-end">
                        <motion.div
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                        >
                            <h2 className="text-3xl font-extrabold text-[#254153]">Gestión de Facturas</h2>
                            <p className="text-gray-500 mt-1 font-medium flex items-center gap-2">
                                <span className="h-2 w-2 bg-blue-500 rounded-full animate-pulse" />
                                Datos cargados directamente desde SharePoint Online
                            </p>
                        </motion.div>

                        <div className="flex gap-2">
                            <button
                                onClick={() => setIsProvidersSidebarOpen(true)}
                                className="h-10 px-4 flex items-center gap-2 rounded-full bg-[#254153]/5 text-[#254153] hover:bg-[#254153]/10 transition-colors text-xs font-bold"
                            >
                                <ShieldCheck className="h-4 w-4" />
                                <span className="hidden lg:inline">Aprobación Automática</span>
                            </button>
                            <Button
                                onClick={() => setIsCreateModalOpen(true)}
                                className="bg-[#254153] text-white rounded-xl h-11 px-6 font-black hover:bg-[#1a2f3d] transition-all shadow-lg shadow-blue-900/10 flex items-center gap-2"
                            >
                                <CloudUpload className="h-4 w-4" />
                                Crear Factura
                            </Button>
                            <Button
                                variant="outline"

                                onClick={() => fetchInvoices(true)}
                                disabled={loading}
                                className="bg-white border-gray-100 rounded-xl h-11 px-4 text-gray-600 font-bold hover:bg-gray-50 transition-all shadow-sm"
                            >
                                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                                Actualizar
                            </Button>
                        </div>
                    </div>

                    {/* Indicadores / Estadísticas */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {[
                            {
                                label: "Total Facturas",
                                value: invoices.length,
                                icon: Paperclip,
                                color: "bg-blue-500",
                                bg: "bg-blue-50"
                            },
                            {
                                label: "Pendientes por Aprobar",
                                value: invoices.filter(isPending).length,
                                icon: RefreshCw,
                                color: "bg-amber-500",
                                bg: "bg-amber-50"
                            },
                            {
                                label: "Histórico Procesadas",
                                value: invoices.filter(isProcessed).length,
                                icon: Bell,
                                color: "bg-emerald-500",
                                bg: "bg-emerald-50"
                            }
                        ].map((stat, i) => (
                            <motion.div
                                key={stat.label}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: i * 0.1 }}
                                className="bg-white p-6 rounded-3xl border border-gray-100 shadow-[0_8px_30px_rgb(0,0,0,0.02)] flex items-center gap-5 group hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-all cursor-default"
                            >
                                <div className={`${stat.bg} p-4 rounded-2xl group-hover:scale-110 transition-transform duration-300`}>
                                    <div className={`h-6 w-6 ${stat.color} rounded-lg flex items-center justify-center`}>
                                        <stat.icon className="h-4 w-4 text-white" />
                                    </div>
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">{stat.label}</p>
                                    <p className="text-3xl font-black text-[#254153] mt-1">{loading ? "..." : stat.value}</p>
                                </div>
                            </motion.div>
                        ))}
                    </div>

                    {/* Tabs de Vistas */}
                    <div className="flex items-center gap-2 bg-gray-100/50 p-1.5 rounded-2xl w-fit border border-gray-100">
                        <button
                            onClick={() => setActiveTab('pending')}
                            className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 flex items-center gap-2 ${activeTab === 'pending'
                                ? "bg-[#254153] text-white shadow-lg shadow-blue-900/10"
                                : "text-gray-500 hover:text-gray-700 hover:bg-white/50"}`}
                        >
                            <RefreshCw className={`h-4 w-4 ${activeTab === 'pending' ? 'animate-spin-slow' : ''}`} />
                            Por Aprobar
                            {invoices.filter(isPending).length > 0 && (
                                <span className={`px-2 py-0.5 rounded-md text-[10px] ${activeTab === 'pending' ? "bg-white/20" : "bg-gray-200"}`}>
                                    {invoices.filter(isPending).length}
                                </span>
                            )}
                        </button>
                        <button
                            onClick={() => setActiveTab('processed')}
                            className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 flex items-center gap-2 ${activeTab === 'processed'
                                ? "bg-[#254153] text-white shadow-lg shadow-blue-900/10"
                                : "text-gray-500 hover:text-gray-700 hover:bg-white/50"}`}
                        >
                            <Bell className="h-4 w-4" />
                            Histórico
                            {invoices.filter(isProcessed).length > 0 && (
                                <span className={`px-2 py-0.5 rounded-md text-[10px] ${activeTab === 'processed' ? "bg-white/20" : "bg-gray-200"}`}>
                                    {invoices.filter(isProcessed).length}
                                </span>
                            )}
                        </button>
                    </div>

                    {/* Tabla de Facturas */}
                    <div className="bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 overflow-hidden">
                        <div className="overflow-x-auto min-h-[400px]">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-gray-50/50 border-b border-gray-100">
                                        <th className="px-6 py-5 text-[11px] font-bold text-gray-400 uppercase tracking-widest">Factura</th>
                                        <th className="px-6 py-5 text-[11px] font-bold text-gray-400 uppercase tracking-widest">Proveedor</th>
                                        <th className="px-6 py-5 text-[11px] font-bold text-gray-400 uppercase tracking-widest text-right">Valor total</th>
                                        <th className="px-6 py-5 text-[11px] font-bold text-gray-400 uppercase tracking-widest">Responsable</th>
                                        <th className="px-6 py-5 text-[11px] font-bold text-gray-400 uppercase tracking-widest">Estado</th>
                                        <th className="px-6 py-5 text-[11px] font-bold text-gray-400 uppercase tracking-widest">G. Contabilidad</th>
                                        <th className="px-6 py-5 text-[11px] font-bold text-gray-400 uppercase tracking-widest">Fecha Aprobación</th>
                                        <th className="px-6 py-5 text-[11px] font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">Datos adjuntos</th>
                                        <th className="px-6 py-5 text-[11px] font-bold text-gray-400 uppercase tracking-widest text-right">Acciones</th>
                                    </tr>
                                    <tr className="bg-white border-b border-gray-50">
                                        <td className="px-3 py-2">
                                            <input 
                                                type="text" 
                                                list="list-invoice"
                                                placeholder="Filtrar..."
                                                className="w-full px-2 py-1 text-[10px] border border-gray-100 rounded focus:border-blue-300 outline-none"
                                                value={columnFilters.invoice}
                                                onChange={(e) => setColumnFilters({...columnFilters, invoice: e.target.value})}
                                            />
                                            <datalist id="list-invoice">
                                                {filterOptions.invoices.map(opt => <option key={opt} value={opt} />)}
                                            </datalist>
                                        </td>
                                        <td className="px-3 py-2">
                                            <input 
                                                type="text" 
                                                list="list-provider"
                                                placeholder="Filtrar..."
                                                className="w-full px-2 py-1 text-[10px] border border-gray-100 rounded focus:border-blue-300 outline-none"
                                                value={columnFilters.provider}
                                                onChange={(e) => setColumnFilters({...columnFilters, provider: e.target.value})}
                                            />
                                            <datalist id="list-provider">
                                                {filterOptions.providers.map(opt => <option key={opt} value={opt} />)}
                                            </datalist>
                                        </td>
                                        <td className="px-3 py-2">
                                            <input 
                                                type="text" 
                                                placeholder="Filtrar..."
                                                className="w-full px-2 py-1 text-[10px] border border-gray-100 rounded focus:border-blue-300 outline-none"
                                                value={columnFilters.amount}
                                                onChange={(e) => setColumnFilters({...columnFilters, amount: e.target.value})}
                                            />
                                        </td>
                                        <td className="px-3 py-2">
                                            <input 
                                                type="text" 
                                                list="list-responsible"
                                                placeholder="Filtrar..."
                                                className="w-full px-2 py-1 text-[10px] border border-gray-100 rounded focus:border-blue-300 outline-none"
                                                value={columnFilters.responsible}
                                                onChange={(e) => setColumnFilters({...columnFilters, responsible: e.target.value})}
                                            />
                                            <datalist id="list-responsible">
                                                {filterOptions.responsibles.map(opt => <option key={opt} value={opt} />)}
                                            </datalist>
                                        </td>
                                        <td className="px-3 py-2">
                                            <input 
                                                type="text" 
                                                list="list-status"
                                                placeholder="Filtrar..."
                                                className="w-full px-2 py-1 text-[10px] border border-gray-100 rounded focus:border-blue-300 outline-none"
                                                value={columnFilters.status}
                                                onChange={(e) => setColumnFilters({...columnFilters, status: e.target.value})}
                                            />
                                            <datalist id="list-status">
                                                {filterOptions.statuses.map(opt => <option key={opt} value={opt} />)}
                                            </datalist>
                                        </td>
                                        <td className="px-3 py-2">
                                            <input 
                                                type="text" 
                                                list="list-contabilidad"
                                                placeholder="Filtrar..."
                                                className="w-full px-2 py-1 text-[10px] border border-gray-100 rounded focus:border-blue-300 outline-none"
                                                value={columnFilters.contabilidad}
                                                onChange={(e) => setColumnFilters({...columnFilters, contabilidad: e.target.value})}
                                            />
                                            <datalist id="list-contabilidad">
                                                {filterOptions.contabilidades.map(opt => <option key={opt} value={opt} />)}
                                            </datalist>
                                        </td>
                                        <td className="px-3 py-2" />
                                        <td className="px-3 py-2" />
                                        <td className="px-3 py-2" />
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    <AnimatePresence mode="popLayout">
                                        {loading ? (
                                            Array.from({ length: 8 }).map((_, i) => (
                                                <tr key={`skeleton-${i}`} className="animate-pulse">
                                                    <td className="px-6 py-5"><div className="h-4 bg-gray-100 rounded w-20" /></td>
                                                    <td className="px-6 py-5"><div className="h-4 bg-gray-100 rounded w-40" /></td>
                                                    <td className="px-6 py-5"><div className="h-4 bg-gray-100 rounded w-24 ml-auto" /></td>
                                                    <td className="px-6 py-5"><div className="h-4 bg-gray-100 rounded w-32" /></td>
                                                    <td className="px-6 py-5"><div className="h-7 bg-gray-100 rounded-full w-24" /></td>
                                                    <td className="px-6 py-5"><div className="h-8 bg-gray-100 rounded-lg w-24" /></td>
                                                    <td className="px-6 py-5"><div className="h-4 bg-gray-100 rounded w-28" /></td>
                                                    <td className="px-6 py-5 text-right"><div className="h-8 bg-gray-100 rounded-lg w-16 ml-auto" /></td>
                                                </tr>
                                            ))
                                        ) : filteredInvoices.length === 0 ? (
                                            <tr>
                                                <td colSpan={8} className="px-6 py-20 text-center">
                                                    <div className="flex flex-col items-center gap-3 opacity-30">
                                                        <Search className="h-12 w-12 text-[#254153]" />
                                                        <p className="text-lg font-bold text-[#254153]">No se encontraron resultados</p>
                                                    </div>
                                                </td>
                                            </tr>
                                        ) : (
                                            filteredInvoices.map((inv, idx) => (
                                                <motion.tr
                                                    initial={{ opacity: 0, y: 10 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    transition={{ delay: idx * 0.03 }}
                                                    key={inv.id}
                                                    className="hover:bg-[#f8fafc] transition-colors group"
                                                >
                                                    <td className="px-6 py-5">
                                                        <div className="font-bold text-[#254153] leading-none">{inv.Nro_Factura || "S/N"}</div>
                                                        <div className="text-[10px] text-gray-400 mt-1 font-medium tracking-tight">REF: {inv.id}</div>
                                                    </td>
                                                    <td className="px-6 py-5">
                                                        <div className="text-sm font-bold text-gray-800">{inv.Proveedor || "N/A"}</div>
                                                        <div className="text-[11px] text-gray-500 mt-0.5 font-medium">NIT: {inv.Nit || "N/A"}</div>
                                                    </td>
                                                    <td className="px-6 py-5 text-right px-10">
                                                        <div className="text-sm font-extrabold text-[#254153]">{formatCurrency(inv.Monto)}</div>
                                                    </td>
                                                    <td className="px-6 py-5">
                                                        <div className="text-xs font-semibold text-gray-600">{inv.Responsable_de_Autorizar || "Sin asignar"}</div>
                                                        <div className="text-[10px] text-gray-400 font-medium">
                                                            {inv.Created ? new Date(inv.Created).toLocaleDateString() : ""}
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-5">
                                                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-[10px] font-bold border ${getStatusStyles(inv.Aprobacion_Doliente)}`}>
                                                            {inv.Aprobacion_Doliente || "Pendiente"}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-5">
                                                        <span className="text-[10px] font-bold text-gray-600 uppercase tracking-tight">
                                                            {inv.Gestion_Contabilidad || "Pendiente"}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-5">
                                                        <div className="text-[10px] font-bold text-gray-500 uppercase tracking-tight">
                                                            {inv.FechaAprobacion ? new Date(inv.FechaAprobacion).toLocaleString() : "Sin fecha"}
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-5">
                                                        {(inv.documentInfo || inv.Attachments) ? (
                                                            <a
                                                                href={`/api/sharepoint/attachment-redirect?itemId=${inv.id}`}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-all border border-blue-100/50"
                                                                title="Ver Documento Adjunto"
                                                            >
                                                                <FileText className="h-3.5 w-3.5" />
                                                                <span className="text-[10px] font-black uppercase tracking-tight">Ver Adjunto</span>
                                                            </a>
                                                        ) : (
                                                            <span className="text-[10px] text-gray-300 font-medium italic">Sin adjuntos</span>
                                                        )}
                                                    </td>
                                                    <td className="px-6 py-5 text-right">
                                                        <div className="flex items-center justify-end gap-2">
                                                                <Button
                                                                    variant="outline"
                                                                    onClick={() => handleCopyLink(inv)}
                                                                    className="h-8 w-8 p-0 text-gray-400 border-gray-100 hover:bg-gray-50 bg-white rounded-lg transition-all shadow-sm flex items-center justify-center"
                                                                    title="Copiar Link Público"
                                                                >
                                                                    <Copy className="h-3.5 w-3.5" />
                                                                </Button>
                                                                <Button
                                                                    variant="outline"
                                                                    onClick={() => handleManualSapSync(inv)}
                                                                    disabled={syncingId === inv.id}
                                                                    className="h-8 w-8 p-0 text-gray-400 border-gray-100 hover:bg-emerald-50 hover:text-emerald-600 bg-white rounded-lg transition-all shadow-sm flex items-center justify-center disabled:opacity-50"
                                                                    title="Sincronizar con SAP Manualmente"
                                                                >
                                                                    {syncingId === inv.id ? (
                                                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                                    ) : (
                                                                        <CloudUpload className="h-3.5 w-3.5" />
                                                                    )}
                                                                </Button>
                                                            <Button
                                                                variant="outline"
                                                                onClick={() => setSelectedInvoice(inv)}
                                                                className="h-8 w-8 p-0 text-gray-400 border-gray-100 hover:bg-gray-50 bg-white rounded-lg transition-all shadow-sm flex items-center justify-center"
                                                                title="Ver Detalle"
                                                            >
                                                                <Search className="h-3.5 w-3.5" />
                                                            </Button>
                                                        </div>
                                                    </td>
                                                </motion.tr>
                                            ))
                                        )}
                                    </AnimatePresence>
                                </tbody>
                            </table>
                        </div>
                        {hasMore && invoices.length > 0 && !loading && (
                            <div className="p-4 border-t border-gray-100 flex justify-center">
                                <Button
                                    variant="outline"
                                    className="bg-white border-gray-200 text-gray-600 hover:bg-gray-50 font-medium rounded-xl h-10 px-6"
                                    onClick={() => fetchInvoices(false)}
                                    disabled={loadingMore}
                                >
                                    {loadingMore ? (
                                        <>
                                            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                                            Cargando más...
                                        </>
                                    ) : (
                                        'Cargar más facturas'
                                    )}
                                </Button>
                            </div>
                        )}
                    </div>

                    {/* Paginación - Eliminada para carga completa */}
                    {!loading && filteredInvoices.length > 0 && (
                        <div className="flex items-center justify-between pt-4">
                            <div className="text-sm text-gray-400 font-medium italic">
                                Mostrando <span className="text-[#254153] font-bold">{filteredInvoices.length}</span> registros de {activeTab === 'pending' ? 'pestaña Por Aprobar' : 'pestaña Histórico'}
                            </div>
                        </div>
                    )}
                </div>

                {/* Invoice Details Modal */}
                <AnimatePresence>
                    {isModalOpen && selectedInvoice && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-6">
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                onClick={() => setIsModalOpen(false)}
                                className="absolute inset-0 bg-[#254153]/40 backdrop-blur-sm"
                            />
                            <motion.div
                                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                                className="bg-white rounded-[2.5rem] shadow-2xl border border-white overflow-hidden max-w-2xl w-full relative z-10"
                            >
                                <div className="h-3 bg-linear-to-r from-[#254153] to-[#4a6b8a]" />
                                <button 
                                    onClick={() => setIsModalOpen(false)}
                                    className="absolute top-6 right-6 h-10 w-10 flex items-center justify-center rounded-full bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600 transition-colors"
                                >
                                    <X className="h-5 w-5" />
                                </button>

                                <div className="p-8 md:p-12">
                                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-12">
                                        <div>
                                            <div className="flex items-center gap-2 mb-3">
                                                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#254153]/5 text-[#254153] text-[10px] font-bold uppercase tracking-wider">
                                                    <FileText className="h-3 w-3" /> Detalles de Factura
                                                </div>
                                                
                                                {sapStatus === 'loading' && (
                                                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 text-blue-600 text-[10px] font-bold uppercase tracking-wider border border-blue-200">
                                                        <RefreshCw className="h-3 w-3 animate-spin" /> Consultando SAP...
                                                    </div>
                                                )}
                                                {sapStatus === 'found' && (
                                                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-green-50 text-green-700 text-[10px] font-bold uppercase tracking-wider border border-green-200">
                                                        <Check className="h-3 w-3" /> Ingresado a SAP
                                                    </div>
                                                )}
                                                {sapStatus === 'not_found' && (
                                                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-50 text-red-700 text-[10px] font-bold uppercase tracking-wider border border-red-200">
                                                        <X className="h-3 w-3" /> Factura no ingresada a SAP
                                                    </div>
                                                )}
                                                {sapStatus === 'error' && (
                                                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-yellow-50 text-yellow-700 text-[10px] font-bold uppercase tracking-wider border border-yellow-200">
                                                        <RefreshCw className="h-3 w-3" /> Error al consultar
                                                    </div>
                                                )}
                                            </div>
                                            <h1 className="text-3xl font-extrabold text-[#254153] tracking-tight">
                                                {selectedInvoice.Nro_Factura || 'S/N'}
                                            </h1>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-1">Monto Total</p>
                                            <p className="text-3xl font-black text-[#254153] font-mono tracking-tighter">
                                                {formatCurrency(selectedInvoice["Valor total"])}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8 mb-12">
                                        <ModalInfoItem icon={<User />} label="Proveedor" value={selectedInvoice.Proveedor} />
                                        <ModalInfoItem icon={<Landmark />} label="NIT" value={selectedInvoice.Nit} />
                                        <ModalInfoItem icon={<Calendar />} label="Fecha" value={selectedInvoice.FechaAprobacion || selectedInvoice.Creado ? new Date(selectedInvoice.FechaAprobacion || selectedInvoice.Creado!).toLocaleDateString() : 'N/A'} />
                                        <ModalInfoItem icon={<Hash />} label="ID de Registro" value={selectedInvoice.ID.toString()} />
                                        <div className="col-span-full pt-4 border-t border-gray-50">
                                            <ModalInfoItem icon={<User />} label="Responsable" value={selectedInvoice.Responsable_de_Autorizar} subValue="Autoridad asignada para esta gestión" />
                                        </div>
                                    </div>

                                    {selectedInvoice.Gestion_Contabilidad === 'Aprobado' || selectedInvoice.Gestion_Contabilidad === 'Rechazado' ? (
                                        <div className={`w-full rounded-2xl p-6 mb-4 text-center border ${selectedInvoice.Gestion_Contabilidad === 'Aprobado'
                                            ? 'bg-green-50/50 border-green-100 text-green-800'
                                            : 'bg-red-50/50 border-red-100 text-red-800'
                                            }`}>
                                            <div className="flex items-center justify-center gap-3 mb-2 font-bold uppercase tracking-wide">
                                                {selectedInvoice.Gestion_Contabilidad === 'Aprobado' ? <Check className="h-5 w-5" /> : <X className="h-5 w-5" />}
                                                Factura {selectedInvoice.Gestion_Contabilidad}
                                            </div>
                                            <p className="opacity-70 text-xs font-medium italic">Esta factura ya ha sido procesada.</p>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col sm:flex-row gap-4 w-full mb-6">
                                            <Button
                                                className="flex-1 h-14 rounded-2xl bg-[#254153] hover:bg-[#1a2e3b] text-white font-bold text-lg shadow-lg shadow-[#254153]/20 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                                                onClick={() => handleAction('Aprobado')}
                                                disabled={!!actionLoading}
                                            >
                                                {actionLoading === 'Aprobado' ? <RefreshCw className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
                                                Aprobar
                                            </Button>
                                            <Button
                                                variant="outline"
                                                className="flex-1 h-14 rounded-2xl border-2 border-red-100 text-red-600 hover:bg-red-50 font-bold text-lg transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                                                onClick={() => handleAction('Rechazado')}
                                                disabled={!!actionLoading}
                                            >
                                                {actionLoading === 'Rechazado' ? <RefreshCw className="h-5 w-5 animate-spin" /> : <X className="h-5 w-5" />}
                                                Rechazar
                                            </Button>
                                        </div>
                                    )}

                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>

                {/* Providers Sidebar - Slide over */}
                <AnimatePresence>
                    {isProvidersSidebarOpen && (
                        <div className="fixed inset-0 z-50 flex justify-end">
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                onClick={() => setIsProvidersSidebarOpen(false)}
                                className="absolute inset-0 bg-[#254153]/20 backdrop-blur-sm"
                            />
                            <motion.div
                                initial={{ x: "100%" }}
                                animate={{ x: 0 }}
                                exit={{ x: "100%" }}
                                transition={{ type: "spring", damping: 25, stiffness: 200 }}
                                className="relative w-full max-w-md bg-white shadow-2xl h-full flex flex-col border-l border-gray-100"
                            >
                                <div className="p-6 border-b border-gray-50 flex items-center justify-between bg-white sticky top-0 z-10">
                                    <div>
                                        <h2 className="text-xl font-bold text-[#254153] flex items-center gap-2">
                                            <ShieldCheck className="h-5 w-5 text-green-600" />
                                            Aprobación Automática
                                        </h2>
                                        <p className="text-xs text-gray-400 font-medium">Gestiona proveedores de confianza</p>
                                    </div>
                                    <button
                                        onClick={() => setIsProvidersSidebarOpen(false)}
                                        className="h-9 w-9 flex items-center justify-center rounded-full bg-gray-100 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                                    >
                                        <X className="h-5 w-5" />
                                    </button>
                                </div>

                                <div className="p-4 border-b border-gray-50 bg-gray-50/50">
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                        <input
                                            type="text"
                                            placeholder="Buscar proveedor o Nit..."
                                            value={providersSearch}
                                            onChange={(e) => setProvidersSearch(e.target.value)}
                                            className="w-full h-11 pl-10 pr-4 rounded-xl bg-white border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#254153]/10 focus:border-[#254153]/30 transition-all font-medium"
                                        />
                                    </div>
                                </div>

                                <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                                    {loadingProviders ? (
                                        Array.from({ length: 8 }).map((_, i) => (
                                            <div key={i} className="h-20 bg-gray-50 rounded-2xl animate-pulse" />
                                        ))
                                    ) : (
                                        providers
                                            .filter(p => 
                                                p.razon_social?.toLowerCase().includes(providersSearch.toLowerCase()) || 
                                                p.numero_identificacion?.includes(providersSearch)
                                            )
                                            .map((p) => (
                                                <div 
                                                    key={p.id}
                                                    className={`p-4 rounded-2xl border transition-all duration-300 flex flex-col group ${
                                                        p.aprobacion_automatica 
                                                        ? 'bg-green-50/30 border-green-100 shadow-xs' 
                                                        : 'bg-white border-gray-100 hover:border-gray-200 shadow-xs'
                                                    }`}
                                                >
                                                    <div className="flex items-center justify-between w-full">
                                                        <div className="flex-1 min-w-0 pr-4">
                                                            <p className={`text-sm font-bold truncate ${p.aprobacion_automatica ? 'text-green-800' : 'text-[#254153]'}`}>
                                                                {p.razon_social || 'S/N'}
                                                            </p>
                                                            <div className="flex items-center gap-2 mt-1">
                                                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tight">Nit: {p.numero_identificacion || 'N/A'}</span>
                                                                {p.aprobacion_automatica && (
                                                                    <span className="flex items-center gap-1 text-[9px] font-black text-green-600 bg-green-100 px-1.5 py-0.5 rounded-sm uppercase tracking-tighter">
                                                                        <Check className="h-2 w-2" /> Activo
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <Switch 
                                                            checked={!!p.aprobacion_automatica}
                                                            onChange={() => toggleProviderAutoApproval(p.id, !!p.aprobacion_automatica)}
                                                        />
                                                    </div>

                                                    {p.aprobacion_automatica && (
                                                        <motion.div 
                                                            initial={{ opacity: 0, height: 0 }}
                                                            animate={{ opacity: 1, height: 'auto' }}
                                                            className="mt-4 pt-4 border-t border-green-100/50 flex gap-3"
                                                        >
                                                            <div className="flex-1">
                                                                <label className="text-[9px] font-black text-green-700 uppercase mb-1 block">Valor Ref. (COP)</label>
                                                                <div className="relative">
                                                                    <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-green-600" />
                                                                    <input 
                                                                        type="number"
                                                                        defaultValue={p.valor_de_referencia || ''}
                                                                        onBlur={(e) => updateProviderField(p.id, 'valor_de_referencia', e.target.value === '' ? null : Number(e.target.value))}
                                                                        className="w-full h-8 pl-6 pr-2 bg-white/50 border border-green-200 rounded-lg text-xs font-bold text-green-900 focus:outline-none focus:ring-2 focus:ring-green-500/20 transition-all"
                                                                        placeholder="0.00"
                                                                    />
                                                                </div>
                                                            </div>
                                                            <div className="w-24">
                                                                <label className="text-[9px] font-black text-green-700 uppercase mb-1 block">% Desv.</label>
                                                                <input 
                                                                    type="number"
                                                                    defaultValue={p.porcentaje_desviacion || ''}
                                                                    onBlur={(e) => updateProviderField(p.id, 'porcentaje_desviacion', e.target.value === '' ? null : Number(e.target.value))}
                                                                    className="w-full h-8 px-2 bg-white/50 border border-green-200 rounded-lg text-xs font-bold text-green-900 focus:outline-none focus:ring-2 focus:ring-green-500/20 transition-all"
                                                                    placeholder="%"
                                                                />
                                                            </div>
                                                        </motion.div>
                                                    )}
                                                </div>
                                            ))
                                    )}
                                </div>

                                <div className="p-6 bg-gray-50/50 border-t border-gray-100">
                                    <div className="flex items-start gap-3 p-4 bg-white rounded-2xl border border-gray-100 shadow-sm">
                                        <div className="mt-0.5 h-8 w-8 rounded-lg bg-green-50 flex items-center justify-center text-green-600 shrink-0">
                                            <ShieldCheck className="h-4 w-4" />
                                        </div>
                                        <div>
                                            <p className="text-xs font-bold text-gray-800">Control Inteligente</p>
                                            <p className="text-[10px] text-gray-500 font-medium leading-relaxed mt-0.5">
                                                Los proveedores activados aprobarán sus facturas automáticamente al ingresar.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>
            </main>

            {/* Panel Aprobación Automática */}
            <AnimatePresence>
                {isProvidersSidebarOpen && (
                    <div className="fixed inset-0 z-[90] flex justify-end">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setIsProvidersSidebarOpen(false)}
                            className="absolute inset-0 bg-[#254153]/20 backdrop-blur-sm"
                        />
                        <motion.div
                            initial={{ x: "100%" }}
                            animate={{ x: 0 }}
                            exit={{ x: "100%" }}
                            transition={{ type: "spring", damping: 25, stiffness: 200 }}
                            className="relative w-full max-w-md bg-white shadow-2xl h-full flex flex-col border-l border-gray-100"
                        >
                            <div className="p-6 border-b border-gray-50 flex items-center justify-between bg-white sticky top-0 z-10">
                                <div>
                                    <h2 className="text-xl font-bold text-[#254153] flex items-center gap-2">
                                        <ShieldCheck className="h-5 w-5 text-green-600" />
                                        Aprobación Automática
                                        <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-normal">
                                            {providers.length.toLocaleString()}
                                        </span>
                                    </h2>
                                    <p className="text-xs text-gray-400 font-medium">Gestiona proveedores de confianza</p>
                                </div>
                                <button
                                    onClick={() => setIsProvidersSidebarOpen(false)}
                                    className="h-9 w-9 flex items-center justify-center rounded-full bg-gray-100 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                                >
                                    <X className="h-5 w-5" />
                                </button>
                            </div>

                            <div className="p-4 border-b border-gray-50 bg-gray-50/50">
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                    <input
                                        type="text"
                                        placeholder="Buscar proveedor o Nit..."
                                        value={providersSearch}
                                        onChange={(e) => setProvidersSearch(e.target.value)}
                                        className="w-full h-11 pl-10 pr-4 rounded-xl bg-white border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#254153]/10 focus:border-[#254153]/30 transition-all font-medium"
                                    />
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                                {loadingProviders ? (
                                    Array.from({ length: 8 }).map((_, i) => (
                                        <div key={i} className="h-20 bg-gray-50 rounded-2xl animate-pulse" />
                                    ))
                                ) : (
                                    providers
                                        .filter(p =>
                                            p.razon_social?.toLowerCase().includes(providersSearch.toLowerCase()) ||
                                            p.numero_identificacion?.includes(providersSearch)
                                        )
                                        .map((p) => (
                                            <div
                                                key={p.id}
                                                className={`p-4 rounded-2xl border transition-all duration-300 flex flex-col ${
                                                    p.aprobacion_automatica
                                                    ? 'bg-green-50/30 border-green-100 shadow-xs'
                                                    : 'bg-white border-gray-100 hover:border-gray-200 shadow-xs'
                                                }`}
                                            >
                                                <div className="flex items-center justify-between w-full">
                                                    <div className="flex-1 min-w-0 pr-4">
                                                        <p className={`text-sm font-bold truncate ${p.aprobacion_automatica ? 'text-green-800' : 'text-[#254153]'}`}>
                                                            {p.razon_social || 'S/N'}
                                                        </p>
                                                        <div className="flex items-center gap-2 mt-1">
                                                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tight">Nit: {p.numero_identificacion || 'N/A'}</span>
                                                            {p.aprobacion_automatica && (
                                                                <span className="flex items-center gap-1 text-[9px] font-black text-green-600 bg-green-100 px-1.5 py-0.5 rounded-sm uppercase tracking-tighter">
                                                                    <Check className="h-2 w-2" /> Activo
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <Switch
                                                        checked={!!p.aprobacion_automatica}
                                                        onChange={() => toggleProviderAutoApproval(p.id, !!p.aprobacion_automatica)}
                                                    />
                                                </div>

                                                {p.aprobacion_automatica && (
                                                    <motion.div
                                                        initial={{ opacity: 0, height: 0 }}
                                                        animate={{ opacity: 1, height: 'auto' }}
                                                        className="mt-4 pt-4 border-t border-green-100/50 flex gap-3"
                                                    >
                                                        <div className="flex-1">
                                                            <label className="text-[9px] font-black text-green-700 uppercase mb-1 block">Valor Ref. (COP)</label>
                                                            <div className="relative">
                                                                <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-green-600" />
                                                                <input
                                                                    type="number"
                                                                    defaultValue={p.valor_de_referencia || ''}
                                                                    onBlur={(e) => updateProviderField(p.id, 'valor_de_referencia', e.target.value === '' ? null : Number(e.target.value))}
                                                                    className="w-full h-8 pl-6 pr-2 bg-white/50 border border-green-200 rounded-lg text-xs font-bold text-green-900 focus:outline-none focus:ring-2 focus:ring-green-500/20 transition-all"
                                                                    placeholder="0.00"
                                                                />
                                                            </div>
                                                        </div>
                                                        <div className="w-24">
                                                            <label className="text-[9px] font-black text-green-700 uppercase mb-1 block">% Desv.</label>
                                                            <input
                                                                type="number"
                                                                defaultValue={p.porcentaje_desviacion || ''}
                                                                onBlur={(e) => updateProviderField(p.id, 'porcentaje_desviacion', e.target.value === '' ? null : Number(e.target.value))}
                                                                className="w-full h-8 px-2 bg-white/50 border border-green-200 rounded-lg text-xs font-bold text-green-900 focus:outline-none focus:ring-2 focus:ring-green-500/20 transition-all"
                                                                placeholder="%"
                                                            />
                                                        </div>
                                                    </motion.div>
                                                )}
                                            </div>
                                        ))
                                )}
                            </div>

                            <div className="p-6 bg-gray-50/50 border-t border-gray-100">
                                <div className="flex items-start gap-3 p-4 bg-white rounded-2xl border border-gray-100 shadow-sm">
                                    <div className="mt-0.5 h-8 w-8 rounded-lg bg-green-50 flex items-center justify-center text-green-600 shrink-0">
                                        <ShieldCheck className="h-4 w-4" />
                                    </div>
                                    <div>
                                        <p className="text-xs font-bold text-gray-800">Control Inteligente</p>
                                        <p className="text-[10px] text-gray-500 font-medium leading-relaxed mt-0.5">
                                            Los proveedores activados aprobarán sus facturas automáticamente al ingresar.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Modal de Detalle de Factura */}
            <AnimatePresence>
                {selectedInvoice && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setSelectedInvoice(null)}
                            className="absolute inset-0 bg-[#254153]/40 backdrop-blur-md"
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="bg-white rounded-[32px] shadow-2xl w-full max-w-4xl relative overflow-hidden border border-white/20"
                        >
                            <div className="p-8">
                                <div className="flex justify-between items-start mb-8">
                                    <div className="flex items-center gap-4">
                                        <div className="h-14 w-14 bg-blue-50 rounded-2xl flex items-center justify-center shadow-inner">
                                            <Paperclip className="h-7 w-7 text-blue-500" />
                                        </div>
                                        <div>
                                            <h3 className="text-2xl font-black text-[#254153]">Detalle de Factura</h3>
                                            <p className="text-gray-400 font-bold tabular-nums">#{selectedInvoice.Nro_Factura || selectedInvoice.id}</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setSelectedInvoice(null)}
                                        className="h-12 w-12 rounded-2xl bg-gray-50 flex items-center justify-center hover:bg-rose-50 hover:text-rose-500 transition-all text-gray-400 border border-gray-100"
                                    >
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                                    </button>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    {/* Información Básica */}
                                    <div className="space-y-6">
                                        <div className="bg-gray-50/50 p-6 rounded-[24px] border border-gray-100 space-y-4">
                                            <h4 className="text-[11px] font-black text-gray-400 uppercase tracking-[2px]">Información del Proveedor</h4>
                                            <div className="space-y-3">
                                                <div>
                                                    <p className="text-[11px] font-bold text-gray-400 uppercase">Proveedor</p>
                                                    <p className="text-lg font-black text-[#254153]">{selectedInvoice.Proveedor || "N/A"}</p>
                                                </div>
                                                <div>
                                                    <p className="text-[11px] font-bold text-gray-400 uppercase">NIT</p>
                                                    <p className="font-bold text-gray-600">{selectedInvoice.Nit || "N/A"}</p>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="bg-gray-50/50 p-6 rounded-[24px] border border-gray-100 space-y-4">
                                            <h4 className="text-[11px] font-black text-gray-400 uppercase tracking-[2px]">Montos y Fechas</h4>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <p className="text-[11px] font-bold text-gray-400 uppercase">Valor Total</p>
                                                    <p className="text-xl font-black text-[#254153]">{formatCurrency(selectedInvoice.Monto)}</p>
                                                </div>
                                                <div>
                                                    <p className="text-[11px] font-bold text-gray-400 uppercase">Fecha Registro</p>
                                                    <p className="font-bold text-gray-600">{selectedInvoice.Created ? new Date(selectedInvoice.Created).toLocaleDateString() : "N/A"}</p>
                                                </div>
                                                <div>
                                                    <p className="text-[11px] font-bold text-gray-400 uppercase">Fecha Aprobación</p>
                                                    <p className="font-bold text-gray-600">
                                                        {selectedInvoice.FechaAprobacion ? new Date(selectedInvoice.FechaAprobacion).toLocaleString() : "Pendiente"}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Documento Adjunto */}
                                        {(selectedInvoice.documentInfo || selectedInvoice.Attachments) && (
                                            <div className="bg-[#254153]/5 p-6 rounded-[24px] border border-[#254153]/10 space-y-4">
                                                <div className="flex items-center justify-between">
                                                    <h4 className="text-[11px] font-black text-gray-400 uppercase tracking-[2px]">Documento Adjunto</h4>
                                                    <span className="px-2 py-0.5 rounded bg-blue-100 text-[10px] font-bold text-blue-600 uppercase">
                                                        {selectedInvoice.documentInfo?.fileName?.split('.').pop() || "Adjunto"}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-4">
                                                    <div className="h-12 w-12 bg-white rounded-xl flex items-center justify-center shadow-sm border border-gray-100">
                                                        <FileText className="h-6 w-6 text-blue-500" />
                                                    </div>
                                                    <div className="flex-1 overflow-hidden">
                                                        <p className="text-sm font-bold text-[#254153] truncate">{selectedInvoice.documentInfo?.fileName || "Factura Adjunta"}</p>
                                                        <p className="text-[10px] text-gray-400 font-medium italic">Archivo de SharePoint</p>
                                                    </div>
                                                    <a
                                                        href={`/api/sharepoint/attachment-redirect?itemId=${selectedInvoice.id}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="h-10 px-4 flex items-center justify-center rounded-xl bg-white border border-gray-100 text-xs font-bold text-[#254153] hover:bg-gray-50 transition-all shadow-sm"
                                                    >
                                                        Ver PDF
                                                    </a>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Estados y Responsables */}
                                    <div className="space-y-6">
                                        <div className="bg-gray-50/50 p-6 rounded-[24px] border border-gray-100 space-y-4">
                                            <h4 className="text-[11px] font-black text-gray-400 uppercase tracking-[2px]">Gestión y Aprobación</h4>
                                            <div className="space-y-4">
                                                <div>
                                                    <p className="text-[11px] font-bold text-gray-400 uppercase mb-1.5">Estado Aprobación</p>
                                                    <span className={`inline-flex items-center px-4 py-1.5 rounded-full text-xs font-black border ${getStatusStyles(selectedInvoice.Aprobacion_Doliente)}`}>
                                                        {selectedInvoice.Aprobacion_Doliente || "Pendiente"}
                                                    </span>
                                                </div>
                                                <div>
                                                    <p className="text-[11px] font-bold text-gray-400 uppercase mb-1">Responsable de Autorizar</p>
                                                    {!isEditingResponsible ? (
                                                        <div className="flex flex-col gap-1">
                                                            <div className="flex items-center gap-2 group cursor-pointer" onClick={() => setIsEditingResponsible(true)}>
                                                                <p className={`font-extrabold ${pendingResponsibleUser ? 'text-blue-600 italic' : 'text-[#254153]'} hover:text-blue-600 transition-colors`}>
                                                                    {pendingResponsibleUser ? pendingResponsibleUser.name : (selectedInvoice.Responsable_de_Autorizar || "No asignado")}
                                                                </p>
                                                                <Edit2 className="h-3 w-3 text-gray-300 group-hover:text-blue-500 transition-colors" />
                                                            </div>
                                                            {pendingResponsibleUser && (
                                                                <p className="text-[9px] font-bold text-blue-400 uppercase tracking-tighter">⚠️ Cambio pendiente por guardar</p>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <div className="relative space-y-2">
                                                            <div className="flex items-center gap-2">
                                                                <div className="relative flex-1">
                                                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                                                                    <input
                                                                        autoFocus
                                                                        type="text"
                                                                        placeholder="Buscar persona..."
                                                                        className="w-full pl-9 pr-4 py-2 bg-white border border-blue-100 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                                                        value={userSearchQuery}
                                                                        onChange={(e) => setUserSearchQuery(e.target.value)}
                                                                    />
                                                                    {isSearchingUsers && (
                                                                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                                                            <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                <button
                                                                    onClick={() => {
                                                                        setIsEditingResponsible(false);
                                                                        setUserSearchQuery("");
                                                                        setUserSearchResults([]);
                                                                    }}
                                                                    className="p-2 hover:bg-rose-50 text-rose-500 rounded-lg transition-colors border border-rose-100"
                                                                >
                                                                    <X className="h-4 w-4" />
                                                                </button>
                                                            </div>

                                                            {userSearchResults.length > 0 && (
                                                                <div className="absolute z-[110] left-0 right-0 mt-1 bg-white border border-gray-100 rounded-2xl shadow-xl overflow-hidden max-h-[220px] overflow-y-auto custom-scrollbar">
                                                                    {userSearchResults.map((user) => (
                                                                        <button
                                                                            key={user.id}
                                                                            onClick={() => {
                                                                                setPendingResponsibleUser(user);
                                                                                setIsEditingResponsible(false);
                                                                                setUserSearchQuery("");
                                                                                setUserSearchResults([]);
                                                                            }}
                                                                            className="w-full px-4 py-3 flex items-center gap-3 hover:bg-blue-50/50 transition-colors text-left border-b border-gray-50 last:border-0"
                                                                        >
                                                                            <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                                                                                <User className="h-4 w-4 text-blue-600" />
                                                                            </div>
                                                                            <div className="min-w-0">
                                                                                <p className="text-[13px] font-bold text-[#254153] truncate">{user.name}</p>
                                                                                <p className="text-[10px] text-gray-400 truncate">{user.email}</p>
                                                                            </div>
                                                                            {isUpdatingResponsible && (
                                                                                <Loader2 className="h-3 w-3 animate-spin ml-auto text-blue-500" />
                                                                            )}
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                                <div>
                                                    <p className="text-[11px] font-bold text-gray-400 uppercase">Gestión Contabilidad</p>
                                                    <p className="font-bold text-gray-600">{selectedInvoice.Gestion_Contabilidad || "Pendiente"}</p>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex gap-3 pt-2">
                                            {pendingResponsibleUser ? (
                                                <Button
                                                    onClick={handleUpdateResponsible}
                                                    disabled={isUpdatingResponsible}
                                                    className="flex-1 h-14 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-black text-sm shadow-xl shadow-blue-900/10 flex items-center justify-center gap-2"
                                                >
                                                    {isUpdatingResponsible ? (
                                                        <Loader2 className="h-5 w-5 animate-spin" />
                                                    ) : (
                                                        <Check className="h-5 w-5" />
                                                    )}
                                                    Actualizar Responsable
                                                </Button>
                                            ) : (
                                                <div className="flex-1" />
                                            )}
                                            <Button 
                                                variant="outline" 
                                                className="h-14 rounded-2xl px-8 border-gray-100 font-bold text-gray-500 hover:bg-gray-50"
                                                onClick={() => window.print()}
                                            >
                                                Imprimir
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            <CreateInvoiceModal 
                isOpen={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
                onSuccess={() => fetchInvoices(true)}
            />
        </div>
    );
}

