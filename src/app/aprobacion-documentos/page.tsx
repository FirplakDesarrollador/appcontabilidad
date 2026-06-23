"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { supabase } from "@/lib/supabaseClient";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Bell, RefreshCw, Paperclip, ChevronLeft, ChevronRight, Loader2, FileText, Edit2, User, X, Check, Copy, ShieldCheck, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Switch";
import { useSidebar } from "@/context/SidebarContext";
import { Menu } from "lucide-react";
import { CreateSupportDocumentModal } from "@/components/modals/CreateSupportDocumentModal";
import { AgGridReact } from 'ag-grid-react';
import { useRef } from 'react';
import * as XLSX from 'xlsx';
import { ModuleRegistry, AllCommunityModule, themeQuartz } from 'ag-grid-community';

ModuleRegistry.registerModules([AllCommunityModule]);

const AG_GRID_LOCALE_ES = {
    filterOoo: 'Buscar...', empty: 'Elige uno', equals: 'Igual a', notEqual: 'Diferente a',
    lessThan: 'Menor que', greaterThan: 'Mayor que', lessThanOrEqual: 'Menor o igual a', greaterThanOrEqual: 'Mayor o igual a',
    inRange: 'Rango', contains: 'Buscar...', notContains: 'No contiene', startsWith: 'Inicia con',
    endsWith: 'Termina con', blank: 'En blanco', notBlank: 'No en blanco', andCondition: 'Y',
    orCondition: 'O', applyFilter: 'Aplicar', resetFilter: 'Reiniciar', clearFilter: 'Limpiar',
    cancelFilter: 'Cancelar', noRowsToShow: 'No hay registros para mostrar', loadingOoo: 'Cargando...',
};

interface SharePointDocument {
    id: string;
    Proveedor?: string;
    Nro_Factura?: string; // We map Consecutivo_Doc_Soporte here
    Nit?: string;
    Monto?: string;
    Responsable_de_Autorizar?: string;
    Aprobacion_Doliente?: string;
    Gestion_Contabilidad?: string;
    Created?: string;
    [key: string]: any;
}

