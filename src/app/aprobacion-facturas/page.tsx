"use client";

import React, { useEffect, useState, useMemo, useRef } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { supabase } from "@/lib/supabaseClient";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Bell, RefreshCw, Paperclip, ChevronLeft, ChevronRight, Loader2, FileText, Edit2, User, X, Check, Copy, ShieldCheck, DollarSign, CloudUpload, Landmark, Calendar, Hash, ArrowLeft, ArrowUpDown, AlertCircle, Plus, Trash2 } from "lucide-react";
import { ProviderRuleManager } from '@/components/ProviderRuleManager';
import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Switch";
import { CreateInvoiceModal } from "@/components/modals/CreateInvoiceModal";
import { useSidebar } from "@/context/SidebarContext";
import { Menu, Download } from "lucide-react";
import * as XLSX from "xlsx";
import { AgGridReact } from 'ag-grid-react';
import { ModuleRegistry, AllCommunityModule, themeQuartz } from 'ag-grid-community';
import { SearchableSelect } from "@/components/ui/SearchableSelect";

// Configure AG Grid v35+ Modules
ModuleRegistry.registerModules([AllCommunityModule]);

const AG_GRID_LOCALE_ES = {
    // Text Filter
    filterOoo: 'Buscar...',
    empty: 'Elige uno',
    equals: 'Igual a',
    notEqual: 'Diferente a',
    lessThan: 'Menor que',
    greaterThan: 'Mayor que',
    lessThanOrEqual: 'Menor o igual a',
    greaterThanOrEqual: 'Mayor o igual a',
    inRange: 'Rango',
    contains: 'Buscar...',
    notContains: 'No contiene',
    startsWith: 'Inicia con',
    endsWith: 'Termina con',
    blank: 'En blanco',
    notBlank: 'No en blanco',

    // Filter Conditions
    andCondition: 'Y',
    orCondition: 'O',

    // Filter Buttons
    applyFilter: 'Aplicar',
    resetFilter: 'Reiniciar',
    clearFilter: 'Limpiar',
    cancelFilter: 'Cancelar',

    // Core
    noRowsToShow: 'No hay registros para mostrar',
    loadingOoo: 'Cargando...',
};


interface ManualAttachment {
    name: string;
    url: string;
    path?: string;
    type?: string;
    size?: number;
    uploadedAt?: string;
}

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
    Observaciones?: string;
    OData__RegistrationDate?: string;
    Created?: string;
    Documento_x0020_PDF?: string;
    FechaAprobacion?: string;
    adjuntos_url?: ManualAttachment[] | string | null;
    tiene_anticipo?: string | boolean | null;
    [key: string]: any;
}

function ModalInfoItem({ icon, label, value, subValue }: { icon: React.ReactNode, label: string, value?: string, subValue?: string }) {
    return (
        <div className="flex items-start gap-4">
            <div className="h-10 w-10 rounded-xl bg-gray-50 flex items-center justify-center text-[#254153] flex-shrink-0">
                {React.cloneElement(icon as React.ReactElement<any>, { className: "h-5 w-5" })}
            </div>
            <div className="min-w-0">
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-0.5">{label}</p>
                <p className="text-sm font-bold text-[#254153] truncate">{value || 'N/A'}</p>
                {subValue && <p className="text-[10px] text-gray-400 mt-0.5 font-medium">{subValue}</p>}
            </div>
        </div>
    );
}

