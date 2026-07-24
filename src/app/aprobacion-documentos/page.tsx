"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { supabase } from "@/lib/supabaseClient";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Bell, RefreshCw, Paperclip, ChevronLeft, ChevronRight, Loader2, FileText, Edit2, User, X, Check, Copy, ShieldCheck, DollarSign, Download, CloudUpload } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Switch";
import { useSidebar } from "@/context/SidebarContext";
import { Menu } from "lucide-react";
import { CreateSupportDocumentModal } from "@/components/modals/CreateSupportDocumentModal";
import { useAuth } from "@/context/AuthContext";
import { ProviderRuleManager } from '@/components/ProviderRuleManager';
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

const renderCostCenterForModal = (costCenterStr: any, tableCostStr: any) => {
    if (!costCenterStr && !tableCostStr) return <span className="text-gray-400 italic">Sin asignar</span>;
    
    if (costCenterStr) {
        try {
            const parsed = typeof costCenterStr === 'string' ? JSON.parse(costCenterStr) : costCenterStr;
            if (Array.isArray(parsed) && parsed.length > 0) {
                return (
                    <div className="flex flex-col gap-2">
                        {parsed.map((p: any, i: number) => (
                            <div key={i} className="flex flex-col bg-gray-50 p-3 rounded-lg border border-gray-100">
                                <div className="text-[10px] text-gray-500 font-bold uppercase mb-0.5">Centro de Costo</div>
                                <div className="text-sm font-black text-[#254153] mb-2 cursor-text select-text">{p.centroCosto || 'N/A'}</div>
                                <div className="text-[10px] text-gray-500 font-bold uppercase mb-0.5">Cuenta</div>
                                <div className="text-sm font-black text-[#254153] mb-2 cursor-text select-text">{p.cuenta || 'N/A'}</div>
                                {p.valor !== undefined && p.valor !== "" && (
                                    <>
                                        <div className="text-[10px] text-gray-500 font-bold uppercase mb-0.5">Valor Asignado</div>
                                        <div className="text-sm font-black text-[#254153] cursor-text select-text">
                                            {!isNaN(Number(p.valor)) ? new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(Number(p.valor)) : p.valor}
                                        </div>
                                    </>
                                )}
                            </div>
                        ))}
                    </div>
                );
            }
        } catch (e) {
            return <div className="text-sm font-bold text-[#254153] whitespace-pre-wrap cursor-text select-text">{String(costCenterStr)}</div>;
        }
    }
    
    if (tableCostStr) {
        if (typeof tableCostStr === 'object' && tableCostStr.Url) {
            return <a href={tableCostStr.Url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline text-sm font-bold">Ver tabla adjunta</a>;
        }
        return <div className="text-sm font-bold text-[#254153] whitespace-pre-wrap cursor-text select-text">{String(tableCostStr)}</div>;
    }
    
    return <span className="text-gray-400 italic">Sin asignar</span>;
};

export default function SupportDocumentsPage() {
    const { toggleSidebar } = useSidebar();
    const { role, user } = useAuth();
    const [documents, setDocuments] = useState<any[]>([]);
    const [pendingCount, setPendingCount] = useState(0);
    const [processedCount, setProcessedCount] = useState(0);
    const [toProcessCount, setToProcessCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [activeTab, setActiveTab] = useState<'pending' | 'to_process' | 'processed'>('pending');
    const [selectedDoc, setSelectedDoc] = useState<SharePointDocument | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [previewError, setPreviewError] = useState<string | null>(null);
    const [expandedPdfUrl, setExpandedPdfUrl] = useState<string | null>(null);

    const getProcesadoPorName = (email?: string) => {
        if (!email) return "Desconocido";
        const e = email.toLowerCase();
        if (e.includes("mateo.benavides")) return "Mateo Benavides Rios";
        if (e.includes("duvan.ramirez")) return "Duvan Esteban Ramirez Rua";
        if (e.includes("practicontabilidad")) return "Jesús Angel Villalobos Rincon";
        return email;
    };

    useEffect(() => {
        if (selectedDoc) {
            handlePreview(selectedDoc);
        } else {
            setPreviewUrl(null);
            setPreviewError(null);
        }
    }, [selectedDoc]);

    const handlePreview = async (doc: any) => {
        try {
            setPreviewError(null);
            setPreviewLoading(true);
            
            const res = await fetch(`/api/externo/documento/${doc.id}`);
            const data = await res.json();
            
            if (data.error) {
                throw new Error(data.error);
            }
            
            if (data.documentInfo?.pdfUrl || data.documentInfo?.fileName) {
                setPreviewUrl(`/api/externo/documento/${doc.id}/download`);
            } else {
                throw new Error("No se encontraron adjuntos PDF válidos");
            }
        } catch (err: any) {
            console.error('Preview error:', err);
            setPreviewError(err.message || "No se pudo cargar la vista previa");
        } finally {
            setPreviewLoading(false);
        }
    };
    const [selectedResponsable, setSelectedResponsable] = useState<string>("all");
    const [isEditingResponsible, setIsEditingResponsible] = useState(false);
    const [userSearchQuery, setUserSearchQuery] = useState("");
    const [userSearchResults, setUserSearchResults] = useState<any[]>([]);
    const [isSearchingUsers, setIsSearchingUsers] = useState(false);
    const [isUpdatingResponsible, setIsUpdatingResponsible] = useState(false);
    const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
    const [syncingId, setSyncingId] = useState<string | null>(null);
    const [isEditingObservaciones, setIsEditingObservaciones] = useState(false);
    const [tempObservaciones, setTempObservaciones] = useState("");
    const [pendingResponsibleUser, setPendingResponsibleUser] = useState<any>(null);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    
    // For auto-approval (using same providers table)
    const [isProvidersSidebarOpen, setIsProvidersSidebarOpen] = useState(false);
    const [providers, setProviders] = useState<any[]>([]);
    const [providersSearch, setProvidersSearch] = useState("");
    const [loadingProviders, setLoadingProviders] = useState(false);
    const [centrosCostosList, setCentrosCostosList] = useState<any[]>([]);
    const [cuentasList, setCuentasList] = useState<any[]>([]);
    const [showOnlyActive, setShowOnlyActive] = useState(false);

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
        FechaAprobacion: item.FechaAprobacion || item.fecha_aprobacion || null,
        Anticipo: item.Anticipo || item.anticipo || "N/A",
        Created: item.fecha_creacion || item.Created || item.created_at,
        centro_costos: item.centro_costos || item.CentroCostos || item.Centro_x0020_de_x0020_Costos || "",
        tablaCostos: item.tablaCostos || item.TablaCostos || ""
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
            const response = await fetch(`/api/sharepoint/documentos/all`); 
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
        if (activeTab === 'processed' || activeTab === 'to_process') {
            fetchHistory();
        }
    }, [activeTab]);

    const router = useRouter();

    useEffect(() => {
        const checkUser = async () => {
            try {
                const { data: { session }, error } = await supabase.auth.getSession();
                if (error || !session) {
                    if (error) console.error("Error de autenticación:", error.message);
                    await supabase.auth.signOut();
                    router.push("/login");
                } else {
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
        setIsEditingObservaciones(false);
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

    const handleManualSapSync = async (doc: SharePointDocument, isAuto: boolean = false) => {
        if (!isAuto && !confirm(`¿Estás seguro de crear un documento preliminar en SAP para el documento soporte ${doc.Nro_Factura}?`)) return;
        
        setSyncingId(doc.id.toString());
        try {
            const res = await fetch("/api/sap/manual-draft", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ invoiceId: doc.id, source: "Documento_Soporte" })
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

    const handleUpdateStatus = async (field: 'Aprobacion_Doliente' | 'Gestion_Contabilidad' | 'Observaciones', value: string, procesadoPor?: string) => {
        if (!selectedDoc) return;
        if (field === 'Gestion_Contabilidad' && value === 'Procesado' && !procesadoPor) {
            alert("Debes seleccionar quién procesa antes de cambiar el estado a Procesado.");
            return;
        }

        setIsUpdatingStatus(true);
        try {
            const body: any = {
                itemId: selectedDoc.id,
                status: value,
                listName: 'Documento_Soporte',
                field
            };
            if (procesadoPor) {
                body.procesadoPor = procesadoPor;
            }

            const res = await fetch("/api/sharepoint/update-status", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body)
            });

            if (res.ok) {
                if (field === 'Aprobacion_Doliente' && value === 'Aprobado') {
                    await handleManualSapSync(selectedDoc, true);
                }

                const nowIso = new Date().toISOString();
                const updatedDocs = documents.map(doc => {
                    if (doc.id === selectedDoc.id) {
                        const newDoc = { ...doc, [field]: value };
                        if (field === 'Aprobacion_Doliente' && value === 'Aprobado') {
                            newDoc.Gestion_Contabilidad = 'Por Procesar';
                        }
                        if (field === 'Gestion_Contabilidad' && value === 'Procesado') {
                            newDoc.FechaProcesado = nowIso;
                            if (procesadoPor) newDoc.ProcesadoPor = procesadoPor;
                        }
                        return newDoc;
                    }
                    return doc;
                });
                setDocuments(updatedDocs);
                
                const newSelected = { ...selectedDoc, [field]: value };
                if (field === 'Aprobacion_Doliente' && value === 'Aprobado') {
                    newSelected.Gestion_Contabilidad = 'Por Procesar';
                }
                if (field === 'Gestion_Contabilidad' && value === 'Procesado') {
                    newSelected.FechaProcesado = nowIso;
                    if (procesadoPor) newSelected.ProcesadoPor = procesadoPor;
                }
                setSelectedDoc(newSelected);
                alert("Estado actualizado correctamente");
            } else {
                const data = await res.json();
                alert(`Error al actualizar estado: ${data.error}`);
            }
        } catch (error) {
            console.error("Error updating status:", error);
            alert("Error de conexión al actualizar el estado");
        } finally {
            setIsUpdatingStatus(false);
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
                .select('id, razon_social, numero_identificacion, aprobacion_automatica, proveedor_aprobacion_reglas(id, valor, porcentaje_desviacion, centro_costos, cuenta)')
                .order('razon_social', { ascending: true });

            if (search) {
                query = query.or(`razon_social.ilike.%${search}%,numero_identificacion.ilike.%${search}%`);
            }
            if (showOnlyActive) {
                query = query.eq('aprobacion_automatica', true);
            }
            
            // Limitamos a 500 para que sea rápido, si busca algo específico lo encontrará
            const { data, error } = await query.limit(500);

            if (error) throw error;

            if (search) {
                // Si es búsqueda, reemplazamos los resultados
                const sortedData = (data || []).sort((a, b) => {
                    if (a.aprobacion_automatica && !b.aprobacion_automatica) return -1;
                    if (!a.aprobacion_automatica && b.aprobacion_automatica) return 1;
                    return (a.razon_social || '').localeCompare(b.razon_social || '');
                });
                setProviders(sortedData);
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
                    return combined.sort((a, b) => {
                        if (a.aprobacion_automatica && !b.aprobacion_automatica) return -1;
                        if (!a.aprobacion_automatica && b.aprobacion_automatica) return 1;
                        return (a.razon_social || '').localeCompare(b.razon_social || '');
                    });
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
    }, [providersSearch, showOnlyActive, isProvidersSidebarOpen]);

    const fetchCatalogos = async () => {
        if (centrosCostosList.length > 0) return; // Ya están cargados
        try {
            const res = await fetch('/api/externo/catalogos');
            const data = await res.json();
            if (!data.error) {
                setCentrosCostosList(data.centrosCostos || []);
                setCuentasList(data.cuentas || []);
            }
        } catch (err) {
            console.error('Error fetching catalogos:', err);
        }
    };

    useEffect(() => {
        if (isProvidersSidebarOpen) {
            fetchCatalogos();
        }
    }, [isProvidersSidebarOpen]);

    const checkOverlap = (rules: any[], newValue: number, newDev: number) => {
        const newMin = newValue - (newValue * newDev / 100);
        const newMax = newValue + (newValue * newDev / 100);
        
        for (const rule of rules) {
            const rMin = rule.valor - (rule.valor * rule.porcentaje_desviacion / 100);
            const rMax = rule.valor + (rule.valor * rule.porcentaje_desviacion / 100);
            
            if (Math.max(newMin, rMin) <= Math.min(newMax, rMax)) {
                return true;
            }
        }
        return false;
    };

    const addProviderRule = async (providerId: string, rule: any) => {
        const provider = providers.find(p => p.id === providerId);
        if (!provider) return false;
        
        const rules = provider.proveedor_aprobacion_reglas || [];
        if (checkOverlap(rules, rule.valor, rule.porcentaje_desviacion)) {
            alert('El valor y desviación ingresados se solapan con un valor existente para este proveedor.');
            return false;
        }

        try {
            const { data, error } = await supabase
                .from('proveedor_aprobacion_reglas')
                .insert({
                    proveedor_id: providerId,
                    valor: rule.valor,
                    porcentaje_desviacion: rule.porcentaje_desviacion,
                    centro_costos: rule.centro_costos,
                    cuenta: rule.cuenta
                })
                .select();

            if (error) throw error;

            setProviders(prev => prev.map(p => 
                p.id === providerId 
                ? { ...p, proveedor_aprobacion_reglas: [...(p.proveedor_aprobacion_reglas || []), data[0]] } 
                : p
            ));
            return true;
        } catch (error) {
            console.error('Error adding rule:', error);
            alert('Error al guardar el valor.');
            return false;
        }
    };

    const deleteProviderRule = async (providerId: string, ruleId: string) => {
        try {
            const { error } = await supabase
                .from('proveedor_aprobacion_reglas')
                .delete()
                .eq('id', ruleId);
                
            if (error) throw error;

            setProviders(prev => prev.map(p => 
                p.id === providerId 
                ? { ...p, proveedor_aprobacion_reglas: (p.proveedor_aprobacion_reglas || []).filter((r: any) => r.id !== ruleId) } 
                : p
            ));
        } catch (error) {
            console.error('Error deleting rule:', error);
            alert('Error al eliminar el valor.');
        }
    };

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

    const isToProcess = (doc: SharePointDocument) => {
        const state = (doc.Aprobacion_Doliente || "").toLowerCase();
        const contabilidad = (doc.Gestion_Contabilidad || "").toLowerCase();
        return state.includes("aprobado") && !contabilidad.includes("procesado") && !state.includes("rechazado");
    };

    const isProcessed = (doc: SharePointDocument) => {
        const state = (doc.Aprobacion_Doliente || "").toLowerCase();
        const contabilidad = (doc.Gestion_Contabilidad || "").toLowerCase();
        return contabilidad.includes("procesado") || state.includes("rechazado") || contabilidad.includes("rechazado");
    };

    const filteredDocuments = documents.filter(doc => {
        const matchesSearch = !searchTerm ||
            doc.Nro_Factura?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            doc.Proveedor?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            doc.Nit?.toLowerCase().includes(searchTerm.toLowerCase());

        const matchesTab = activeTab === 'pending' ? isPending(doc) : activeTab === 'to_process' ? isToProcess(doc) : isProcessed(doc);
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
                        {role !== 'viewer' && (
                        <Button variant="outline" onClick={() => handleManualSapSync(doc)} disabled={syncingId === doc.id.toString()} className="h-8 w-8 p-0 text-gray-400 border-gray-100 hover:bg-emerald-50 hover:text-emerald-600 bg-white rounded-lg transition-all shadow-sm flex items-center justify-center" title="Cargar a SAP">
                            {syncingId === doc.id.toString() ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CloudUpload className="h-3.5 w-3.5" />}
                        </Button>
                        )}
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
        { headerName: 'Datos adjuntos', field: 'adjuntos_url', width: 150, filter: false, sortable: false, cellRenderer: (p: any) => <div className="h-full flex items-center">{p.data?.pdf_url || p.data?.adjunto ? <a href={`/api/externo/documento/${p.data.id}/download`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-all border border-blue-100/50" title="Ver Documento Adjunto"><FileText className="h-3.5 w-3.5" /><span className="text-[10px] font-black uppercase tracking-tight">Ver Adjunto</span></a> : <span className="text-[10px] text-gray-300 font-medium italic">Sin adjuntos</span>}</div> }
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
                            {role !== 'viewer' && (
                            <button
                                onClick={() => setIsProvidersSidebarOpen(true)}
                                className="h-10 px-4 flex items-center gap-2 rounded-full bg-[#254153]/5 text-[#254153] hover:bg-[#254153]/10 transition-colors text-xs font-bold"
                            >
                                <ShieldCheck className="h-4 w-4" />
                                <span className="hidden lg:inline">Aprobación Automática</span>
                            </button>
                            )}
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
                                variant="outline"
                                onClick={handleExportExcel}
                                className="border-[#254153]/20 text-[#254153] hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-200 rounded-xl h-11 px-4 font-bold transition-all shadow-sm flex items-center gap-2"
                            >
                                <Download className="h-4 w-4" />
                                <span className="hidden lg:inline">Descargar Excel</span>
                            </Button>
                            {role !== 'viewer' && (
                            <Button
                                onClick={() => setIsCreateModalOpen(true)}
                                className="bg-[#254153] hover:bg-[#1a2f3d] text-white rounded-xl h-11 px-4 font-bold shadow-sm transition-all"
                            >
                                Crear documento soporte
                            </Button>
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                        {[
                            { label: "Total Documentos", value: documents.length, icon: Paperclip, color: "bg-blue-500", bg: "bg-blue-50" },
                            { label: "Por Aprobar", value: documents.filter(isPending).length, icon: RefreshCw, color: "bg-amber-500", bg: "bg-amber-50" },
                            { label: "Por Procesar", value: documents.filter(isToProcess).length, icon: Loader2, color: "bg-indigo-500", bg: "bg-indigo-50" },
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
                        <button onClick={() => setActiveTab('to_process')} className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 flex items-center gap-2 ${activeTab === 'to_process' ? "bg-[#254153] text-white shadow-lg" : "text-gray-500 hover:bg-white/50"}`}>
                            <Loader2 className={`h-4 w-4 ${activeTab === 'to_process' ? 'animate-spin-slow' : ''}`} />
                            Por Procesar
                            {documents.filter(isToProcess).length > 0 && <span className={`px-2 py-0.5 rounded-md text-[10px] ${activeTab === 'to_process' ? "bg-white/20" : "bg-gray-200"}`}>{documents.filter(isToProcess).length}</span>}
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
                                <div className="flex items-center mt-3">
                                    <button
                                        onClick={() => setShowOnlyActive(!showOnlyActive)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                                            showOnlyActive 
                                            ? 'bg-green-100 text-green-700 border border-green-200' 
                                            : 'bg-white text-gray-500 hover:bg-gray-100 border border-gray-200 shadow-xs'
                                        }`}
                                    >
                                        <Check className="h-3 w-3" /> Proveedores Activos
                                    </button>
                                </div>
                            </div>
                            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                                {loadingProviders ? <div className="animate-pulse space-y-3">{Array.from({length:5}).map((_,i) => <div key={i} className="h-16 bg-gray-50 rounded-xl"/>)}</div> : (
                                    providers
                                        .filter(p =>
                                            (!showOnlyActive || p.aprobacion_automatica) &&
                                            (p.razon_social?.toLowerCase().includes(providersSearch.toLowerCase()) ||
                                            p.numero_identificacion?.includes(providersSearch))
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
                                                    <ProviderRuleManager 
                                                        provider={p} 
                                                        onAddRule={(r) => addProviderRule(p.id, r)} 
                                                        onDeleteRule={(rId) => deleteProviderRule(p.id, rId)}
                                                        centrosCostosList={centrosCostosList}
                                                        cuentasList={cuentasList}
                                                    />
                                                )}
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
                        <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} className="bg-white rounded-[32px] shadow-2xl w-full max-w-4xl relative overflow-hidden border border-white/20 flex flex-col max-h-[90vh]">
                            <div className="p-8 overflow-y-auto custom-scrollbar flex-1">
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
                                        <div className="bg-gray-50/50 p-6 rounded-[24px] border border-gray-100 space-y-4">
                                            <h4 className="text-[11px] font-black text-gray-400 uppercase tracking-[2px]">Información del Proveedor</h4>
                                            <div className="space-y-3">
                                                <div>
                                                    <p className="text-[11px] font-bold text-gray-400 uppercase">Proveedor</p>
                                                    <p className="text-lg font-black text-[#254153] leading-tight">{selectedDoc.Proveedor || "N/A"}</p>
                                                </div>
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div>
                                                        <p className="text-[11px] font-bold text-gray-400 uppercase">NIT</p>
                                                        <p className="font-bold text-gray-600">{selectedDoc.Nit || "N/A"}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-[11px] font-bold text-gray-400 uppercase">Consecutivo</p>
                                                        <p className="font-bold text-gray-600">{selectedDoc.Nro_Factura || "S/N"}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="bg-gray-50/50 p-6 rounded-[24px] border border-gray-100 space-y-4">
                                            <h4 className="text-[11px] font-black text-gray-400 uppercase tracking-[2px]">Montos y Fechas</h4>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <p className="text-[11px] font-bold text-gray-400 uppercase">Valor Total</p>
                                                    <p className="text-xl font-black text-[#254153]">{formatCurrency(selectedDoc.Monto)}</p>
                                                </div>
                                                <div>
                                                    <p className="text-[11px] font-bold text-gray-400 uppercase">Fecha Registro</p>
                                                    <p className="font-bold text-gray-600">{selectedDoc.Created ? new Date(selectedDoc.Created).toLocaleDateString() : "N/A"}</p>
                                                </div>
                                                <div>
                                                    <p className="text-[11px] font-bold text-gray-400 uppercase">Fecha Aprobación</p>
                                                    <p className="font-bold text-gray-600">
                                                        {selectedDoc.FechaAprobacion ? new Date(selectedDoc.FechaAprobacion).toLocaleString() : "Pendiente"}
                                                    </p>
                                                </div>
                                                <div>
                                                    <p className="text-[11px] font-bold text-gray-400 uppercase">Anticipo / Tarjeta</p>
                                                    <p className="font-bold text-gray-600">{selectedDoc.Anticipo || "N/A"}</p>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="bg-gray-50/50 p-6 rounded-[24px] border border-gray-100 space-y-4">
                                            <h4 className="text-[11px] font-black text-gray-400 uppercase tracking-[2px]">Centro de Costos y Cuenta</h4>
                                            <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                                                {renderCostCenterForModal(selectedDoc.centro_costos, selectedDoc.tablaCostos)}
                                            </div>
                                        </div>

                                        <div className="bg-gray-50/50 p-6 rounded-[24px] border border-gray-100 space-y-4">
                                            <div className="flex items-center justify-between">
                                                <h4 className="text-[11px] font-black text-gray-400 uppercase tracking-[2px]">Observaciones</h4>
                                                {!isEditingObservaciones && role !== 'viewer' && (
                                                    <button onClick={() => { setIsEditingObservaciones(true); setTempObservaciones(selectedDoc.Observaciones || ""); }} className="text-blue-500 hover:text-blue-600 transition-colors p-1 flex items-center gap-1 text-[10px] font-bold uppercase">
                                                        <Edit2 className="h-3 w-3" />
                                                        Editar
                                                    </button>
                                                )}
                                            </div>
                                            <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                                                {!isEditingObservaciones ? (
                                                    <p className="text-sm font-medium text-gray-600 italic whitespace-pre-wrap">"{selectedDoc.Observaciones || 'Sin observaciones'}"</p>
                                                ) : (
                                                    <div className="space-y-3">
                                                        <textarea 
                                                            autoFocus
                                                            className="w-full min-h-[100px] p-3 text-sm text-gray-700 bg-gray-50 border border-blue-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none" 
                                                            value={tempObservaciones} 
                                                            onChange={(e) => setTempObservaciones(e.target.value)}
                                                            placeholder="Escribe las observaciones aquí..."
                                                        />
                                                        <div className="flex justify-end gap-2">
                                                            <Button variant="outline" size="sm" onClick={() => setIsEditingObservaciones(false)} className="h-8 text-xs font-bold" disabled={isUpdatingStatus}>Cancelar</Button>
                                                            <Button size="sm" onClick={async () => { await handleUpdateStatus('Observaciones', tempObservaciones); setIsEditingObservaciones(false); }} className="h-8 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold" disabled={isUpdatingStatus}>
                                                                {isUpdatingStatus ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3 mr-1" />}
                                                                Guardar
                                                            </Button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <div className="bg-gray-50/50 p-6 rounded-[24px] border border-gray-100 space-y-4">
                                            <div className="flex items-center justify-between">
                                                <h4 className="text-[11px] font-black text-gray-400 uppercase tracking-[2px]">Documentos Adjuntos</h4>
                                                <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-lg text-[9px] font-black uppercase">LINKS</span>
                                            </div>
                                            <div className="space-y-3">
                                                {/* Documento Principal */}
                                                <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex items-center justify-between group cursor-pointer hover:border-blue-200 transition-colors" onClick={() => { window.open(`/api/externo/documento/${selectedDoc.id}/download?download=true`, '_blank'); }}>
                                                    <div className="flex items-center gap-3">
                                                        <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center group-hover:bg-blue-100 transition-colors">
                                                            <FileText className="h-5 w-5 text-blue-500" />
                                                        </div>
                                                        <div>
                                                            <p className="text-sm font-bold text-[#254153]">Documento_Principal_{selectedDoc.id}</p>
                                                            <p className="text-[10px] text-gray-400 font-medium mt-0.5">Ver Documento</p>
                                                        </div>
                                                    </div>
                                                    <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-blue-500 transition-colors" />
                                                </div>

                                                {/* Anexos Adicionales */}
                                                {(() => {
                                                    try {
                                                        const anexos = selectedDoc.adjunto ? JSON.parse(selectedDoc.adjunto) : null;
                                                        if (Array.isArray(anexos)) {
                                                            return anexos.map((anexo, idx) => (
                                                                <div key={idx} className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex items-center justify-between group cursor-pointer hover:border-emerald-200 transition-colors" onClick={() => window.open(anexo.url, '_blank')}>
                                                                    <div className="flex items-center gap-3">
                                                                        <div className="h-10 w-10 rounded-lg bg-emerald-50 flex items-center justify-center group-hover:bg-emerald-100 transition-colors">
                                                                            <FileText className="h-5 w-5 text-emerald-500" />
                                                                        </div>
                                                                        <div className="overflow-hidden">
                                                                            <p className="text-sm font-bold text-[#254153] truncate max-w-[150px]">{anexo.name || `Anexo_${idx + 1}`}</p>
                                                                            <p className="text-[10px] text-gray-400 font-medium mt-0.5">Ver Anexo</p>
                                                                        </div>
                                                                    </div>
                                                                    <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-emerald-500 transition-colors" />
                                                                </div>
                                                            ));
                                                        } else if (selectedDoc.adjunto && selectedDoc.adjunto !== selectedDoc.pdf_url) {
                                                            // Legacy format where adjunto is just a single string URL and different from pdf_url
                                                            return (
                                                                <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex items-center justify-between group cursor-pointer hover:border-emerald-200 transition-colors" onClick={() => window.open(selectedDoc.adjunto, '_blank')}>
                                                                    <div className="flex items-center gap-3">
                                                                        <div className="h-10 w-10 rounded-lg bg-emerald-50 flex items-center justify-center group-hover:bg-emerald-100 transition-colors">
                                                                            <FileText className="h-5 w-5 text-emerald-500" />
                                                                        </div>
                                                                        <div>
                                                                            <p className="text-sm font-bold text-[#254153]">Anexo_Adicional</p>
                                                                            <p className="text-[10px] text-gray-400 font-medium mt-0.5">Ver Anexo</p>
                                                                        </div>
                                                                    </div>
                                                                    <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-emerald-500 transition-colors" />
                                                                </div>
                                                            );
                                                        }
                                                    } catch (e) {
                                                        // Ignore parsing errors, meaning it's a raw URL. If it's different from pdf_url, show it.
                                                        if (selectedDoc.adjunto && selectedDoc.adjunto !== selectedDoc.pdf_url && selectedDoc.adjunto.startsWith('http')) {
                                                            return (
                                                                <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex items-center justify-between group cursor-pointer hover:border-emerald-200 transition-colors" onClick={() => window.open(selectedDoc.adjunto, '_blank')}>
                                                                    <div className="flex items-center gap-3">
                                                                        <div className="h-10 w-10 rounded-lg bg-emerald-50 flex items-center justify-center group-hover:bg-emerald-100 transition-colors">
                                                                            <FileText className="h-5 w-5 text-emerald-500" />
                                                                        </div>
                                                                        <div>
                                                                            <p className="text-sm font-bold text-[#254153]">Anexo_Adicional</p>
                                                                            <p className="text-[10px] text-gray-400 font-medium mt-0.5">Ver Anexo</p>
                                                                        </div>
                                                                    </div>
                                                                    <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-emerald-500 transition-colors" />
                                                                </div>
                                                            );
                                                        }
                                                    }
                                                    return null;
                                                })()}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-6">
                                        <div className="bg-gray-50/50 p-6 rounded-[24px] border border-gray-100 space-y-4">
                                            <h4 className="text-[11px] font-black text-gray-400 uppercase tracking-[2px]">Gestión y Aprobación</h4>
                                            
                                            <div>
                                                <p className="text-[11px] font-bold text-gray-400 uppercase mb-1.5">Estado Aprobación</p>
                                                <select
                                                    value={selectedDoc.Aprobacion_Doliente || "Pendiente"}
                                                    onChange={(e) => handleUpdateStatus('Aprobacion_Doliente', e.target.value)}
                                                    disabled={isUpdatingStatus || role === 'viewer'}
                                                    className={`w-full appearance-none px-4 py-2 rounded-xl text-xs font-black border focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all ${getStatusStyles(selectedDoc.Aprobacion_Doliente)} cursor-pointer disabled:opacity-50`}
                                                >
                                                    <option value="Pendiente">Pendiente</option>
                                                    <option value="Por Aprobar">Por Aprobar</option>
                                                    <option value="Aprobado">Aprobado</option>
                                                    <option value="Rechazado">Rechazado</option>
                                                </select>
                                            </div>

                                            <div>
                                                <p className="text-[11px] font-bold text-gray-400 uppercase mb-1">Responsable de Autorizar</p>
                                                {!isEditingResponsible ? (
                                                    <div className={`flex items-center gap-2 ${role !== 'viewer' ? 'group cursor-pointer' : ''}`} onClick={() => { if (role !== 'viewer') setIsEditingResponsible(true); }}>
                                                        <p className="font-extrabold text-[#254153]">{selectedDoc.Responsable_de_Autorizar}</p>
                                                        {role !== 'viewer' && <Edit2 className="h-3 w-3 text-gray-300 group-hover:text-blue-500" />}
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
                                                <p className="text-[11px] font-bold text-gray-400 uppercase mb-1.5">Gestión Contabilidad</p>
                                                <select
                                                    value={selectedDoc.Gestion_Contabilidad || "Pendiente"}
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        if (val === 'Procesado') {
                                                            handleUpdateStatus('Gestion_Contabilidad', val, getProcesadoPorName(user?.email));
                                                        } else {
                                                            handleUpdateStatus('Gestion_Contabilidad', val);
                                                        }
                                                    }}
                                                    disabled={isUpdatingStatus || role === 'viewer'}
                                                    className="w-full appearance-none px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm font-bold text-[#254153] focus:outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer disabled:opacity-50"
                                                >
                                                    <option value="Pendiente">Pendiente</option>
                                                    <option value="Por Procesar">Por Procesar</option>
                                                    <option value="Procesado">Procesado</option>
                                                    <option value="Rechazado">Rechazado</option>
                                                </select>
                                            </div>
                                        </div>
                                        
                                        {pendingResponsibleUser && (
                                            <Button onClick={handleUpdateResponsible} disabled={isUpdatingResponsible} className="w-full h-14 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-black">
                                                {isUpdatingResponsible ? <Loader2 className="animate-spin h-5 w-5 mx-auto"/> : "Guardar Nuevo Responsable"}
                                            </Button>
                                        )}

                                        <div className="grid grid-cols-2 gap-4 pt-2">
                                            <Button 
                                                variant="outline" 
                                                onClick={() => handleManualSapSync(selectedDoc)}
                                                disabled={syncingId === selectedDoc.id.toString()}
                                                className="h-12 rounded-2xl border-gray-200 hover:bg-emerald-50 hover:text-emerald-600 text-[#254153] font-bold flex items-center justify-center gap-2 transition-all"
                                            >
                                                {syncingId === selectedDoc.id.toString() ? (
                                                    <Loader2 className="h-5 w-5 animate-spin" />
                                                ) : (
                                                    <CloudUpload className="h-5 w-5" />
                                                )}
                                                Cargar a SAP
                                            </Button>
                                            <Button variant="outline" className="h-12 rounded-2xl border-gray-200 hover:bg-gray-50 text-[#254153] font-bold flex items-center justify-center gap-2" onClick={() => window.print()}>
                                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                                                Imprimir
                                            </Button>
                                        </div>

                                        <div className="bg-gray-50/50 p-4 rounded-[24px] border border-gray-100 relative group h-[400px] flex flex-col mt-4">
                                             <div className="flex justify-between items-center mb-3 px-2">
                                                 <h4 className="text-[11px] font-black text-gray-400 uppercase tracking-[2px]">Previsualización</h4>
                                                 <button 
                                                     onClick={() => previewUrl && setExpandedPdfUrl(previewUrl)} 
                                                     className="text-[#254153] hover:bg-[#254153]/10 px-3 py-1.5 rounded-lg transition-all text-xs font-bold flex items-center gap-2"
                                                     disabled={!previewUrl}
                                                 >
                                                     <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/></svg>
                                                     Ampliar
                                                 </button>
                                             </div>
                                             <div className="flex-1 relative rounded-xl overflow-hidden border border-gray-200 bg-white shadow-sm flex items-center justify-center">
                                                {previewLoading ? (
                                                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm z-10 transition-all">
                                                        <Loader2 className="h-8 w-8 text-[#254153] animate-spin mb-3" />
                                                        <p className="text-[10px] font-black text-[#254153] uppercase tracking-[2px]">Cargando vista previa...</p>
                                                    </div>
                                                ) : previewError ? (
                                                    <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center bg-red-50/50">
                                                        <div className="bg-white p-3 rounded-full shadow-sm mb-3">
                                                            <X className="h-6 w-6 text-red-500" />
                                                        </div>
                                                        <p className="text-[11px] font-black text-red-900 mb-3 px-2">{previewError}</p>
                                                        <Button 
                                                            onClick={() => handlePreview(selectedDoc)} 
                                                            className="h-8 text-[10px] bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl transition-all"
                                                        >
                                                            Reintentar
                                                        </Button>
                                                    </div>
                                                ) : previewUrl ? (
                                                    <>
                                                        <div 
                                                            className="absolute inset-0 z-10 cursor-pointer bg-transparent" 
                                                            onClick={() => setExpandedPdfUrl(previewUrl)} 
                                                            title="Hacer clic para ampliar" 
                                                        />
                                                        <iframe 
                                                            src={`${previewUrl}#toolbar=0&navpanes=0`} 
                                                            className="w-full h-full border-none pointer-events-none" 
                                                            onError={(e) => console.log('Error loading preview iframe')}
                                                        />
                                                    </>
                                                ) : (
                                                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-50/80 backdrop-blur-sm z-10">
                                                        <FileText className="h-8 w-8 text-gray-300 mb-3" />
                                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-[2px]">Sin previsualización</p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Modal de Previsualización Expandida */}
            <AnimatePresence>
                {expandedPdfUrl && (
                    <div className="fixed inset-0 z-[200] bg-[#254153]/90 backdrop-blur-xl flex flex-col">
                        <div className="h-20 flex items-center justify-between px-8 bg-white/5 border-b border-white/10">
                            <div className="flex items-center gap-4">
                                <div className="h-12 w-12 rounded-2xl bg-white/10 flex items-center justify-center">
                                    <FileText className="h-6 w-6 text-white" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-black text-white">Vista Completa del Documento</h3>
                                    <p className="text-white/60 text-sm font-medium">Use los controles del visor para acercar, alejar o imprimir</p>
                                </div>
                            </div>
                            <button onClick={() => setExpandedPdfUrl(null)} className="h-12 px-6 rounded-2xl bg-white/10 hover:bg-white/20 hover:text-white transition-all text-white/70 font-bold flex items-center gap-2">
                                <X className="h-5 w-5" /> Cerrar Visor
                            </button>
                        </div>
                        <div className="flex-1 p-8">
                            <div className="w-full h-full bg-white rounded-2xl overflow-hidden shadow-2xl">
                                <iframe src={expandedPdfUrl} className="w-full h-full border-none" />
                            </div>
                        </div>
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