export default function SupportDocumentsPage() {
    const { toggleSidebar } = useSidebar();
    const [documents, setDocuments] = useState<SharePointDocument[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [activeTab, setActiveTab] = useState<'pending' | 'processed'>('pending');
    const [selectedDoc, setSelectedDoc] = useState<SharePointDocument | null>(null);
    const [selectedResponsable, setSelectedResponsable] = useState<string>("all");
    const [isEditingResponsible, setIsEditingResponsible] = useState(false);
    const [userSearchQuery, setUserSearchQuery] = useState("");
    const [userSearchResults, setUserSearchResults] = useState<any[]>([]);
    const [isSearchingUsers, setIsSearchingUsers] = useState(false);
    const [isUpdatingResponsible, setIsUpdatingResponsible] = useState(false);
    const [pendingResponsibleUser, setPendingResponsibleUser] = useState<any>(null);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    
    // For auto-approval (using same providers table)
    const [isProvidersSidebarOpen, setIsProvidersSidebarOpen] = useState(false);
    const [providers, setProviders] = useState<any[]>([]);
    const [providersSearch, setProvidersSearch] = useState("");
    const [loadingProviders, setLoadingProviders] = useState(false);

    const [columnFilters, setColumnFilters] = useState({
        invoice: "",
        provider: "",
        amount: "",
        responsible: "",
        status: "",
        contabilidad: ""
    });

    const filterOptions = useMemo(() => {
        const options = {
            invoices: new Set<string>(),
            providers: new Set<string>(),
            responsibles: new Set<string>(),
            statuses: new Set<string>(),
            contabilidades: new Set<string>(),
        };

        documents.forEach(doc => {
            if (doc.Nro_Factura) options.invoices.add(doc.Nro_Factura);
            if (doc.Proveedor) options.providers.add(doc.Proveedor);
            if (doc.Responsable_de_Autorizar) options.responsibles.add(doc.Responsable_de_Autorizar);
            if (doc.Aprobacion_Doliente) options.statuses.add(doc.Aprobacion_Doliente);
            if (doc.Gestion_Contabilidad) options.contabilidades.add(doc.Gestion_Contabilidad);
        });

        return {
            invoices: Array.from(options.invoices).sort(),
            providers: Array.from(options.providers).sort(),
            responsibles: Array.from(options.responsibles).sort(),
            statuses: Array.from(options.statuses).sort(),
            contabilidades: Array.from(options.contabilidades).sort(),
        };
    }, [documents]);

    const [dataSource, setDataSource] = useState<'cache' | 'sharepoint' | 'loading'>('loading');

    const normalizeDocuments = (items: any[]) => items.map((item: any) => ({
        ...item,
        id: item.id || item.ID || String(Math.random()),
        Nro_Factura: item.consecutivo || item.Consecutivo_Doc_Soporte || "S/N",
        Proveedor: item.proveedor || item.tsic || "N/A",
        Nit: item.nit || item.Title || "N/A",
        Monto: item.valor_total || item.Valortotal || 0,
        Responsable_de_Autorizar: item.responsable_nombre || item.Responsable_de_Autorizar || "Sin asignar",
        Aprobacion_Doliente: item.aprobacion_doliente || item.AprobacionDoliente || "Pendiente",
        Gestion_Contabilidad: item.gestion_contabilidad || item.Gestion_Contabilidad || "Pendiente",
        Created: item.fecha_creacion || item.Created || item.created_at
    }));

    const fetchDocuments = async (refresh = false) => {
        try {
            setLoading(true);
            setDataSource('loading');
            
            const params = new URLSearchParams();
            if (refresh) params.append('refresh', 'true');
            params.append('pending', 'true'); 
            
            const response = await fetch(`/api/sharepoint/documentos/all?${params.toString()}`);
            const data = await response.json();

            if (data.success) {
                setDocuments(normalizeDocuments(data.items));
                setDataSource(data.source);
            }
        } catch (error) {
            console.error("Error fetching documents:", error);
        } finally {
            setLoading(false);
        }
    };

    const fetchHistory = async () => {
        if (documents.some(doc => !isPending(doc))) return; // Already loaded history
        
        try {
            setLoading(true);
            const response = await fetch(`/api/sharepoint/documentos/all?limit=2000`); 
            const data = await response.json();

            if (data.success) {
                const normalized = normalizeDocuments(data.items);
                setDocuments(prev => {
                    const combined = [...prev];
                    normalized.forEach((item: any) => {
                        if (!combined.some(c => c.id === item.id)) combined.push(item);
                    });
                    return combined.sort((a, b) => Number(b.id || 0) - Number(a.id || 0));
                });
            }
        } catch (error) {
            console.error("Error fetching history:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (activeTab === 'processed') {
            fetchHistory();
        }
    }, [activeTab]);

    const router = useRouter();
    const [user, setUser] = useState<any>(null);

    useEffect(() => {
        const checkUser = async () => {
            try {
                const { data: { session }, error } = await supabase.auth.getSession();
                if (error || !session) {
                    if (error) console.error("Error de autenticación:", error.message);
                    await supabase.auth.signOut();
                    router.push("/login");
                } else {
                    setUser(session.user);
                    fetchDocuments(); // Usará el nuevo límite de 100 por defecto para velocidad máxima
                }
            } catch (err) {
                console.error("Error inesperado en checkUser:", err);
                router.push("/login");
            }
        };

        checkUser();
    }, [router]);

    useEffect(() => {
        setPendingResponsibleUser(null);
        setIsEditingResponsible(false);
    }, [selectedDoc]);

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
        if (!selectedDoc || !pendingResponsibleUser) return;

        setIsUpdatingResponsible(true);
        try {
            const res = await fetch("/api/sharepoint/update-responsible", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    itemId: selectedDoc.id,
                    userEmail: pendingResponsibleUser.email,
                    userName: pendingResponsibleUser.name,
                    assignedByName: selectedDoc.Responsable_de_Autorizar,
                    invoiceNumber: selectedDoc.Nro_Factura,
                    providerName: selectedDoc.Proveedor,
                    listName: 'Documento_Soporte'
                })
            });

            if (res.ok) {
                const updatedDocs = documents.map(doc =>
                    doc.id === selectedDoc.id
                        ? { ...doc, Responsable_de_Autorizar: pendingResponsibleUser.name }
                        : doc
                );
                setDocuments(updatedDocs);
                setSelectedDoc({ ...selectedDoc, Responsable_de_Autorizar: pendingResponsibleUser.name });
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

    const handleCopyLink = (doc: SharePointDocument) => {
        const url = `${window.location.origin}/externo/documento/${doc.id}`;
        navigator.clipboard.writeText(url).then(() => {
            alert("Enlace de aprobación copiado al portapapeles");
        }).catch(err => {
            console.error("Error al copiar:", err);
            alert("No se pudo copiar el enlace");
        });
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

    const formatCurrency = (value: any) => {
        if (value === undefined || value === null || value === "") return "$ 0,00";
        let numericValue = typeof value === "number" ? value : parseFloat(String(value).replace(/[^\d.,-]/g, "").replace(",", "."));
        if (isNaN(numericValue)) return String(value);
        return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 2 }).format(numericValue);
    };

    const getStatusStyles = (status: string | undefined) => {
        if (!status) return "bg-gray-100 text-gray-600 border-gray-200";
        const s = status.toLowerCase();
        if (s.includes("aprobado") || s.includes("procesado")) return "bg-emerald-50 text-emerald-700 border-emerald-100";
        if (s.includes("rechazado")) return "bg-rose-50 text-rose-700 border-rose-100";
        return "bg-amber-50 text-amber-700 border-amber-100";
    };

    const isPending = (doc: SharePointDocument) => {
        const state = (doc.Aprobacion_Doliente || "Pendiente").toLowerCase();
        return state.includes("pendiente") || state.includes("por aprobar");
    };

    const isProcessed = (doc: SharePointDocument) => {
        const state = (doc.Aprobacion_Doliente || "").toLowerCase();
        const contabilidad = (doc.Gestion_Contabilidad || "").toLowerCase();
        return state.includes("aprobado") || state.includes("rechazado") || contabilidad.includes("procesado");
    };

    const filteredDocuments = documents.filter(doc => {
        const matchesSearch = !searchTerm ||
            doc.Nro_Factura?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            doc.Proveedor?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            doc.Nit?.toLowerCase().includes(searchTerm.toLowerCase());

        const matchesTab = activeTab === 'pending' ? isPending(doc) : isProcessed(doc);
        const matchesResponsable = selectedResponsable === "all" || doc.Responsable_de_Autorizar === selectedResponsable;

        const matchesColInvoice = !columnFilters.invoice || doc.Nro_Factura?.toLowerCase().includes(columnFilters.invoice.toLowerCase());
        const matchesColProvider = !columnFilters.provider || 
            doc.Proveedor?.toLowerCase().includes(columnFilters.provider.toLowerCase()) || 
            doc.Nit?.toLowerCase().includes(columnFilters.provider.toLowerCase());
        const matchesColAmount = !columnFilters.amount || String(doc.Monto).includes(columnFilters.amount);
        const matchesColResponsible = !columnFilters.responsible || doc.Responsable_de_Autorizar?.toLowerCase().includes(columnFilters.responsible.toLowerCase());
        const matchesColStatus = !columnFilters.status || (doc.Aprobacion_Doliente || "Pendiente").toLowerCase().includes(columnFilters.status.toLowerCase());
        const matchesColContabilidad = !columnFilters.contabilidad || (doc.Gestion_Contabilidad || "Pendiente").toLowerCase().includes(columnFilters.contabilidad.toLowerCase());

        return matchesSearch && matchesTab && matchesResponsable && 
               matchesColInvoice && matchesColProvider && matchesColAmount && 
               matchesColResponsible && matchesColStatus && matchesColContabilidad;
    });

    const gridRef = useRef<AgGridReact>(null);
    const [displayedRowCount, setDisplayedRowCount] = useState<number>(0);

    const handleExportExcel = () => {
        if (!gridRef.current || !gridRef.current.api) return;
        const rowData: any[] = [];
        gridRef.current.api.forEachNodeAfterFilterAndSort((node) => {
            if (node.data) rowData.push(node.data);
        });
        
        const excelData = rowData.map((doc: any) => ({
            'Documento': doc.Nro_Factura,
            'NIT': doc.Nit,
            'Proveedor': doc.Proveedor,
            'Valor Total': doc.Monto,
            'Responsable': doc.Responsable_de_Autorizar,
            'Estado': doc.Aprobacion_Doliente,
            'G. Contabilidad': doc.Gestion_Contabilidad,
            'Consecutivo': doc.Consecutivo,
            'Fecha Creación': doc.Created ? new Date(doc.Created).toLocaleString() : 'Sin fecha',
            'Fecha Aprobación': doc.FechaAprobacion ? new Date(doc.FechaAprobacion).toLocaleString() : 'Sin fecha',
            'Observaciones': doc.Observaciones || ''
        }));

        const worksheet = XLSX.utils.json_to_sheet(excelData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Documentos');
        XLSX.writeFile(workbook, 'Documentos_Soporte.xlsx');
    };

    const formatCostCenter = (costCenterStr: any, tableCostStr: any) => {
        if (!costCenterStr && !tableCostStr) return 'Sin asignar';
        if (costCenterStr) {
            try {
                const parsed = typeof costCenterStr === 'string' ? JSON.parse(costCenterStr) : costCenterStr;
                if (Array.isArray(parsed) && parsed.length > 0) {
                    return (
                        <div className="flex flex-col gap-1.5 py-1">
                            {parsed.map((p: any, i: number) => (
                                <div key={i} className="whitespace-normal break-words leading-tight bg-gray-50/50 rounded p-1">
                                    <span className="text-[#254153] font-extrabold">{p.centroCosto?.split(' - ')[0] || ''}</span>
                                    <span className="text-gray-300 mx-1.5">|</span>
                                    <span className="text-gray-600">{p.cuenta || ''}</span>
                                </div>
                            ))}
                        </div>
                    );
                }
            } catch (e) {
                return <div className="whitespace-normal break-words leading-tight">{String(costCenterStr)}</div>;
            }
        }
        if (tableCostStr) {
            if (typeof tableCostStr === 'object' && tableCostStr.Url) {
                return 'Ver tabla adjunta';
            }
            return <div className="whitespace-normal break-words leading-tight">{String(tableCostStr)}</div>;
        }
        return 'Sin asignar';
    };

    const sortedDocuments = useMemo(() => {
        return filteredDocuments;
    }, [filteredDocuments]);

    const colDefs = useMemo(() => [
        {
            headerName: 'Acciones',
            field: 'id',
            width: 160,
            pinned: 'left',
            filter: false,
            sortable: false,
            cellRenderer: (params: any) => {
                const doc = params.data;
                if (!doc) return null;
                return (
                    <div className="flex items-center justify-start gap-2 h-full py-2">
                        <Button variant="outline" onClick={() => handleCopyLink(doc)} className="h-8 w-8 p-0 text-gray-400 border-gray-100 hover:bg-gray-50 bg-white rounded-lg transition-all shadow-sm flex items-center justify-center" title="Copiar Link Público">
                            <Copy className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="outline" onClick={() => { setSelectedDoc(doc); }} className="h-8 w-8 p-0 text-gray-400 border-gray-100 hover:bg-gray-50 bg-white rounded-lg transition-all shadow-sm flex items-center justify-center" title="Ver Detalle">
                            <Search className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                );
            }
        },
        { headerName: 'NIT', field: 'Nit', width: 130, cellRenderer: (p: any) => <div className="text-xs font-bold text-gray-600 h-full flex items-center">{p.value || 'N/A'}</div> },
        { headerName: 'Proveedor', field: 'Proveedor', width: 250, cellRenderer: (p: any) => <div className="text-sm font-bold text-gray-800 h-full flex items-center">{p.value || 'N/A'}</div> },
        { headerName: 'Documento', field: 'Nro_Factura', width: 160, cellRenderer: (p: any) => <div className="flex flex-col justify-center h-full"><div className="font-bold text-[#254153] leading-none">{p.value || 'S/N'}</div><div className="text-[10px] text-gray-400 mt-1 font-medium tracking-tight">REF: {p.data?.id}</div></div> },
        { headerName: 'Valor total', field: 'Monto', width: 140, cellRenderer: (p: any) => <div className="text-sm font-extrabold text-[#254153] h-full flex items-center">{formatCurrency(p.value)}</div> },
        { headerName: 'Responsable', field: 'Responsable_de_Autorizar', width: 200, cellRenderer: (p: any) => <div className="flex flex-col justify-center h-full"><div className="text-xs font-semibold text-gray-600">{p.value || 'Sin asignar'}</div><div className="text-[10px] text-gray-400 font-medium">{p.data?.Created ? new Date(p.data.Created).toLocaleDateString() : ''}</div></div> },
        { headerName: 'Estado', field: 'Aprobacion_Doliente', width: 140, cellRenderer: (p: any) => <div className="h-full flex items-center"><span className={`inline-flex items-center px-3 py-1 rounded-full text-[10px] font-bold border ${getStatusStyles(p.value)}`}>{p.value || 'Pendiente'}</span></div> },
        { headerName: 'G. Contabilidad', field: 'Gestion_Contabilidad', width: 160, cellRenderer: (p: any) => <div className="text-[10px] font-bold text-gray-600 uppercase tracking-tight h-full flex items-center">{p.value || 'Pendiente'}</div> },
        { headerName: 'Consecutivo', field: 'Consecutivo', width: 130, cellRenderer: (p: any) => <div className="text-xs font-bold text-gray-600 h-full flex items-center">{p.value || 'N/A'}</div> },
        { headerName: 'Fecha Creación', field: 'Created', width: 160, cellRenderer: (p: any) => <div className="text-[10px] font-bold text-gray-500 uppercase tracking-tight h-full flex items-center">{p.value ? new Date(p.value).toLocaleString() : 'Sin fecha'}</div> },
        { headerName: 'C. Costos / Cuenta', field: 'centro_costos', width: 250, cellRenderer: (p: any) => <div className="text-[10px] font-bold text-gray-500 w-full h-full flex items-center">{formatCostCenter(p.value, p.data?.tablaCostos)}</div> },
        { headerName: 'Fecha Aprobación', field: 'FechaAprobacion', width: 160, cellRenderer: (p: any) => <div className="text-[10px] font-bold text-gray-500 uppercase tracking-tight h-full flex items-center">{p.value ? new Date(p.value).toLocaleString() : 'Sin fecha'}</div> },
        { headerName: 'Observaciones', field: 'Observaciones', width: 300, cellRenderer: (p: any) => <div className="w-full text-xs font-medium text-gray-500 h-full flex items-center truncate" title={p.value}>{p.value || 'Sin observaciones'}</div> },
        { headerName: 'Datos adjuntos', field: 'adjuntos_url', width: 150, filter: false, sortable: false, cellRenderer: (p: any) => <div className="h-full flex items-center">{p.value ? <a href={`/api/sharepoint/attachment-redirect?itemId=${p.data?.id}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-all border border-blue-100/50" title="Ver Documento Adjunto"><FileText className="h-3.5 w-3.5" /><span className="text-[10px] font-black uppercase tracking-tight">Ver Adjunto</span></a> : <span className="text-[10px] text-gray-300 font-medium italic">Sin adjuntos</span>}</div> }
    ], []);

    return (
        <div className="min-h-screen bg-[#f8fafc] flex">
            <Sidebar />

            <main 
                className="flex-1 relative bg-[#f8fafc] transition-all duration-300 ease-in-out"
                style={{ marginLeft: 'var(--sidebar-width, 256px)' }}
            >
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
                            <h1 className="text-xl font-bold text-gray-800 tracking-tight">Aprobación de Documento Soporte</h1>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="relative group">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 group-focus-within:text-[#254153] transition-colors" />
                            <input
                                type="text"
                                placeholder="Buscar documentos..."
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
                            {Array.from(new Set(documents.map(i => i.Responsable_de_Autorizar).filter(Boolean))).sort().map(resp => (
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
                    <div className="flex justify-between items-end">
                        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
                            <h2 className="text-3xl font-extrabold text-[#254153]">Gestión de Documento Soporte</h2>
                            <p className="text-gray-500 mt-1 font-medium flex items-center gap-2">
                                <span className={`h-2 w-2 rounded-full animate-pulse ${dataSource === 'cache' ? 'bg-emerald-500' : dataSource === 'sharepoint' ? 'bg-blue-500' : 'bg-gray-400'}`} />
                                {dataSource === 'cache' ? 'Cargado desde Caché (Alta Velocidad)' : dataSource === 'sharepoint' ? 'Cargado desde SharePoint Online' : 'Cargando datos...'}
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
                            <Button variant="outline" onClick={() => fetchDocuments(true)} disabled={loading} className="bg-white border-gray-100 rounded-xl h-11 px-4 text-gray-600 font-bold hover:bg-gray-50 transition-all shadow-sm">
                                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                                Sincronizar SharePoint
                            </Button>
                            <Button
                                variant="outline"
                                onClick={() => {
                                    const url = `${window.location.origin}/externo/documento-soporte`;
                                    navigator.clipboard.writeText(url).then(() => {
                                        alert("Link del formulario público copiado al portapapeles");
                                    }).catch(() => {
                                        alert("No se pudo copiar el enlace");
                                    });
                                }}
                                className="border-[#254153]/20 text-[#254153] hover:bg-[#254153]/5 rounded-xl h-11 px-4 font-bold transition-all shadow-sm flex items-center gap-2"
                            >
                                <Copy className="h-4 w-4" />
                                Copiar link para proveedor
                            </Button>
                            <Button
                                onClick={() => setIsCreateModalOpen(true)}
                                className="bg-[#254153] hover:bg-[#1a2f3d] text-white rounded-xl h-11 px-4 font-bold shadow-sm transition-all"
                            >
                                Crear documento soporte
                            </Button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {[
                            { label: "Total Documentos", value: documents.length, icon: Paperclip, color: "bg-blue-500", bg: "bg-blue-50" },
                            { label: "Pendientes", value: documents.filter(isPending).length, icon: RefreshCw, color: "bg-amber-500", bg: "bg-amber-50" },
                            { label: "Histórico", value: documents.filter(isProcessed).length, icon: Bell, color: "bg-emerald-500", bg: "bg-emerald-50" }
                        ].map((stat, i) => (
                            <motion.div key={stat.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }} className="bg-white p-6 rounded-3xl border border-gray-100 shadow-[0_8px_30px_rgb(0,0,0,0.02)] flex items-center gap-5 group hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-all cursor-default">
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

                    <div className="flex items-center gap-2 bg-gray-100/50 p-1.5 rounded-2xl w-fit border border-gray-100">
                        <button onClick={() => setActiveTab('pending')} className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 flex items-center gap-2 ${activeTab === 'pending' ? "bg-[#254153] text-white shadow-lg" : "text-gray-500 hover:bg-white/50"}`}>
                            <RefreshCw className={`h-4 w-4 ${activeTab === 'pending' ? 'animate-spin-slow' : ''}`} />
                            Por Aprobar
                            {documents.filter(isPending).length > 0 && <span className={`px-2 py-0.5 rounded-md text-[10px] ${activeTab === 'pending' ? "bg-white/20" : "bg-gray-200"}`}>{documents.filter(isPending).length}</span>}
                        </button>
                        <button onClick={() => setActiveTab('processed')} className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 flex items-center gap-2 ${activeTab === 'processed' ? "bg-[#254153] text-white shadow-lg" : "text-gray-500 hover:bg-white/50"}`}>
                            <Bell className="h-4 w-4" />
                            Histórico
                            {documents.filter(isProcessed).length > 0 && <span className={`px-2 py-0.5 rounded-md text-[10px] ${activeTab === 'processed' ? "bg-white/20" : "bg-gray-200"}`}>{documents.filter(isProcessed).length}</span>}
                        </button>
                    </div>

                    <div className="bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 overflow-hidden w-full">
                        <div style={{ width: '100%', height: '600px' }}>
                            <AgGridReact
                                ref={gridRef}
                                theme={themeQuartz}
                                localeText={AG_GRID_LOCALE_ES}
                                rowData={sortedDocuments}
                                columnDefs={colDefs}
                                onModelUpdated={(e) => setDisplayedRowCount(e.api.getDisplayedRowCount())}
                                defaultColDef={{
                                    sortable: true,
                                    filter: true,
                                    filterParams: {
                                        filterOptions: ['contains'],
                                        suppressAndOrCondition: true,
                                        maxNumConditions: 1,
                                    },
                                    resizable: true,
                                    floatingFilter: true,
                                    suppressMovable: false,
                                }}
                                rowHeight={70}
                                headerHeight={60}
                                floatingFiltersHeight={50}
                                animateRows={true}
                                pagination={false}
                                overlayLoadingTemplate='<span class="ag-overlay-loading-center text-gray-500 font-bold">Cargando documentos...</span>'
                                overlayNoRowsTemplate='<span class="ag-overlay-loading-center text-gray-500 font-bold">No se encontraron resultados</span>'
                            />
                        </div>
                    </div>
                    {!loading && filteredDocuments.length > 0 && (
                        <div className="flex items-center justify-between pt-2">
                            <div className="text-sm text-gray-400 font-medium italic">
                                Mostrando <span className="text-[#254153] font-bold">{displayedRowCount}</span> de <span className="text-gray-600 font-bold">{filteredDocuments.length}</span> registros
                            </div>
                        </div>
                    )}
                </div>
            </main>

            {/* Panel Aprobación Automática (Shared Provider Management) */}
            <AnimatePresence>
                {isProvidersSidebarOpen && (
                    <div className="fixed inset-0 z-[90] flex justify-end">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsProvidersSidebarOpen(false)} className="absolute inset-0 bg-[#254153]/20 backdrop-blur-sm" />
                        <motion.div initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", damping: 25, stiffness: 200 }} className="relative w-full max-w-md bg-white shadow-2xl h-full flex flex-col border-l border-gray-100">
                            <div className="p-6 border-b border-gray-50 flex items-center justify-between">
                                <div>
                                    <h2 className="text-xl font-bold text-[#254153] flex items-center gap-2">
                                        <ShieldCheck className="h-5 w-5 text-green-600" />
                                        Aprobación Automática
                                        <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-normal">
                                            {providers.length.toLocaleString()}
                                        </span>
                                    </h2>
                                    <p className="text-xs text-gray-400 font-medium">Gestión de proveedores compartida</p>
                                </div>
                                <button onClick={() => setIsProvidersSidebarOpen(false)} className="h-9 w-9 flex items-center justify-center rounded-full bg-gray-100 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors">
                                    <X className="h-5 w-5" />
                                </button>
                            </div>
                            <div className="p-4 border-b border-gray-50 bg-gray-50/50">
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                    <input type="text" placeholder="Buscar proveedor..." value={providersSearch} onChange={(e) => setProvidersSearch(e.target.value)} className="w-full h-11 pl-10 pr-4 rounded-xl bg-white border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#254153]/10 font-medium" />
                                </div>
                            </div>
                            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                                {loadingProviders ? <div className="animate-pulse space-y-3">{Array.from({length:5}).map((_,i) => <div key={i} className="h-16 bg-gray-50 rounded-xl"/>)}</div> : (
                                    providers.filter(p => p.razon_social?.toLowerCase().includes(providersSearch.toLowerCase()) || p.numero_identificacion?.includes(providersSearch)).map((p) => (
                                        <div key={p.id} className={`p-4 rounded-2xl border transition-all ${p.aprobacion_automatica ? 'bg-green-50/30 border-green-100' : 'bg-white border-gray-100'}`}>
                                            <div className="flex items-center justify-between">
                                                <div className="flex-1 min-w-0 pr-4">
                                                    <p className={`text-sm font-bold truncate ${p.aprobacion_automatica ? 'text-green-800' : 'text-[#254153]'}`}>{p.razon_social || 'S/N'}</p>
                                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-tight">Nit: {p.numero_identificacion}</p>
                                                </div>
                                                <Switch checked={!!p.aprobacion_automatica} onChange={() => toggleProviderAutoApproval(p.id, !!p.aprobacion_automatica)} />
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Modal de Detalle de Documento */}
            <AnimatePresence>
                {selectedDoc && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSelectedDoc(null)} className="absolute inset-0 bg-[#254153]/40 backdrop-blur-md" />
                        <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} className="bg-white rounded-[32px] shadow-2xl w-full max-w-4xl relative overflow-hidden border border-white/20">
                            <div className="p-8">
                                <div className="flex justify-between items-start mb-8">
                                    <div className="flex items-center gap-4">
                                        <div className="h-14 w-14 bg-blue-50 rounded-2xl flex items-center justify-center">
                                            <FileText className="h-7 w-7 text-blue-500" />
                                        </div>
                                        <div>
                                            <h3 className="text-2xl font-black text-[#254153]">Detalle Documento Soporte</h3>
                                            <p className="text-gray-400 font-bold tracking-widest">#{selectedDoc.Nro_Factura}</p>
                                        </div>
                                    </div>
                                    <button onClick={() => setSelectedDoc(null)} className="h-12 w-12 rounded-2xl bg-gray-50 flex items-center justify-center hover:bg-rose-50 hover:text-rose-500 transition-all text-gray-400">
                                        <X className="h-6 w-6" />
                                    </button>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div className="space-y-6">
                                        <div className="bg-gray-50/50 p-6 rounded-[24px] border border-gray-100 space-y-3">
                                            <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest">Proveedor</p>
                                            <p className="text-lg font-black text-[#254153] leading-tight">{selectedDoc.Proveedor}</p>
                                            <p className="text-sm font-bold text-gray-500">NIT: {selectedDoc.Nit}</p>
                                        </div>
                                        <div className="bg-gray-50/50 p-6 rounded-[24px] border border-gray-100 grid grid-cols-2 gap-4">
                                            <div>
                                                <p className="text-[11px] font-bold text-gray-400 uppercase">Valor Total</p>
                                                <p className="text-xl font-black text-[#254153]">{formatCurrency(selectedDoc.Monto)}</p>
                                            </div>
                                            <div>
                                                <p className="text-[11px] font-bold text-gray-400 uppercase">Fecha Registro</p>
                                                <p className="font-bold text-gray-600">{selectedDoc.Created ? new Date(selectedDoc.Created).toLocaleDateString() : "N/A"}</p>
                                            </div>
                                        </div>
                                        {selectedDoc.Attachments && (
                                            <div className="bg-blue-50/50 p-6 rounded-[24px] border border-blue-100 flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <Paperclip className="h-5 w-5 text-blue-500" />
                                                    <p className="text-sm font-bold text-blue-700">Documento Adjunto disponible</p>
                                                </div>
                                                <a href={`https://firplaksa.sharepoint.com/sites/FPKContabilidad/Lists/Documento_Soporte/DispForm.aspx?ID=${selectedDoc.id}`} target="_blank" rel="noreferrer" className="px-4 py-2 bg-white rounded-xl text-xs font-bold text-blue-600 shadow-sm border border-blue-100">Ver en SP</a>
                                            </div>
                                        )}
                                    </div>

                                    <div className="space-y-6">
                                        <div className="bg-gray-50/50 p-6 rounded-[24px] border border-gray-100 space-y-4">
                                            <h4 className="text-[11px] font-black text-gray-400 uppercase tracking-widest">Aprobación</h4>
                                            <div>
                                                <p className="text-[11px] font-bold text-gray-400 uppercase mb-1">Responsable</p>
                                                {!isEditingResponsible ? (
                                                    <div className="flex items-center gap-2 group cursor-pointer" onClick={() => setIsEditingResponsible(true)}>
                                                        <p className="font-extrabold text-[#254153]">{selectedDoc.Responsable_de_Autorizar}</p>
                                                        <Edit2 className="h-3 w-3 text-gray-300 group-hover:text-blue-500" />
                                                    </div>
                                                ) : (
                                                    <div className="relative">
                                                        <input autoFocus type="text" placeholder="Buscar persona..." className="w-full pl-3 pr-4 py-2 bg-white border border-blue-100 rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-500/20" value={userSearchQuery} onChange={(e) => setUserSearchQuery(e.target.value)} />
                                                        {userSearchResults.length > 0 && (
                                                            <div className="absolute z-[110] left-0 right-0 mt-1 bg-white border rounded-2xl shadow-xl max-h-[200px] overflow-y-auto">
                                                                {userSearchResults.map(u => (
                                                                    <button key={u.id} onClick={() => {setPendingResponsibleUser(u); setIsEditingResponsible(false);}} className="w-full px-4 py-2 text-left hover:bg-blue-50 text-xs font-bold border-b last:border-0">{u.name}</button>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                            <div>
                                                <p className="text-[11px] font-bold text-gray-400 uppercase mb-1.5">Estado</p>
                                                <span className={`inline-flex px-4 py-1.5 rounded-full text-xs font-black border ${getStatusStyles(selectedDoc.Aprobacion_Doliente)}`}>{selectedDoc.Aprobacion_Doliente}</span>
                                            </div>
                                        </div>
                                        
                                        {pendingResponsibleUser && (
                                            <Button onClick={handleUpdateResponsible} disabled={isUpdatingResponsible} className="w-full h-14 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-black">
                                                {isUpdatingResponsible ? <Loader2 className="animate-spin h-5 w-5 mx-auto"/> : "Guardar Nuevo Responsable"}
                                            </Button>
                                        )}

                                        <div className="p-6 bg-[#254153]/5 rounded-[24px] border border-[#254153]/10">
                                            <p className="text-[11px] font-bold text-gray-400 uppercase mb-1">Observaciones</p>
                                            <p className="text-sm font-medium text-gray-600 italic">"{selectedDoc.Observaciones || 'Sin observaciones'}"</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            <CreateSupportDocumentModal
                isOpen={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
                onSuccess={() => fetchDocuments(true)}
            />
        </div>
    );
}