export default function InvoicesPage() {
    const gridRef = useRef<AgGridReact>(null);
    const { toggleSidebar } = useSidebar();
    const [colWidths, setColWidths] = useState<Record<string, number>>({ 'C. Costos / Cuenta': 100 });

    const handleResize = (e: React.MouseEvent, col: string) => {
        e.preventDefault();
        const startX = e.pageX;
        const thElement = (e.target as HTMLElement).closest('th');
        const startWidth = colWidths[col] || thElement?.offsetWidth || 150;
        
        const onMouseMove = (moveEvent: MouseEvent) => {
            const newWidth = Math.max(50, startWidth + (moveEvent.pageX - startX));
            setColWidths(prev => ({ ...prev, [col]: newWidth }));
        };
        
        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };
        
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    };

    const [pendingInvoices, setPendingInvoices] = useState<SharePointInvoice[]>([]);
    const [processedInvoices, setProcessedInvoices] = useState<SharePointInvoice[]>([]);
    const [pendingCount, setPendingCount] = useState(0);
    const [processedCount, setProcessedCount] = useState(0);
    const [toProcessCount, setToProcessCount] = useState(0);
    const [hasMoreProcessed, setHasMoreProcessed] = useState(true);
    const [loadingMoreProcessed, setLoadingMoreProcessed] = useState(false);

    const invoices = useMemo(() => {
        const combined = [...pendingInvoices];
        processedInvoices.forEach(item => {
            if (!combined.some(c => c.id === item.id)) combined.push(item);
        });
        return combined.sort((a, b) => Number(b.id || 0) - Number(a.id || 0));
    }, [pendingInvoices, processedInvoices]);

    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [activeTab, setActiveTab] = useState<'pending' | 'to_process' | 'processed'>('pending');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc' | null>(null);
    const [loadLimit, setLoadLimit] = useState<number | 'all'>(100);
    const [displayedRowCount, setDisplayedRowCount] = useState<number>(0);
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
    const [showOnlyActive, setShowOnlyActive] = useState(false);
    const [syncingId, setSyncingId] = useState<string | null>(null);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [sapStatus, setSapStatus] = useState<'loading' | 'found' | 'not_found' | 'error' | null>(null);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [manualAttachmentFiles, setManualAttachmentFiles] = useState<File[]>([]);
    const [uploadingManualAttachments, setUploadingManualAttachments] = useState(false);
    const [expandedPdfUrl, setExpandedPdfUrl] = useState<string | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [previewError, setPreviewError] = useState<string | null>(null);
    
    // Catalogos para reglas de aprobación
    const [centrosCostosList, setCentrosCostosList] = useState<any[]>([]);
    const [cuentasList, setCuentasList] = useState<any[]>([]);

    const [columnFilters, setColumnFilters] = useState({
        invoice: "",
        provider: "",
        amount: "",
        responsible: "",
        status: "",
        contabilidad: "",
        nit: "",
        consecutivo: "",
        observaciones: ""
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

    const [dataSource, setDataSource] = useState<'cache' | 'sharepoint' | 'loading'>('loading');

    const normalizeManualAttachments = (value: any): ManualAttachment[] => {
        if (!value) return [];
        if (Array.isArray(value)) return value;
        if (typeof value === "string") {
            try {
                const parsed = JSON.parse(value);
                return Array.isArray(parsed) ? parsed : [];
            } catch {
                return [];
            }
        }
        return [];
    };

    const normalizeInvoices = (items: any[]) => items.map((item: any) => {
        let documentInfo = null;
        if (item.documentos || item.fp) {
            documentInfo = {
                fileName: "Factura.pdf",
                serverRelativeUrl: item.documentos || item.fp
            };
        }
        return {
            ...item,
            id: item.id || item.ID || String(Math.random()),
            Monto: item.Valor_total ?? item["Valor total"] ?? item.Valortotal ?? item.Monto ?? 0,
            Nit: item.Nit || item.Title || "N/A",
            Proveedor: item.Proveedor || "N/A",
            Responsable_de_Autorizar: item.Responsable_de_Autorizar || "Sin asignar",
            FechaAprobacion: item.FechaAprobacion || null,
            adjuntos_url: normalizeManualAttachments(item.adjuntos_url),
            documentInfo,
            Attachments: item.Attachments || !!item.documentos || !!item.fp
        };
    });

    useEffect(() => {
        if (selectedInvoice) {
            handlePreview(selectedInvoice);
        } else {
            setPreviewUrl(null);
            setPreviewError(null);
        }
    }, [selectedInvoice]);

    const handlePreview = async (invoice: any) => {
        try {
            setPreviewError(null);
            setPreviewLoading(true);

            const directUrl = invoice?.documentos || invoice?.fp;
            if (directUrl && (directUrl.startsWith('http://') || directUrl.startsWith('https://')) && !directUrl.includes('sharepoint.com')) {
                setPreviewUrl(directUrl);
                return;
            }

            const fileName = invoice?.documentInfo?.fileName || 'Factura';
            const apiUrl = `/api/externo/factura/${invoice.id}/download?file=${encodeURIComponent(fileName)}`;
            const res = await fetch(apiUrl);
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "No se ha encontrado factura en PDF");
            }
            setPreviewUrl(apiUrl);
        } catch (err: any) {
            console.error('Preview error:', err);
            setPreviewError(err.message || "No se pudo cargar la vista previa");
        } finally {
            setPreviewLoading(false);
        }
    };

    const handleUploadManualAttachments = async () => {
        if (!selectedInvoice || manualAttachmentFiles.length === 0) return;

        setUploadingManualAttachments(true);
        try {
            const formData = new FormData();
            formData.append("invoiceNumber", selectedInvoice.Nro_Factura || String(selectedInvoice.id));
            manualAttachmentFiles.forEach((file) => formData.append("files", file));

            const res = await fetch(`/api/facturas/${selectedInvoice.id}/adjuntos`, {
                method: "POST",
                body: formData,
            });
            const data = await res.json();

            if (!res.ok) throw new Error(data.error || "Error al cargar adjuntos");

            const attachments = normalizeManualAttachments(data.attachments);
            setPendingInvoices(prev => prev.map(inv =>
                inv.id === selectedInvoice.id ? { ...inv, adjuntos_url: attachments } : inv
            ));
            setProcessedInvoices(prev => prev.map(inv =>
                inv.id === selectedInvoice.id ? { ...inv, adjuntos_url: attachments } : inv
            ));
            setSelectedInvoice({ ...selectedInvoice, adjuntos_url: attachments });
            setManualAttachmentFiles([]);
            alert("Adjuntos cargados correctamente");
        } catch (error: any) {
            console.error("Error uploading manual attachments:", error);
            alert(error.message || "Error al cargar adjuntos");
        } finally {
            setUploadingManualAttachments(false);
        }
    };

    const handleDeleteManualAttachment = async (attachment: ManualAttachment) => {
        if (!selectedInvoice) return;
        const confirmed = window.confirm(`¿Quitar el adjunto "${attachment.name}" de esta factura?`);
        if (!confirmed) return;

        try {
            const res = await fetch(`/api/facturas/${selectedInvoice.id}/adjuntos`, {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    path: attachment.path,
                    url: attachment.url,
                }),
            });
            const data = await res.json();

            if (!res.ok) throw new Error(data.error || "Error al quitar adjunto");

            const attachments = normalizeManualAttachments(data.attachments);
            setPendingInvoices(prev => prev.map(inv =>
                inv.id === selectedInvoice.id ? { ...inv, adjuntos_url: attachments } : inv
            ));
            setProcessedInvoices(prev => prev.map(inv =>
                inv.id === selectedInvoice.id ? { ...inv, adjuntos_url: attachments } : inv
            ));
            setSelectedInvoice({ ...selectedInvoice, adjuntos_url: attachments });
        } catch (error: any) {
            console.error("Error deleting manual attachment:", error);
            alert(error.message || "Error al quitar adjunto");
        }
    };

    const fetchInvoices = async (refresh: boolean = false) => {
        try {
            setLoading(true);
            setDataSource('loading');
            
            const params = new URLSearchParams();
            if (refresh) params.append('refresh', 'true');
            params.append('pending', 'true'); 
            
            const response = await fetch(`/api/sharepoint/all?${params.toString()}`);
            const data = await response.json();

            if (data.success) {
                setPendingInvoices(normalizeInvoices(data.items));
                if (data.pendingCount !== undefined) setPendingCount(data.pendingCount);
                if (data.processedCount !== undefined) setProcessedCount(data.processedCount);
                if (data.toProcessCount !== undefined) setToProcessCount(data.toProcessCount);
                setDataSource(data.source);
            }
        } catch (error) {
            console.error("Error fetching invoices:", error);
        } finally {
            setLoading(false);
        }
    };

    const fetchHistory = async (reset: boolean = false, overrideLimit?: number | 'all') => {
        if (!reset && processedInvoices.length > 0) return; // Already loaded history
        
        try {
            setLoading(true);
            const activeLimit = overrideLimit !== undefined ? overrideLimit : loadLimit;
            const actualLimit = activeLimit === 'all' ? 100000 : activeLimit;
            const response = await fetch(`/api/sharepoint/all?history=true&offset=0&limit=${actualLimit}`); 
            const data = await response.json();

            if (data.success) {
                const normalized = normalizeInvoices(data.items);
                setProcessedInvoices(normalized);
                if (data.pendingCount !== undefined) setPendingCount(data.pendingCount);
                if (data.processedCount !== undefined) setProcessedCount(data.processedCount);
                if (data.toProcessCount !== undefined) setToProcessCount(data.toProcessCount);
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
                    userName: pendingResponsibleUser.name,
                    assignedByName: selectedInvoice.Responsable_de_Autorizar,
                    invoiceNumber: selectedInvoice.Nro_Factura,
                    providerName: selectedInvoice.Proveedor
                })
            });

            if (res.ok) {
                // Update local state
                setPendingInvoices(prev => prev.map(inv =>
                    inv.id === selectedInvoice.id
                        ? { ...inv, Responsable_de_Autorizar: pendingResponsibleUser.name }
                        : inv
                ));
                setProcessedInvoices(prev => prev.map(inv =>
                    inv.id === selectedInvoice.id
                        ? { ...inv, Responsable_de_Autorizar: pendingResponsibleUser.name }
                        : inv
                ));
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



    const fetchProviders = async (search?: string, onlyActive?: boolean) => {
        setLoadingProviders(true);
        try {
            let query = supabase
                .from('proveedores')
                .select('id, razon_social, numero_identificacion, aprobacion_automatica, proveedor_aprobacion_reglas(id, valor, porcentaje_desviacion, centro_costos, cuenta)')
                .order('razon_social', { ascending: true });

            if (search) {
                query = query.or(`razon_social.ilike.%${search}%,numero_identificacion.ilike.%${search}%`);
            }
            if (onlyActive) {
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
                fetchProviders(providersSearch, showOnlyActive);
            } else if (providersSearch.length === 0) {
                fetchProviders("", showOnlyActive);
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

    const checkOverlap = (rules: any[], newValue: number, newDev: number) => {
        const newMin = newValue - (newValue * newDev / 100);
        const newMax = newValue + (newValue * newDev / 100);
        
        for (const rule of rules) {
            const rMin = rule.valor - (rule.valor * rule.porcentaje_desviacion / 100);
            const rMax = rule.valor + (rule.valor * rule.porcentaje_desviacion / 100);
            
            // Check for overlap: max(min1, min2) <= min(max1, max2)
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

    const handleCopyLink = (inv: SharePointInvoice) => {
        const url = `${window.location.origin}/externo/factura/${inv.id}`;
        navigator.clipboard.writeText(url).then(() => {
            alert("Enlace copiado al portapapeles");
        }).catch(err => {
            console.error("Error al copiar:", err);
            alert("No se pudo copiar el enlace");
        });
    };

    const handleAction = async (action: string, field: string = 'Aprobacion_Doliente') => {
        if (!selectedInvoice) return;
        setActionLoading(action);
        try {
            const res = await fetch("/api/sharepoint/update-status", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    itemId: selectedInvoice.id,
                    status: action,
                    field
                })
            });

            if (res.ok) {
                const nowIso = new Date().toISOString();
                
                const updateInvoiceState = (inv: any) => {
                    if (inv.id !== selectedInvoice.id) return inv;
                    const updated = { ...inv };
                    if (field === 'Gestion_Contabilidad') {
                        updated.Gestion_Contabilidad = action;
                    } else {
                        updated.Aprobacion_Doliente = action;
                        updated.FechaAprobacion = nowIso;
                        if (action === 'Aprobado') {
                            updated.Gestion_Contabilidad = 'Por Procesar';
                        }
                    }
                    return updated;
                };

                setPendingInvoices(prev => prev.map(updateInvoiceState));
                setProcessedInvoices(prev => prev.map(updateInvoiceState));
                setSelectedInvoice(prev => prev ? updateInvoiceState(prev) : null);
                alert(`Factura ${action.toLowerCase()} correctamente`);
            } else {
                const data = await res.json();
                alert(`Error: ${data.error}`);
            }
        } catch (error) {
            console.error("Error updating status:", error);
            alert("Error de conexión");
        } finally {
            setActionLoading(null);
        }
    };

    const handleManualSapSync = async (inv: SharePointInvoice) => {
        if (!confirm(`Â¿Estás seguro de crear un documento preliminar en SAP para la factura ${inv.Nro_Factura}?`)) return;
        
        setSyncingId(inv.id);
        try {
            const res = await fetch("/api/sap/manual-draft", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ invoiceId: inv.id })
            });

            const data = await res.json();
            if (data.success) {
                alert(`âœ… Preliminar SAP creado exitosamente\nDocEntry: ${data.sap.draftId}`);
            } else {
                alert(`âŒ Error al crear preliminar SAP: ${data.error}`);
            }
        } catch (error) {
            console.error("Error manual SAP sync:", error);
            alert("âŒ Error de conexión al sincronizar con SAP. Revisa la consola.");
        } finally {
            setSyncingId(null);
        }
    };

    const formatCostCenter = (costCenterStr: any, tableCostStr: any) => {
        if (!costCenterStr && !tableCostStr) return "Sin asignar";
        
        if (costCenterStr) {
            try {
                const parsed = typeof costCenterStr === 'string' ? JSON.parse(costCenterStr) : costCenterStr;
                if (Array.isArray(parsed) && parsed.length > 0) {
                    return (
                        <div className="flex flex-col gap-1.5 py-1">
                            {parsed.map((p, i) => (
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
                return "Ver tabla adjunta";
            }
            return <div className="whitespace-normal break-words leading-tight">{String(tableCostStr)}</div>;
        }
        
        return "Sin asignar";
    };

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
                                    <div className="text-sm font-black text-[#254153] cursor-text select-text">{p.cuenta || 'N/A'}</div>
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

    const formatAnticipo = (val: any) => {
        if (val === true || val === 'true') return "Con anticipo";
        if (val === false || val === 'false') return "Sin anticipo";
        if (typeof val === 'string') {
            const lower = val.toLowerCase();
            if (lower.includes('compra')) return "Compra con Tarjeta";
            if (lower.includes('con anticipo')) return "Con anticipo";
            if (lower.includes('sin anticipo')) return "Sin anticipo";
            return val.charAt(0).toUpperCase() + val.slice(1).toLowerCase();
        }
        return "N/A";
    };

    const renderAnticipoBadge = (val: any) => {
        const str = formatAnticipo(val);
        if (str === "N/A" || str === "Sin anticipo") {
            return <span className="text-xs font-bold text-gray-500">{str}</span>;
        }
        
        let bgColor = "bg-amber-100 text-amber-700 border-amber-200";
        if (str === "Compra con Tarjeta") {
            bgColor = "bg-purple-100 text-purple-700 border-purple-200";
        }
        
        return (
            <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider border ${bgColor}`}>
                {str}
            </span>
        );
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

    const isToProcess = (inv: SharePointInvoice) => {
        const state = (inv.Aprobacion_Doliente || "").toLowerCase();
        const contabilidad = (inv.Gestion_Contabilidad || "").toLowerCase();
        return state.includes("aprobado") && contabilidad.includes("por procesar") && String(inv.Procesado) !== 'true';
    };

    const isProcessed = (inv: SharePointInvoice) => {
        const state = (inv.Aprobacion_Doliente || "").toLowerCase();
        const contabilidad = (inv.Gestion_Contabilidad || "").toLowerCase();
        return state.includes("aprobado") || state.includes("rechazado") || contabilidad.includes("procesado") || String(inv.Procesado) === 'true';
    };

    const filteredInvoices = invoices.filter(inv => {
        const matchesSearch = !searchTerm ||
            inv.Nro_Factura?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            inv.Proveedor?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            inv.Nit?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            inv.Consecutivo?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            inv.Observaciones?.toLowerCase().includes(searchTerm.toLowerCase());

        const matchesTab = activeTab === 'pending' ? isPending(inv) : activeTab === 'to_process' ? isToProcess(inv) : isProcessed(inv);
        const matchesResponsable = selectedResponsable === "all" || inv.Responsable_de_Autorizar === selectedResponsable;

        // Filtros por columna (Excel-style)
        const matchesColInvoice = !columnFilters.invoice || inv.Nro_Factura?.toLowerCase().includes(columnFilters.invoice.toLowerCase());
        const matchesColProvider = !columnFilters.provider || 
            inv.Proveedor?.toLowerCase().includes(columnFilters.provider.toLowerCase());
        const matchesColAmount = !columnFilters.amount || String(inv.Monto).includes(columnFilters.amount);
        const matchesColResponsible = !columnFilters.responsible || inv.Responsable_de_Autorizar?.toLowerCase().includes(columnFilters.responsible.toLowerCase());
        const matchesColStatus = !columnFilters.status || (inv.Aprobacion_Doliente || "Pendiente").toLowerCase().includes(columnFilters.status.toLowerCase());
        const matchesColContabilidad = !columnFilters.contabilidad || (inv.Gestion_Contabilidad || "Pendiente").toLowerCase().includes(columnFilters.contabilidad.toLowerCase());
        const matchesColNit = !columnFilters.nit || (inv.Nit || "").toLowerCase().includes(columnFilters.nit.toLowerCase());
        const matchesColConsecutivo = !columnFilters.consecutivo || (inv.Consecutivo || "").toLowerCase().includes(columnFilters.consecutivo.toLowerCase());
        const matchesColObservaciones = !columnFilters.observaciones || (inv.Observaciones || "").toLowerCase().includes(columnFilters.observaciones.toLowerCase());

        return matchesSearch && matchesTab && matchesResponsable && 
                matchesColInvoice && matchesColProvider && matchesColAmount && 
               matchesColResponsible && matchesColStatus && matchesColContabilidad &&
               matchesColNit && matchesColConsecutivo && matchesColObservaciones;
    });

    const sortedInvoices = useMemo(() => {
        if (!sortOrder) return filteredInvoices;
        return [...filteredInvoices].sort((a, b) => {
            const dateA = a.FechaAprobacion ? new Date(a.FechaAprobacion).getTime() : 0;
            const dateB = b.FechaAprobacion ? new Date(b.FechaAprobacion).getTime() : 0;
            return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
        });
    }, [filteredInvoices, sortOrder]);

    const colDefs = useMemo(() => [
        {
            headerName: 'Acciones',
            field: 'id',
            width: 160,
            pinned: 'left',
            filter: false,
            sortable: false,
            cellRenderer: (params: any) => {
                const inv = params.data;
                if (!inv) return null;
                return (
                    <div className="flex items-center justify-start gap-2 h-full">
                        <Button variant="outline" onClick={() => handleCopyLink(inv)} className="h-8 w-8 p-0 text-gray-400 border-gray-100 hover:bg-gray-50 bg-white rounded-lg transition-all shadow-sm flex items-center justify-center" title="Copiar Link Público">
                            <Copy className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="outline" onClick={() => handleManualSapSync(inv)} disabled={syncingId === inv.id} className="h-8 w-8 p-0 text-gray-400 border-gray-100 hover:bg-emerald-50 hover:text-emerald-600 bg-white rounded-lg transition-all shadow-sm flex items-center justify-center disabled:opacity-50" title="Sincronizar con SAP Manualmente">
                            {syncingId === inv.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CloudUpload className="h-3.5 w-3.5" />}
                        </Button>
                        <Button variant="outline" onClick={() => { setSelectedInvoice(inv); setIsModalOpen(true); }} className="h-8 w-8 p-0 text-gray-400 border-gray-100 hover:bg-gray-50 bg-white rounded-lg transition-all shadow-sm flex items-center justify-center" title="Ver Detalle">
                            <Search className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                );
            }
        },
        { headerName: 'NIT', field: 'Nit', width: 130, cellRenderer: (p: any) => <div className="text-xs font-bold text-gray-600 h-full flex items-center">{p.value || "N/A"}</div> },
        { headerName: 'Proveedor', field: 'Proveedor', width: 250, cellRenderer: (p: any) => <div className="text-sm font-bold text-gray-800 h-full flex items-center">{p.value || "N/A"}</div> },
        { headerName: 'Factura', field: 'Nro_Factura', width: 160, cellRenderer: (p: any) => <div className="flex flex-col justify-center h-full"><div className="font-bold text-[#254153] leading-none">{p.value || "S/N"}</div><div className="text-[10px] text-gray-400 mt-1 font-medium tracking-tight">REF: {p.data?.id}</div></div> },
        { headerName: 'Valor total', field: 'Monto', width: 140, cellRenderer: (p: any) => <div className="text-sm font-extrabold text-[#254153] h-full flex items-center">{formatCurrency(p.value)}</div> },
        { headerName: 'Responsable', field: 'Responsable_de_Autorizar', width: 200, cellRenderer: (p: any) => <div className="flex flex-col justify-center h-full"><div className="text-xs font-semibold text-gray-600">{p.value || "Sin asignar"}</div><div className="text-[10px] text-gray-400 font-medium">{p.data?.Created ? new Date(p.data.Created).toLocaleDateString() : ""}</div></div> },
        { headerName: 'Estado', field: 'Aprobacion_Doliente', width: 140, cellRenderer: (p: any) => <div className="h-full flex items-center"><span className={`inline-flex items-center px-3 py-1 rounded-full text-[10px] font-bold border ${getStatusStyles(p.value)}`}>{p.value || "Pendiente"}</span></div> },
        { headerName: 'G. Contabilidad', field: 'Gestion_Contabilidad', width: 160, cellRenderer: (p: any) => <div className="text-[10px] font-bold text-gray-600 uppercase tracking-tight h-full flex items-center">{p.value || "Por Procesar"}</div> },
        { headerName: 'Consecutivo', field: 'Consecutivo', width: 130, cellRenderer: (p: any) => <div className="text-xs font-bold text-gray-600 h-full flex items-center">{p.value || ""}</div> },
        { headerName: 'Fecha Creación', field: 'Creado', width: 160, cellRenderer: (p: any) => <div className="text-[10px] font-bold text-gray-500 uppercase tracking-tight h-full flex items-center">{(p.value || p.data?.Created) ? new Date(p.value || p.data?.Created).toLocaleString() : "Sin fecha"}</div> },
        { headerName: 'C. Costos / Cuenta', field: 'centro_costos', width: 250, cellRenderer: (p: any) => <div className="text-[10px] font-bold text-gray-500 w-full h-full flex items-center">{formatCostCenter(p.value, p.data?.tablaCostos)}</div> },
        { headerName: 'Fecha Aprobación', field: 'FechaAprobacion', width: 160, cellRenderer: (p: any) => <div className="text-[10px] font-bold text-gray-500 uppercase tracking-tight h-full flex items-center">{p.value ? new Date(p.value).toLocaleString() : "Sin fecha"}</div> },
        { headerName: 'Observaciones', field: 'Observaciones', width: 300, cellRenderer: (p: any) => <div className="w-full text-xs font-medium text-gray-500 h-full flex items-center truncate" title={p.value}>{p.value || "Sin observaciones"}</div> },
        { headerName: 'Datos adjuntos', field: 'adjuntos_url', width: 150, filter: false, sortable: false, cellRenderer: (p: any) => <div className="h-full flex items-center">{(p.data?.documentInfo || p.data?.Attachments) ? <a href={`/api/externo/factura/${p.data?.id}/download?file=${encodeURIComponent(p.data?.documentInfo?.fileName || 'Factura.pdf')}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-all border border-blue-100/50" title="Ver Documento Adjunto"><FileText className="h-3.5 w-3.5" /><span className="text-[10px] font-black uppercase tracking-tight">Ver Adjunto</span></a> : <span className="text-[10px] text-gray-300 font-medium italic">Sin adjuntos</span>}</div> },
        { headerName: 'Anticipo / Tarjeta', field: 'tiene_anticipo', width: 150, cellRenderer: (p: any) => <div className="h-full flex items-center">{renderAnticipoBadge(p.value)}</div> }
    ], [syncingId]);

    const handleExportExcel = () => {
        if (!gridRef.current || !gridRef.current.api) {
            alert("El grid no está listo para exportar.");
            return;
        }

        const dataToExport: any[] = [];
        gridRef.current.api.forEachNodeAfterFilterAndSort((node) => {
            if (node.data) {
                const inv = node.data;
                dataToExport.push({
                    "NIT": inv.Nit || "N/A",
                    "Proveedor": inv.Proveedor || "N/A",
                    "Factura": inv.Nro_Factura || "S/N",
                    "Valor Total": typeof inv.Monto === 'number' ? inv.Monto : parseFloat(String(inv.Monto).replace(/[^\d.,-]/g, "").replace(",", ".")) || 0,
                    "Anticipo / Tarjeta": formatAnticipo(inv.tiene_anticipo),
                    "Responsable": inv.Responsable_de_Autorizar || "Sin asignar",
                    "Estado": inv.Aprobacion_Doliente || "Pendiente",
                    "Gestión Contabilidad": inv.Gestion_Contabilidad || "Pendiente",
                    "Consecutivo": inv.Consecutivo || "N/A",
                    "Fecha Creación": (inv.Creado || inv.Created) ? new Date(inv.Creado || inv.Created).toLocaleString() : "Sin fecha",
                    "Observaciones": inv.Observaciones || "Sin observaciones",
                });
            }
        });

        if (dataToExport.length === 0) {
            alert("No hay datos para exportar con los filtros actuales.");
            return;
        }

        const ws = XLSX.utils.json_to_sheet(dataToExport);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Facturas");
        XLSX.writeFile(wb, `Facturas_Exportadas_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    return (
        <div className="h-screen bg-[#f8fafc] flex overflow-hidden">
            <Sidebar />

            <main 
                className="flex-1 relative bg-[#f8fafc] transition-all duration-300 ease-in-out flex flex-col h-screen overflow-y-auto overflow-x-hidden"
                style={{ marginLeft: 'var(--sidebar-width, 256px)' }}
            >
                {/* Header Superior */}
                <header className="h-20 bg-white/80 backdrop-blur-xl border-b border-gray-100 flex items-center justify-between px-8 sticky top-0 z-10 w-full">
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

                <div className="px-4 md:px-8 pt-6 pb-2 w-full mx-auto flex-1 flex flex-col min-h-min space-y-4">
                    {/* Título y Resumen */}
                    <div className="flex justify-between items-end">
                        <motion.div
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                        >
                            <h2 className="text-3xl font-extrabold text-[#254153]">Gestión de Facturas</h2>
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
                            <Button
                                onClick={() => {
                                    const url = `${window.location.origin}/externo/crear-factura`;
                                    navigator.clipboard.writeText(url).then(() => {
                                        alert("Enlace público copiado al portapapeles");
                                    }).catch(err => {
                                        console.error("Error al copiar:", err);
                                        alert("No se pudo copiar el enlace");
                                    });
                                }}
                                className="bg-emerald-600 text-white rounded-xl h-11 px-4 font-black hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-900/10 flex items-center gap-2"
                                title="Copiar link público para crear facturas"
                            >
                                <Copy className="h-4 w-4" />
                                <span className="hidden lg:inline">Link Público</span>
                            </Button>
                            <Button
                                onClick={() => setIsCreateModalOpen(true)}
                                className="bg-[#254153] text-white rounded-xl h-11 px-6 font-black hover:bg-[#1a2f3d] transition-all shadow-lg shadow-blue-900/10 flex items-center gap-2"
                            >
                                <CloudUpload className="h-4 w-4" />
                                Crear Factura
                            </Button>
                            <Button
                                onClick={handleExportExcel}
                                className="bg-[#254153]/10 text-[#254153] rounded-xl h-11 px-4 font-black hover:bg-[#254153]/20 transition-all flex items-center gap-2"
                                title="Descargar lista actual en Excel"
                            >
                                <Download className="h-4 w-4" />
                                <span className="hidden lg:inline">Descargar Excel</span>
                            </Button>
                        </div>
                    </div>

                    {/* Indicadores / Estadísticas */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {[
                            {
                                label: "Total Facturas",
                                value: pendingCount + processedCount,
                                icon: Paperclip,
                                color: "bg-blue-500",
                                bg: "bg-blue-50"
                            },
                            {
                                label: "Pendientes por Aprobar",
                                value: pendingCount,
                                icon: RefreshCw,
                                color: "bg-amber-500",
                                bg: "bg-amber-50"
                            },
                            {
                                label: "Histórico Procesadas",
                                value: processedCount,
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
                            {pendingCount > 0 && (
                                <span className={`px-2 py-0.5 rounded-md text-[10px] ${activeTab === 'pending' ? "bg-white/20" : "bg-gray-200"}`}>
                                    {pendingCount}
                                </span>
                            )}
                        </button>
                        <button
                            onClick={() => setActiveTab('to_process')}
                            className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 flex items-center gap-2 ${activeTab === 'to_process'
                                ? "bg-[#254153] text-white shadow-lg shadow-blue-900/10"
                                : "text-gray-500 hover:text-gray-700 hover:bg-white/50"}`}
                        >
                            <Loader2 className={`h-4 w-4 ${activeTab === 'to_process' ? 'animate-spin-slow' : ''}`} />
                            Por Procesar
                            {toProcessCount > 0 && (
                                <span className={`px-2 py-0.5 rounded-md text-[10px] ${activeTab === 'to_process' ? "bg-white/20" : "bg-gray-200"}`}>
                                    {toProcessCount}
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
                            {processedCount > 0 && (
                                <span className={`px-2 py-0.5 rounded-md text-[10px] ${activeTab === 'processed' ? "bg-white/20" : "bg-gray-200"}`}>
                                    {processedCount}
                                </span>
                            )}
                        </button>
                    </div>

                    {/* Tabla de Facturas AG Grid */}
                    <div className="bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 overflow-hidden flex-1 flex flex-col min-h-[500px]">
                        <div className="w-full flex-1 min-h-0">
                            <AgGridReact
                                ref={gridRef}
                                theme={themeQuartz}
                                localeText={AG_GRID_LOCALE_ES}
                                rowData={sortedInvoices}
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
                                overlayLoadingTemplate='<span class="ag-overlay-loading-center text-gray-500 font-bold">Cargando facturas...</span>'
                                overlayNoRowsTemplate='<span class="ag-overlay-loading-center text-gray-500 font-bold">No se encontraron resultados</span>'
                            />
                        </div>
                    </div>
                    {/* Paginación - Eliminada para carga completa */}
                    {!loading && filteredInvoices.length > 0 && (
                        <div className="flex items-center justify-between pt-2">
                            <div className="text-sm text-gray-400 font-medium italic">
                                Mostrando <span className="text-[#254153] font-bold">{displayedRowCount}</span> de <span className="text-gray-600 font-bold">{filteredInvoices.length}</span> registros cargados (Total servidor: {activeTab === 'pending' ? `${pendingCount} pendientes` : activeTab === 'to_process' ? `${toProcessCount} por procesar` : `${processedCount} procesados`})
                            </div>
                            
                            {(activeTab === 'processed' || activeTab === 'to_process') && (
                                <div className="flex items-center gap-2">
                                    <span className="text-sm text-gray-500 font-medium">Cargar:</span>
                                    <select
                                        value={loadLimit}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            const newLimit = val === 'all' ? 'all' : Number(val);
                                            setLoadLimit(newLimit);
                                            fetchHistory(true, newLimit);
                                        }}
                                        className="h-9 px-3 rounded-xl bg-white border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#254153]/10 focus:border-[#254153] transition-all text-gray-600 font-bold"
                                    >
                                        <option value={100}>100 registros</option>
                                        <option value={200}>200 registros</option>
                                        <option value={500}>500 registros</option>
                                        <option value={1000}>1000 registros</option>
                                        <option value="all">Todas las facturas</option>
                                    </select>
                                </div>
                            )}
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
                                                {formatCurrency(selectedInvoice.Valor_total ?? selectedInvoice["Valor total"])}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8 mb-12">
                                        <ModalInfoItem icon={<User />} label="Proveedor" value={selectedInvoice.Proveedor} />
                                        <ModalInfoItem icon={<Landmark />} label="NIT" value={selectedInvoice.Nit} />
                                        <ModalInfoItem icon={<Calendar />} label="Fecha" value={selectedInvoice.FechaAprobacion || selectedInvoice.Creado ? new Date(selectedInvoice.FechaAprobacion || selectedInvoice.Creado!).toLocaleDateString() : 'N/A'} />
                                        <ModalInfoItem icon={<Hash />} label="ID de Registro" value={String(selectedInvoice.ID ?? selectedInvoice.id ?? 'N/A')} />
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

                                <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                                    {loadingProviders ? (
                                        Array.from({ length: 8 }).map((_, i) => (
                                            <div key={i} className="h-20 bg-gray-50 rounded-2xl animate-pulse" />
                                        ))
                                    ) : (
                                        providers
                                            .filter(p => 
                                                (!showOnlyActive || p.aprobacion_automatica) &&
                                                (p.razon_social?.toLowerCase().includes(providersSearch.toLowerCase()) || 
                                                p.numero_identificacion?.includes(providersSearch))
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
                                {loadingProviders ? (
                                    Array.from({ length: 8 }).map((_, i) => (
                                        <div key={i} className="h-20 bg-gray-50 rounded-2xl animate-pulse" />
                                    ))
                                ) : (
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
                            className="bg-white rounded-[32px] shadow-2xl w-full max-w-4xl relative overflow-hidden border border-white/20 flex flex-col max-h-[95vh]"
                        >
                            <div className="p-8 overflow-y-auto custom-scrollbar">
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
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div>
                                                        <p className="text-[11px] font-bold text-gray-400 uppercase">NIT</p>
                                                        <p className="font-bold text-gray-600">{selectedInvoice.Nit || "N/A"}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-[11px] font-bold text-gray-400 uppercase">Consecutivo</p>
                                                        <p className="font-bold text-gray-600">{selectedInvoice.Consecutivo || ""}</p>
                                                    </div>
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
                                                <div>
                                                    <p className="text-[11px] font-bold text-gray-400 uppercase">Anticipo / Tarjeta</p>
                                                    <div className="mt-1">
                                                        {renderAnticipoBadge(selectedInvoice.tiene_anticipo)}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="bg-gray-50/50 p-6 rounded-[24px] border border-gray-100 space-y-4">
                                            <h4 className="text-[11px] font-black text-gray-400 uppercase tracking-[2px]">Centro de Costos y Cuenta</h4>
                                            <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                                                {renderCostCenterForModal(selectedInvoice.centro_costos, selectedInvoice.tablaCostos)}
                                            </div>
                                        </div>

                                        {/* Observaciones */}
                                        <div className="bg-gray-50/50 p-6 rounded-[24px] border border-gray-100 space-y-4">
                                            <div className="flex items-center justify-between">
                                                <h4 className="text-[11px] font-black text-gray-400 uppercase tracking-[2px]">Observaciones</h4>
                                                {selectedInvoice.Observaciones && (
                                                    <button
                                                        onClick={() => {
                                                            navigator.clipboard.writeText(selectedInvoice.Observaciones);
                                                            alert("Observaciones copiadas al portapapeles");
                                                        }}
                                                        className="h-7 px-3 flex items-center gap-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-600 transition-colors font-bold text-[10px] uppercase"
                                                        title="Copiar observaciones"
                                                    >
                                                        <Copy className="h-3 w-3" /> Copiar
                                                    </button>
                                                )}
                                            </div>
                                            <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm text-sm font-medium text-gray-600 whitespace-pre-wrap max-h-32 overflow-y-auto custom-scrollbar">
                                                {selectedInvoice.Observaciones || <span className="text-gray-400 italic font-bold">Sin observaciones</span>}
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
                                                        href={`/api/externo/factura/${selectedInvoice.id}/download?file=${encodeURIComponent(selectedInvoice.documentInfo?.fileName || 'Factura.pdf')}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="h-10 px-4 flex items-center justify-center rounded-xl bg-white border border-gray-100 text-xs font-bold text-[#254153] hover:bg-gray-50 transition-all shadow-sm"
                                                    >
                                                        Ver PDF
                                                    </a>
                                                </div>
                                            </div>
                                        )}

                                        <div className="bg-white p-6 rounded-[24px] border border-gray-100 space-y-4">
                                            <div className="flex items-center justify-between gap-3">
                                                <div>
                                                    <h4 className="text-[11px] font-black text-gray-400 uppercase tracking-[2px]">Adjuntos manuales</h4>
                                                    <p className="text-[10px] text-gray-400 font-bold mt-1">Excel, PDF, imagenes o Word</p>
                                                </div>
                                                <Paperclip className="h-5 w-5 text-[#254153]" />
                                            </div>

                                            {normalizeManualAttachments(selectedInvoice.adjuntos_url).length > 0 ? (
                                                <div className="space-y-2">
                                                    {normalizeManualAttachments(selectedInvoice.adjuntos_url).map((attachment) => (
                                                        <div
                                                            key={attachment.path || attachment.url}
                                                            className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 px-3 py-3 text-sm font-bold text-[#254153]"
                                                        >
                                                            <FileText className="h-4 w-4 text-blue-500 shrink-0" />
                                                            <span className="truncate flex-1">{attachment.name}</span>
                                                            <a
                                                                href={attachment.url}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="rounded-lg px-2 py-1 text-[10px] text-gray-400 uppercase hover:bg-white hover:text-[#254153] transition-colors"
                                                            >
                                                                Abrir
                                                            </a>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleDeleteManualAttachment(attachment)}
                                                                className="rounded-lg px-2 py-1 text-[10px] uppercase text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                                                            >
                                                                Quitar
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <p className="text-xs font-bold text-gray-300 italic">No hay adjuntos manuales cargados.</p>
                                            )}

                                            <div className="space-y-3">
                                                <input
                                                    type="file"
                                                    multiple
                                                    accept=".pdf,.xlsx,.xls,.csv,.doc,.docx,image/*"
                                                    onChange={(event) => setManualAttachmentFiles(Array.from(event.target.files || []))}
                                                    className="block w-full text-xs font-bold text-gray-500 file:mr-4 file:rounded-xl file:border-0 file:bg-[#254153]/10 file:px-4 file:py-2 file:text-xs file:font-black file:text-[#254153] hover:file:bg-[#254153]/15"
                                                />
                                                {manualAttachmentFiles.length > 0 && (
                                                    <div className="rounded-xl bg-gray-50 px-3 py-2 text-[11px] font-bold text-gray-500">
                                                        {manualAttachmentFiles.length} archivo(s) seleccionado(s)
                                                    </div>
                                                )}
                                                <Button
                                                    type="button"
                                                    onClick={handleUploadManualAttachments}
                                                    disabled={uploadingManualAttachments || manualAttachmentFiles.length === 0}
                                                    isLoading={uploadingManualAttachments}
                                                    className="w-full h-10 text-xs"
                                                >
                                                    <CloudUpload className="h-4 w-4 mr-2" />
                                                    Cargar adjuntos
                                                </Button>
                                            </div>
                                        </div>
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
                                                                <p className="text-[9px] font-bold text-blue-400 uppercase tracking-tighter">âš ï¸ Cambio pendiente por guardar</p>
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
                                                    <p className="text-[11px] font-bold text-gray-400 uppercase mb-1">Gestión Contabilidad</p>
                                                    <select
                                                        value={selectedInvoice.Gestion_Contabilidad || "Por Procesar"}
                                                        onChange={(e) => handleAction(e.target.value, 'Gestion_Contabilidad')}
                                                        disabled={!!actionLoading}
                                                        className="w-full h-10 px-3 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#254153]/20 transition-all cursor-pointer hover:border-[#254153]/30"
                                                    >
                                                        <option value="Por Procesar">Por Procesar</option>
                                                        <option value="Procesado">Procesado</option>
                                                    </select>
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
                                                onClick={() => handleManualSapSync(selectedInvoice)}
                                                disabled={syncingId === selectedInvoice.id}
                                                className="h-14 rounded-2xl px-6 border-gray-100 font-bold text-gray-500 hover:bg-emerald-50 hover:text-emerald-600 transition-all flex items-center justify-center gap-2"
                                            >
                                                {syncingId === selectedInvoice.id ? (
                                                    <Loader2 className="h-5 w-5 animate-spin" />
                                                ) : (
                                                    <CloudUpload className="h-5 w-5" />
                                                )}
                                                Cargar a SAP
                                            </Button>
                                            <Button 
                                                variant="outline" 
                                                className="h-14 rounded-2xl px-8 border-gray-100 font-bold text-gray-500 hover:bg-gray-50"
                                                onClick={() => window.print()}
                                            >
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
                                                            <AlertCircle className="h-6 w-6 text-red-500" />
                                                        </div>
                                                        <p className="text-[11px] font-black text-red-900 mb-3 px-2">{previewError}</p>
                                                        <Button 
                                                            onClick={() => handlePreview(selectedInvoice)} 
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
                                                    <div className="flex flex-col items-center justify-center text-gray-400">
                                                        <FileText className="h-8 w-8 mb-2 opacity-50" />
                                                        <p className="text-[10px] font-bold">Esperando archivo...</p>
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

            <AnimatePresence>
                {expandedPdfUrl && (
                    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setExpandedPdfUrl(null)}
                            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="bg-white rounded-3xl shadow-2xl w-full max-w-6xl h-[90vh] relative overflow-hidden flex flex-col"
                        >
                            <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                                <h3 className="text-lg font-black text-[#254153] flex items-center gap-2">
                                    <FileText className="h-5 w-5 text-blue-500" />
                                    Factura
                                </h3>
                                <button
                                    onClick={() => setExpandedPdfUrl(null)}
                                    className="h-10 w-10 rounded-xl bg-white flex items-center justify-center hover:bg-rose-50 hover:text-rose-500 transition-all text-gray-400 border border-gray-200 shadow-sm"
                                >
                                    <X className="h-5 w-5" />
                                </button>
                            </div>
                            <div className="flex-1 w-full bg-gray-100 relative">
                                <iframe 
                                    src={`${expandedPdfUrl}#view=FitH`} 
                                    className="absolute inset-0 w-full h-full border-none" 
                                />
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

