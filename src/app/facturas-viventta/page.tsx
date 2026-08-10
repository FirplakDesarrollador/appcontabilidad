"use client";

import React, { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Bell, RefreshCw, Paperclip, ChevronLeft, ChevronRight, Loader2, FileText, Edit2, User, X, Check, Copy, CloudUpload, Landmark, Calendar, Hash, ArrowLeft, ArrowUpDown, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useSidebar } from "@/context/SidebarContext";
import { useAuth } from "@/context/AuthContext";
import { Menu } from "lucide-react";
import { AgGridReact } from 'ag-grid-react';
import { ModuleRegistry, AllCommunityModule, themeQuartz } from 'ag-grid-community';

// Configure AG Grid v35+ Modules
ModuleRegistry.registerModules([AllCommunityModule]);

const AG_GRID_LOCALE_ES = {
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
    andCondition: 'Y',
    orCondition: 'O',
    applyFilter: 'Aplicar',
    resetFilter: 'Reiniciar',
    clearFilter: 'Limpiar',
    cancelFilter: 'Cancelar',
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
    ID?: number;
    Proveedor?: string;
    Nro_Factura?: string;
    Nit?: string;
    Monto?: number | string;
    Valor_total?: number | string;
    Responsable_de_Autorizar?: string;
    Aprobacion_Doliente?: string;
    Gestion_Contabilidad?: string;
    Consecutivo?: string;
    Observaciones?: string;
    OData__RegistrationDate?: string;
    Created?: string;
    Creado?: string;
    Documento_x0020_PDF?: string;
    FechaAprobacion?: string;
    adjuntos_url?: ManualAttachment[] | string | null;
    centro_costos?: string;
    tablaCostos?: any;
    Attachments?: boolean;
    documentInfo?: {
        fileName: string;
        serverRelativeUrl: string;
    } | null;
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

// Simulated mock database of users removed, now fetching from Supabase

// Initial mock invoices
const INITIAL_MOCK_INVOICES: SharePointInvoice[] = [
    {
        id: "201",
        ID: 201,
        Nit: "901234567-8",
        Proveedor: "Suministros Viventta SAS",
        Nro_Factura: "FVV-00109",
        Monto: 3450000,
        Valor_total: 3450000,
        Responsable_de_Autorizar: "Mateo Benavides",
        Aprobacion_Doliente: "Por Aprobar",
        Gestion_Contabilidad: "Pendiente",
        Consecutivo: "CON-7001",
        Observaciones: "Compra de insumos de papelería y cafetería para sede central",
        Created: "2026-06-15T09:30:00Z",
        Creado: "2026-06-15T09:30:00Z",
        centro_costos: JSON.stringify([{ centroCosto: "VIV-ADM - Viventta Administración", cuenta: "519595" }]),
        Attachments: true,
        documentInfo: { fileName: "FVV-00109.pdf", serverRelativeUrl: "#" },
        adjuntos_url: []
    },
    {
        id: "202",
        ID: 202,
        Nit: "890112233-4",
        Proveedor: "Distribuidora Viventta del Café",
        Nro_Factura: "FVV-9982",
        Monto: 820000,
        Valor_total: 820000,
        Responsable_de_Autorizar: "Andrea Gómez",
        Aprobacion_Doliente: "Por Aprobar",
        Gestion_Contabilidad: "Pendiente",
        Consecutivo: "CON-7002",
        Observaciones: "Servicio de suministro de café para cafetería corporativa",
        Created: "2026-06-16T14:15:00Z",
        Creado: "2026-06-16T14:15:00Z",
        centro_costos: JSON.stringify([{ centroCosto: "VIV-OPE - Viventta Operaciones", cuenta: "510510" }]),
        Attachments: false,
        documentInfo: null,
        adjuntos_url: []
    },
    {
        id: "203",
        ID: 203,
        Nit: "900554433-2",
        Proveedor: "Papelería y Servicios Viventta Ltda",
        Nro_Factura: "FVV-2401",
        Monto: 1250000,
        Valor_total: 1250000,
        Responsable_de_Autorizar: "Juan Esteban Pérez",
        Aprobacion_Doliente: "Aprobado",
        Gestion_Contabilidad: "Por Procesar",
        Consecutivo: "CON-7003",
        Observaciones: "Mantenimiento preventivo de impresoras multifuncionales",
        Created: "2026-06-12T10:00:00Z",
        Creado: "2026-06-12T10:00:00Z",
        FechaAprobacion: "2026-06-13T16:40:00Z",
        centro_costos: JSON.stringify([{ centroCosto: "VIV-ADM - Viventta Administración", cuenta: "515015" }]),
        Attachments: true,
        documentInfo: { fileName: "FVV-2401.pdf", serverRelativeUrl: "#" },
        adjuntos_url: []
    },
    {
        id: "204",
        ID: 204,
        Nit: "900998877-6",
        Proveedor: "Energía y Redes Viventta",
        Nro_Factura: "FVV-857",
        Monto: 15430000,
        Valor_total: 15430000,
        Responsable_de_Autorizar: "Carlos Mario Restrepo",
        Aprobacion_Doliente: "Aprobado",
        Gestion_Contabilidad: "Procesado",
        Consecutivo: "CON-6950",
        Observaciones: "Instalación de puntos de red y cableado estructurado piso 3",
        Created: "2026-06-05T08:00:00Z",
        Creado: "2026-06-05T08:00:00Z",
        FechaAprobacion: "2026-06-06T11:20:00Z",
        centro_costos: JSON.stringify([{ centroCosto: "VIV-TEC - Viventta Tecnología", cuenta: "513520" }]),
        Attachments: true,
        documentInfo: { fileName: "FVV-857.pdf", serverRelativeUrl: "#" },
        adjuntos_url: JSON.stringify([{ name: "Orden_Trabajo_Firmada.pdf", url: "#", path: "mock_path_1" }])
    },
    {
        id: "205",
        ID: 205,
        Nit: "800556677-1",
        Proveedor: "Mantenimientos Viventta E.U.",
        Nro_Factura: "FVV-014",
        Monto: 450000,
        Valor_total: 450000,
        Responsable_de_Autorizar: "Diana Carolina Montoya",
        Aprobacion_Doliente: "Rechazado",
        Gestion_Contabilidad: "Pendiente",
        Consecutivo: "CON-6990",
        Observaciones: "Reparación de filtración de aire acondicionado sala juntas",
        Created: "2026-06-10T11:00:00Z",
        Creado: "2026-06-10T11:00:00Z",
        FechaAprobacion: "2026-06-11T09:15:00Z",
        centro_costos: JSON.stringify([{ centroCosto: "VIV-ADM - Viventta Administración", cuenta: "514525" }]),
        Attachments: true,
        documentInfo: { fileName: "FVV-014.pdf", serverRelativeUrl: "#" },
        adjuntos_url: []
    }
];

export default function ViventtaInvoicesPage() {
    const { role, user } = useAuth();
    const { toggleSidebar } = useSidebar();
    
    const [invoices, setInvoices] = useState<SharePointInvoice[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [usersList, setUsersList] = useState<{id: string, name: string, email: string}[]>([]);

    const getProcesadoPorName = (email?: string) => {
        if (!email) return "Desconocido";
        const e = email.toLowerCase();
        if (e.includes("mateo.benavides")) return "Mateo Benavides Rios";
        if (e.includes("duvan.ramirez")) return "Duvan Esteban Ramirez Rua";
        if (e.includes("practicontabilidad")) return "Jesús Angel Villalobos Rincon";
        return email;
    };

    // Load invoices from Facturas_Viventta on mount
    const loadInvoicesFromDB = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/facturas-viventta/list');
            const data = await res.json();
            if (data.success && data.items) {
                // Map Supabase rows to the SharePointInvoice shape used by the UI
                const mapped: SharePointInvoice[] = data.items.map((row: any) => ({
                    id: String(row.id),
                    ID: row.id,
                    Nit: row.Nit || '',
                    Proveedor: row.Proveedor || '',
                    Nro_Factura: row.Nro_Factura || '',
                    Valor_total: row.Valor_total || '0',
                    Aprobacion_Doliente: row.Aprobacion_Doliente || 'Por Aprobar',
                    Gestion_Contabilidad: row.Gestion_Contabilidad || 'Pendiente',
                    Responsable_de_Autorizar: row.Responsable_de_Autorizar || '',
                    Observaciones: row.Observaciones || '',
                    Consecutivo: row.Consecutivo || '',
                    Created: row.created_at || row.Creado || '',
                    Creado: row.Creado || row.created_at || '',
                    FechaAprobacion: row.FechaAprobacion || null,
                    centro_costos: row.centro_costos || '[]',
                    Attachments: !!(row.fp || row.documentos),
                    documentInfo: row.fp ? { fileName: row.Nro_Factura + '.pdf', serverRelativeUrl: row.fp } : { fileName: '', serverRelativeUrl: '#' },
                    adjuntos_url: row.adjuntos_url || [],
                }));
                setInvoices(mapped);
            }
        } catch (e) {
            console.error('Error loading Facturas_Viventta:', e);
        } finally {
            setLoading(false);
        }
    };

    // Load users from Proveedores_Viventta
    const loadUsers = async () => {
        try {
            const res = await fetch('/api/proveedores-viventta/responsables');
            const data = await res.json();
            if (data.success && data.items) {
                setUsersList(data.items);
            }
        } catch (error) {
            console.error("Error loading responsables:", error);
        }
    };

    // Load initial data
    useEffect(() => {
        loadInvoicesFromDB();
        loadUsers();
    }, []);

    const [sortOrder, setSortOrder] = useState<'asc' | 'desc' | null>(null);
    const [loadLimit, setLoadLimit] = useState<number | 'all'>(100);
    const [displayedRowCount, setDisplayedRowCount] = useState<number>(0);
    const [selectedInvoice, setSelectedInvoice] = useState<SharePointInvoice | null>(null);
    const [selectedResponsable, setSelectedResponsable] = useState<string>("all");

    // Persist invoices to localStorage on every change
    useEffect(() => {
        try {
            localStorage.setItem('viventta_invoices', JSON.stringify(invoices));
        } catch { /* quota exceeded — ignore */ }
    }, [invoices]);
    

    
    // Sync simulation states
    const [syncingId, setSyncingId] = useState<string | null>(null);
    const [isSyncingSharePoint, setIsSyncingSharePoint] = useState(false);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [sapStatus, setSapStatus] = useState<'loading' | 'found' | 'not_found' | 'error' | null>(null);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    
    // Manual attachments simulation
    const [manualAttachmentFiles, setManualAttachmentFiles] = useState<File[]>([]);
    const [uploadingManualAttachments, setUploadingManualAttachments] = useState(false);
    const [expandedPdfUrl, setExpandedPdfUrl] = useState<string | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [previewError, setPreviewError] = useState<string | null>(null);
    
    // Edit responsible simulation
    const [isEditingResponsible, setIsEditingResponsible] = useState(false);
    const [userSearchQuery, setUserSearchQuery] = useState("");
    const [userSearchResults, setUserSearchResults] = useState<any[]>([]);
    const [isSearchingUsers, setIsSearchingUsers] = useState(false);
    const [isUpdatingResponsible, setIsUpdatingResponsible] = useState(false);
    const [pendingResponsibleUser, setPendingResponsibleUser] = useState<any>(null);

    // Create invoice form states (local mock modal)
    const [providerSearch, setProviderSearch] = useState("");
    const [providerResults, setProviderResults] = useState<any[]>([]);
    const [isSearchingProviders, setIsSearchingProviders] = useState(false);
    const [showProviderResults, setShowProviderResults] = useState(false);
    const providerDropdownRef = useRef<HTMLDivElement>(null);

    const searchProviders = useCallback(async (query: string) => {
        setIsSearchingProviders(true);
        try {
            const res = await fetch(`/api/providers/search?q=${encodeURIComponent(query)}&table=Proveedores_Viventta&limit=15`);
            const data = await res.json();
            setProviderResults(data.providers || []);
        } catch (e) {
            console.error("Error searching providers:", e);
        } finally {
            setIsSearchingProviders(false);
        }
    }, []);

    useEffect(() => {
        const timer = setTimeout(() => {
            if (showProviderResults) {
                searchProviders(providerSearch);
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [providerSearch, searchProviders, showProviderResults]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (providerDropdownRef.current && !providerDropdownRef.current.contains(event.target as Node)) {
                setShowProviderResults(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const [createFormData, setCreateFormData] = useState({
        nit: "",
        proveedor: "",
        nroFactura: "",
        monto: "",
        responsable: "",
        observaciones: "",
        centroCosto: "VIV-ADM - Viventta Administración",
        cuenta: "519595"
    });
    const [createAttachmentFile, setCreateAttachmentFile] = useState<File | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    // Column Filters (Excel-style)
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

    const [dataSource, setDataSource] = useState<'cache' | 'sharepoint' | 'loading'>('cache');

    // Total count
    const totalCount = invoices.length;

    const normalizeManualAttachments = (value: any): ManualAttachment[] => {
        if (!value) return [];
        if (Array.isArray(value)) return value;
        if (typeof value === "string") {
            try {
                const parsed = JSON.parse(value);
                return Array.isArray(parsed) ? parsed : [];
            } catch {
                if (value.startsWith("http")) {
                    return [{ name: "Documento Adjunto", url: value }];
                }
                return [];
            }
        }
        return [];
    };

    useEffect(() => {
        if (selectedInvoice) {
            handlePreview(selectedInvoice);
        } else {
            setPreviewUrl(null);
            setPreviewError(null);
        }
    }, [selectedInvoice]);

    const MOCK_PDF_URL = "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf";
    const GOOGLE_DOCS_VIEWER = (url: string) =>
        `https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`;

    const handlePreview = async (invoice: any) => {
        setPreviewError(null);
        setPreviewLoading(true);
        setTimeout(() => {
            setPreviewLoading(false);
            if (invoice.Attachments && invoice.documentInfo?.serverRelativeUrl &&
                invoice.documentInfo.serverRelativeUrl !== '#') {
                // Use stored base64 PDF directly
                setPreviewUrl(invoice.documentInfo.serverRelativeUrl);
            } else if (invoice.Attachments) {
                // Fallback: Google Docs viewer with dummy PDF
                setPreviewUrl(GOOGLE_DOCS_VIEWER(MOCK_PDF_URL));
            } else {
                setPreviewError("No se ha encontrado factura en PDF adjunta.");
            }
        }, 600);
    };

    const handleUploadManualAttachments = async () => {
        if (!selectedInvoice || manualAttachmentFiles.length === 0) return;

        setUploadingManualAttachments(true);
        setTimeout(() => {
            const currentAttachments = normalizeManualAttachments(selectedInvoice.adjuntos_url);
            const newAttachments: ManualAttachment[] = manualAttachmentFiles.map(file => ({
                name: file.name,
                url: "#",
                path: "mock_path_" + Date.now()
            }));
            const updatedAttachments = [...currentAttachments, ...newAttachments];

            setInvoices(prev => prev.map(inv =>
                inv.id === selectedInvoice.id ? { ...inv, adjuntos_url: updatedAttachments } : inv
            ));
            
            setSelectedInvoice({ ...selectedInvoice, adjuntos_url: updatedAttachments });
            setManualAttachmentFiles([]);
            setUploadingManualAttachments(false);
            alert("✅ Adjuntos simulados cargados correctamente.");
        }, 1000);
    };

    const handleDeleteManualAttachment = async (attachment: ManualAttachment) => {
        if (!selectedInvoice) return;
        const confirmed = window.confirm(`¿Quitar el adjunto "${attachment.name}" de esta factura?`);
        if (!confirmed) return;

        const currentAttachments = normalizeManualAttachments(selectedInvoice.adjuntos_url);
        const updatedAttachments = currentAttachments.filter(a => a.name !== attachment.name);

        setInvoices(prev => prev.map(inv =>
            inv.id === selectedInvoice.id ? { ...inv, adjuntos_url: updatedAttachments } : inv
        ));
        setSelectedInvoice({ ...selectedInvoice, adjuntos_url: updatedAttachments });
    };

    const handleRefreshInvoices = async () => {
        setIsSyncingSharePoint(true);
        setDataSource('loading');
        await loadInvoicesFromDB();
        setIsSyncingSharePoint(false);
        setDataSource('cache');
    };

    useEffect(() => {
        setPendingResponsibleUser(null);
        setIsEditingResponsible(false);
    }, [selectedInvoice]);

    // Simulated user search debounce
    useEffect(() => {
        const timer = setTimeout(() => {
            if (userSearchQuery.length >= 2) {
                setIsSearchingUsers(true);
                setTimeout(() => {
                    const filtered = usersList.filter(u =>
                        u.name.toLowerCase().includes(userSearchQuery.toLowerCase()) ||
                        u.email.toLowerCase().includes(userSearchQuery.toLowerCase())
                    );
                    setUserSearchResults(filtered);
                    setIsSearchingUsers(false);
                }, 300);
            } else {
                setUserSearchResults([]);
            }
        }, 400);

        return () => clearTimeout(timer);
    }, [userSearchQuery]);

    const handleUpdateResponsible = async () => {
        if (!selectedInvoice || !pendingResponsibleUser) return;

        setIsUpdatingResponsible(true);
        try {
            const res = await fetch(`/api/facturas-viventta/update`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: selectedInvoice.id, Responsable_de_Autorizar: pendingResponsibleUser.name }),
            });

            if (!res.ok) throw new Error('Failed to update responsible');

            setInvoices(prev => prev.map(inv =>
                inv.id === selectedInvoice.id
                    ? { ...inv, Responsable_de_Autorizar: pendingResponsibleUser.name }
                    : inv
            ));
            setSelectedInvoice({ ...selectedInvoice as any, Responsable_de_Autorizar: pendingResponsibleUser.name });
            setIsEditingResponsible(false);
            setPendingResponsibleUser(null);
            setUserSearchQuery("");
            alert("✅ Responsable actualizado correctamente.");
        } catch (error) {
            console.error(error);
            alert("Error al actualizar responsable");
        } finally {
            setIsUpdatingResponsible(false);
        }
    };

    const handleApprovalChange = async (newStatus: 'Aprobado' | 'Rechazado') => {
        if (!selectedInvoice) return;
        const confirmed = window.confirm(`¿Confirmar cambio de estado a "${newStatus}"?`);
        if (!confirmed) return;

        const updatedFields: Partial<SharePointInvoice> = {
            Aprobacion_Doliente: newStatus,
            FechaAprobacion: new Date().toISOString(),
            ...(newStatus === 'Aprobado' ? { Gestion_Contabilidad: 'Por Procesar' } : { Gestion_Contabilidad: 'Pendiente' })
        };

        try {
            const res = await fetch(`/api/facturas-viventta/update`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: selectedInvoice.id, ...updatedFields }),
            });

            if (!res.ok) throw new Error('Failed to update status');

            setInvoices(prev => prev.map(inv =>
                inv.id === selectedInvoice.id ? { ...inv, ...updatedFields } : inv
            ));
            setSelectedInvoice(prev => prev ? { ...prev, ...updatedFields } : prev);
        } catch (error) {
            console.error(error);
            alert('Error al actualizar la factura');
        }
    };



    const handleCopyLink = (inv: SharePointInvoice) => {
        const url = `${window.location.origin}/externo/factura-viventta/${inv.id}`;
        navigator.clipboard.writeText(url).then(() => {
            alert("✅ Enlace copiado al portapapeles");
        }).catch(err => {
            alert("No se pudo copiar el enlace");
        });
    };

    const handleAction = async (action: string, procesadoPor?: string) => {
        if (!selectedInvoice) return;
        if (action === 'Procesado' && !procesadoPor) {
            alert("Debes seleccionar quién procesa antes de cambiar el estado a Procesado.");
            return;
        }
        setActionLoading(action);
        
        try {
            const updateData: any = {};
            if (action === 'Aprobado') {
                updateData.Aprobacion_Doliente = 'Aprobado';
                updateData.Gestion_Contabilidad = 'Por Procesar';
                updateData.FechaAprobacion = new Date().toISOString();
            } else if (action === 'Rechazado') {
                updateData.Aprobacion_Doliente = 'Rechazado';
                updateData.Gestion_Contabilidad = 'Pendiente';
                updateData.FechaAprobacion = new Date().toISOString();
            } else {
                updateData.Gestion_Contabilidad = action;
                if (action === 'Procesado') {
                    updateData.FechaProcesado = new Date().toISOString();
                    if (procesadoPor) {
                        updateData.ProcesadoPor = procesadoPor;
                        updateData.DigitadoPor = procesadoPor;
                    }
                }
            }

            const res = await fetch(`/api/facturas-viventta/update`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: selectedInvoice.id, ...updateData }),
            });

            if (!res.ok) throw new Error('Failed to update status');

            setInvoices(prev => prev.map(inv => inv.id === selectedInvoice.id ? { ...inv, ...updateData } : inv));
            setSelectedInvoice(prev => prev ? { ...prev, ...updateData } : prev);
            alert(`Factura gestionada como ${action} correctamente.`);
        } catch (error) {
            console.error('Error:', error);
            alert('Error al actualizar estado.');
        } finally {
            setActionLoading(null);
        }
    };

    const handleManualSapSync = async (inv: SharePointInvoice) => {
        if (!confirm(`¿Estás seguro de crear un documento preliminar en SAP Viventta para la factura ${inv.Nro_Factura}?`)) return;
        
        setSyncingId(inv.id);
        setTimeout(() => {
            setSyncingId(null);
            alert(`✅ Preliminar SAP Viventta creado exitosamente (Simulado)\nDocEntry: ${Math.floor(100000 + Math.random() * 900000)}`);
        }, 1200);
    };

    const handleCreateMockInvoice = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!createFormData.nit || !createFormData.proveedor || !createFormData.nroFactura || !createFormData.monto) {
            alert("Por favor completa los campos requeridos.");
            return;
        }

        if (!createAttachmentFile) {
            alert("Por favor adjunta la factura en PDF.");
            return;
        }

        setIsSubmitting(true);

        try {
            const formData = new FormData();
            formData.append('nroFactura', createFormData.nroFactura);
            formData.append('nit', createFormData.nit);
            formData.append('proveedor', createFormData.proveedor);
            formData.append('monto', createFormData.monto);
            formData.append('centroCosto', createFormData.centroCosto);
            formData.append('cuenta', createFormData.cuenta);
            formData.append('observaciones', createFormData.observaciones);
            formData.append('responsable', createFormData.responsable);
            
            const user = usersList.find(u => u.name === createFormData.responsable);
            if (user) {
                formData.append('responsableEmail', user.email);
            }
            
            formData.append('file', createAttachmentFile);

            const res = await fetch('/api/facturas-viventta/create', {
                method: 'POST',
                body: formData,
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.message || errData.error || 'Error al crear factura');
            }

            const data = await res.json();

            alert("✅ Factura Viventta creada y guardada en Supabase correctamente.");
            
            setIsCreateModalOpen(false);
            setProviderSearch("");
            setCreateAttachmentFile(null);
            setCreateFormData({
                nit: "",
                proveedor: "",
                nroFactura: "",
                monto: "",
                responsable: "",
                observaciones: "",
                centroCosto: "VIV-ADM - Viventta Administración",
                cuenta: "519595"
            });

            // Recargar lista completa desde Facturas_Viventta
            await loadInvoicesFromDB();

        } catch (error: any) {
            console.error('Error:', error);
            alert(`Error al crear la factura: ${error.message}`);
        } finally {
            setIsSubmitting(false);
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
        return "Sin asignar";
    };

    const renderCostCenterForModal = (costCenterStr: any, tableCostStr: any) => {
        if (!costCenterStr && !tableCostStr) return <span className="text-gray-400 italic">Sin asignar</span>;
        
        let costCenterContent = null;
        if (costCenterStr) {
            try {
                const parsed = typeof costCenterStr === 'string' ? JSON.parse(costCenterStr) : costCenterStr;
                if (Array.isArray(parsed) && parsed.length > 0) {
                    costCenterContent = (
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
                costCenterContent = <div className="text-sm font-bold text-[#254153] whitespace-pre-wrap cursor-text select-text">{String(costCenterStr)}</div>;
            }
        }
        
        let tableCostContent = null;
        if (tableCostStr) {
            let parsedTable = tableCostStr;
            if (typeof tableCostStr === 'string') {
                try {
                    parsedTable = JSON.parse(tableCostStr);
                } catch(e) {}
            }
            if (typeof parsedTable === 'object' && parsedTable && parsedTable.Url) {
                tableCostContent = <a href={parsedTable.Url} target="_blank" rel="noopener noreferrer" className="inline-flex mt-3 bg-blue-50 text-blue-600 px-4 py-2 rounded-xl hover:bg-blue-100 transition-colors text-sm font-bold items-center gap-2"><FileText className="h-4 w-4" /> Ver tabla adjunta</a>;
            } else {
                tableCostContent = <div className="text-sm font-bold text-[#254153] whitespace-pre-wrap cursor-text select-text mt-2">{String(tableCostStr)}</div>;
            }
        }
        
        return (
            <div className="flex flex-col">
                {costCenterContent}
                {tableCostContent}
            </div>
        );
    };

    const formatCurrency = (value: any) => {
        if (value === undefined || value === null || value === "") return "$ 0,00";
        let numericValue = typeof value === "number" ? value : parseFloat(value.toString().replace(/[^\d.,-]/g, "").replace(",", "."));
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



    const filteredInvoices = useMemo(() => {
        return invoices.filter(inv => {
            const matchesSearch = !searchTerm ||
                inv.Nro_Factura?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                inv.Proveedor?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                inv.Nit?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                inv.Consecutivo?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                inv.Observaciones?.toLowerCase().includes(searchTerm.toLowerCase());


            const matchesResponsable = selectedResponsable === "all" || inv.Responsable_de_Autorizar === selectedResponsable;

            const matchesColInvoice = !columnFilters.invoice || inv.Nro_Factura?.toLowerCase().includes(columnFilters.invoice.toLowerCase());
            const matchesColProvider = !columnFilters.provider || inv.Proveedor?.toLowerCase().includes(columnFilters.provider.toLowerCase());
            const matchesColAmount = !columnFilters.amount || String(inv.Monto).includes(columnFilters.amount);
            const matchesColResponsible = !columnFilters.responsible || inv.Responsable_de_Autorizar?.toLowerCase().includes(columnFilters.responsible.toLowerCase());
            const matchesColStatus = !columnFilters.status || (inv.Aprobacion_Doliente || "Pendiente").toLowerCase().includes(columnFilters.status.toLowerCase());
            const matchesColContabilidad = !columnFilters.contabilidad || (inv.Gestion_Contabilidad || "Pendiente").toLowerCase().includes(columnFilters.contabilidad.toLowerCase());
            const matchesColNit = !columnFilters.nit || (inv.Nit || "").toLowerCase().includes(columnFilters.nit.toLowerCase());
            const matchesColConsecutivo = !columnFilters.consecutivo || (inv.Consecutivo || "").toLowerCase().includes(columnFilters.consecutivo.toLowerCase());
            const matchesColObservaciones = !columnFilters.observaciones || (inv.Observaciones || "").toLowerCase().includes(columnFilters.observaciones.toLowerCase());

            return matchesSearch && matchesResponsable && 
                matchesColInvoice && matchesColProvider && matchesColAmount && 
                matchesColResponsible && matchesColStatus && matchesColContabilidad &&
                matchesColNit && matchesColConsecutivo && matchesColObservaciones;
        });
    }, [invoices, searchTerm, selectedResponsable, columnFilters]);

    const sortedInvoices = useMemo(() => {
        if (!sortOrder) return filteredInvoices;
        return [...filteredInvoices].sort((a, b) => {
            const dateA = a.FechaAprobacion || a.Created ? new Date(a.FechaAprobacion || a.Created!).getTime() : 0;
            const dateB = b.FechaAprobacion || b.Created ? new Date(b.FechaAprobacion || b.Created!).getTime() : 0;
            return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
        });
    }, [filteredInvoices, sortOrder]);

    const colDefs: any[] = useMemo(() => [
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
                        {role !== 'viewer' && (
                        <Button variant="outline" onClick={() => handleManualSapSync(inv)} disabled={syncingId === inv.id} className="h-8 w-8 p-0 text-gray-400 border-gray-100 hover:bg-emerald-50 hover:text-emerald-600 bg-white rounded-lg transition-all shadow-sm flex items-center justify-center disabled:opacity-50" title="Sincronizar con SAP Manualmente">
                            {syncingId === inv.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CloudUpload className="h-3.5 w-3.5" />}
                        </Button>
                        )}
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
        { headerName: 'G. Contabilidad', field: 'Gestion_Contabilidad', width: 160, cellRenderer: (p: any) => <div className="text-[10px] font-bold text-gray-600 uppercase tracking-tight h-full flex items-center">{p.value || "Pendiente"}</div> },
        { headerName: 'Consecutivo', field: 'Consecutivo', width: 130, cellRenderer: (p: any) => <div className="text-xs font-bold text-gray-600 h-full flex items-center">{p.value || "N/A"}</div> },
        { headerName: 'Fecha Creación', field: 'Creado', width: 160, cellRenderer: (p: any) => <div className="text-[10px] font-bold text-gray-500 uppercase tracking-tight h-full flex items-center">{(p.value || p.data?.Created) ? new Date(p.value || p.data?.Created).toLocaleString() : "Sin fecha"}</div> },
        { headerName: 'C. Costos / Cuenta', field: 'centro_costos', width: 250, cellRenderer: (p: any) => <div className="text-[10px] font-bold text-gray-500 w-full h-full flex items-center">{formatCostCenter(p.value, p.data?.tablaCostos)}</div> },
        { headerName: 'Fecha Aprobación', field: 'FechaAprobacion', width: 160, cellRenderer: (p: any) => <div className="text-[10px] font-bold text-gray-500 uppercase tracking-tight h-full flex items-center">{p.value ? new Date(p.value).toLocaleString() : "Sin fecha"}</div> },
        { headerName: 'Observaciones', field: 'Observaciones', width: 300, cellRenderer: (p: any) => <div className="w-full text-xs font-medium text-gray-500 h-full flex items-center truncate" title={p.value}>{p.value || "Sin observaciones"}</div> },
        { headerName: 'Datos adjuntos', field: 'adjuntos_url', width: 150, filter: false, sortable: false, cellRenderer: (p: any) => <div className="h-full flex items-center">{(p.data?.documentInfo || p.data?.Attachments) ? <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-all border border-blue-100/50 cursor-pointer" onClick={() => { setSelectedInvoice(p.data); setIsModalOpen(true); }}><FileText className="h-3.5 w-3.5" /><span className="text-[10px] font-black uppercase tracking-tight">Ver Adjunto</span></span> : <span className="text-[10px] text-gray-300 font-medium italic">Sin adjuntos</span>}</div> }
    ], [syncingId]);

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
                            <h1 className="text-xl font-bold text-gray-800 tracking-tight">Facturas Viventta</h1>
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
                            <h2 className="text-3xl font-extrabold text-[#254153]">Gestión de Facturas Viventta</h2>
                            <p className="text-gray-500 mt-1 font-medium flex items-center gap-2">
                                <span className={`h-2 w-2 rounded-full animate-pulse ${dataSource === 'cache' ? 'bg-emerald-500' : dataSource === 'sharepoint' ? 'bg-blue-500' : 'bg-gray-400'}`} />
                                Modo Visual - Base de datos Viventta
                            </p>
                        </motion.div>

                        <div className="flex gap-2">
                            {role !== 'viewer' && (
                            <Button
                                onClick={() => setIsCreateModalOpen(true)}
                                className="bg-[#254153] text-white rounded-xl h-11 px-6 font-black hover:bg-[#1a2f3d] transition-all shadow-lg shadow-blue-900/10 flex items-center gap-2"
                            >
                                <CloudUpload className="h-4 w-4" />
                                Crear Factura
                            </Button>
                            )}
                        </div>
                    </div>

                    {/* Indicador / Estadística */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-white p-6 rounded-3xl border border-gray-100 shadow-[0_8px_30px_rgb(0,0,0,0.02)] flex items-center gap-5 group hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-all cursor-default w-fit"
                    >
                        <div className="bg-blue-50 p-4 rounded-2xl group-hover:scale-110 transition-transform duration-300">
                            <div className="h-6 w-6 bg-blue-500 rounded-lg flex items-center justify-center">
                                <Paperclip className="h-4 w-4 text-white" />
                            </div>
                        </div>
                        <div>
                            <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">Histórico Facturas Viventta</p>
                            <p className="text-3xl font-black text-[#254153] mt-1">{loading ? "..." : totalCount}</p>
                        </div>
                    </motion.div>

                    {/* Tabla de Facturas AG Grid */}
                    <div className="bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 overflow-hidden flex-1 flex flex-col min-h-[500px]">
                        <div className="w-full flex-1 min-h-0">
                            <AgGridReact
                                theme={themeQuartz}
                                localeText={AG_GRID_LOCALE_ES}
                                rowData={sortedInvoices}
                                columnDefs={colDefs}
                                onModelUpdated={(e: any) => setDisplayedRowCount(e.api.getDisplayedRowCount())}
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

                    {/* Footer / Info Row */}
                    {!loading && filteredInvoices.length > 0 && (
                        <div className="flex items-center justify-between pt-2">
                            <div className="text-sm text-gray-400 font-medium italic">
                                Mostrando <span className="text-[#254153] font-bold">{displayedRowCount}</span> de <span className="text-gray-600 font-bold">{filteredInvoices.length}</span> registros cargados
                            </div>
                            
                            <div className="flex items-center gap-2">
                                <span className="text-sm text-gray-500 font-medium">Cargar:</span>
                                <select
                                    value={loadLimit}
                                    onChange={(e) => setLoadLimit(Number(e.target.value))}
                                    className="h-9 px-3 rounded-xl bg-white border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#254153]/10 focus:border-[#254153] transition-all text-gray-600 font-bold"
                                >
                                    <option value={100}>100 registros</option>
                                    <option value={200}>200 registros</option>
                                    <option value={500}>500 registros</option>
                                </select>
                            </div>
                        </div>
                    )}
                </div>

                {/* Modal de Detalle de Factura */}
                <AnimatePresence>
                    {isModalOpen && selectedInvoice && (
                        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                onClick={() => { setSelectedInvoice(null); setIsModalOpen(false); }}
                                className="absolute inset-0 bg-[#254153]/40 backdrop-blur-md"
                            />
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                                className="bg-white rounded-[32px] shadow-2xl w-full max-w-4xl relative overflow-hidden border border-white/20 flex flex-col max-h-[95vh] z-10"
                            >
                                <div className="p-8 overflow-y-auto custom-scrollbar">
                                    <div className="flex justify-between items-start mb-8">
                                        <div className="flex items-center gap-4">
                                            <div className="h-14 w-14 bg-blue-50 rounded-2xl flex items-center justify-center shadow-inner">
                                                <Paperclip className="h-7 w-7 text-blue-500" />
                                            </div>
                                            <div>
                                                <h3 className="text-2xl font-black text-[#254153]">Detalle de Factura Viventta</h3>
                                                <p className="text-gray-400 font-bold tabular-nums">#{selectedInvoice.Nro_Factura || selectedInvoice.id}</p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => { setSelectedInvoice(null); setIsModalOpen(false); }}
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

                                            <div className="bg-gray-50/50 p-6 rounded-[24px] border border-gray-100 space-y-4">
                                                <h4 className="text-[11px] font-black text-gray-400 uppercase tracking-[2px]">Centro de Costos y Cuenta</h4>
                                                <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                                                    {renderCostCenterForModal(selectedInvoice.centro_costos, selectedInvoice.tablaCostos)}
                                                </div>
                                            </div>

                                            {/* Documento Adjunto */}
                                            {selectedInvoice.Attachments && (
                                                <div className="bg-[#254153]/5 p-6 rounded-[24px] border border-[#254153]/10 space-y-4">
                                                    <div className="flex items-center justify-between">
                                                        <h4 className="text-[11px] font-black text-gray-400 uppercase tracking-[2px]">Documento Adjunto</h4>
                                                        <span className="px-2 py-0.5 rounded bg-blue-100 text-[10px] font-bold text-blue-600 uppercase">PDF</span>
                                                    </div>
                                                    <div className="flex items-center gap-4">
                                                        <div className="h-12 w-12 bg-white rounded-xl flex items-center justify-center shadow-sm border border-gray-100">
                                                            <FileText className="h-6 w-6 text-blue-500" />
                                                        </div>
                                                        <div className="flex-1 overflow-hidden">
                                                            <p className="text-sm font-bold text-[#254153] truncate">{selectedInvoice.Nro_Factura}.pdf</p>
                                                            <p className="text-[10px] text-gray-400 font-medium italic">Archivo de SharePoint Viventta</p>
                                                        </div>
                                                        <button
                                                            onClick={() => window.open(MOCK_PDF_URL, '_blank', 'noopener,noreferrer')}
                                                            className="h-10 px-4 flex items-center justify-center rounded-xl bg-white border border-gray-100 text-xs font-bold text-[#254153] hover:bg-gray-50 transition-all shadow-sm"
                                                        >
                                                            Ver PDF
                                                        </button>
                                                    </div>
                                                </div>
                                            )}

                                            <div className="bg-white p-6 rounded-[24px] border border-gray-100 space-y-4">
                                                <div className="flex items-center justify-between gap-3">
                                                    <div>
                                                        <h4 className="text-[11px] font-black text-gray-400 uppercase tracking-[2px]">Adjuntos manuales</h4>
                                                        <p className="text-[10px] text-gray-400 font-bold mt-1">Excel, PDF, imágenes o Word</p>
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
                                                                {role !== 'viewer' && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleDeleteManualAttachment(attachment)}
                                                                    className="rounded-lg px-2 py-1 text-[10px] uppercase text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                                                                >
                                                                    Quitar
                                                                </button>
                                                                )}
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
                                                        onChange={(event) => setManualAttachmentFiles(Array.from(event.target.files || []))}
                                                        disabled={role === 'viewer'}
                                                        className="block w-full text-xs font-bold text-gray-500 file:mr-4 file:rounded-xl file:border-0 file:bg-[#254153]/10 file:px-4 file:py-2 file:text-xs file:font-black file:text-[#254153] hover:file:bg-[#254153]/15 disabled:opacity-50"
                                                    />
                                                    {manualAttachmentFiles.length > 0 && (
                                                        <div className="rounded-xl bg-gray-50 px-3 py-2 text-[11px] font-bold text-gray-500">
                                                            {manualAttachmentFiles.length} archivo(s) seleccionado(s)
                                                        </div>
                                                    )}
                                                    {role !== 'viewer' && (
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
                                                    )}
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
                                                        <div className="flex items-center gap-3 flex-wrap">
                                                            <span className={`inline-flex items-center px-4 py-1.5 rounded-full text-xs font-black border ${getStatusStyles(selectedInvoice.Aprobacion_Doliente)}`}>
                                                                {selectedInvoice.Aprobacion_Doliente || "Pendiente"}
                                                            </span>
                                                            {role !== 'viewer' && (selectedInvoice.Aprobacion_Doliente === 'Por Aprobar' || !selectedInvoice.Aprobacion_Doliente) && (
                                                                <div className="flex gap-2">
                                                                    <button
                                                                        onClick={() => handleApprovalChange('Aprobado')}
                                                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black bg-emerald-500 text-white hover:bg-emerald-600 transition-all shadow-sm shadow-emerald-200"
                                                                    >
                                                                        <Check className="h-3 w-3" />
                                                                        Aprobar
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleApprovalChange('Rechazado')}
                                                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black bg-rose-500 text-white hover:bg-rose-600 transition-all shadow-sm shadow-rose-200"
                                                                    >
                                                                        <X className="h-3 w-3" />
                                                                        Rechazar
                                                                    </button>
                                                                </div>
                                                            )}
                                                            {role !== 'viewer' && (selectedInvoice.Aprobacion_Doliente === 'Aprobado' || selectedInvoice.Aprobacion_Doliente === 'Rechazado') && (
                                                                <button
                                                                    onClick={() => handleApprovalChange(selectedInvoice.Aprobacion_Doliente === 'Aprobado' ? 'Rechazado' : 'Aprobado')}
                                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black bg-gray-100 text-gray-500 hover:bg-gray-200 transition-all border border-gray-200"
                                                                >
                                                                    Cambiar
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <p className="text-[11px] font-bold text-gray-400 uppercase mb-1">Responsable de Autorizar</p>
                                                        {!isEditingResponsible ? (
                                                            <div className="flex flex-col gap-1">
                                                                <div className={`flex items-center gap-2 ${role !== 'viewer' ? 'group cursor-pointer' : ''}`} onClick={() => { if (role !== 'viewer') setIsEditingResponsible(true); }}>
                                                                    <p className={`font-extrabold ${pendingResponsibleUser ? 'text-blue-600 italic' : 'text-[#254153]'} hover:text-blue-600 transition-colors`}>
                                                                        {pendingResponsibleUser ? pendingResponsibleUser.name : (selectedInvoice.Responsable_de_Autorizar || "No asignado")}
                                                                    </p>
                                                                    {role !== 'viewer' && <Edit2 className="h-3 w-3 text-gray-300 group-hover:text-blue-500 transition-colors" />}
                                                                </div>
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
                                                            onChange={(e) => {
                                                                const val = e.target.value;
                                                                if (val === 'Procesado') {
                                                                    handleAction(val, getProcesadoPorName(user?.email));
                                                                } else {
                                                                    handleAction(val);
                                                                }
                                                            }}
                                                            disabled={role === 'viewer'}
                                                            className="w-full h-10 px-3 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#254153]/20 transition-all cursor-pointer hover:border-[#254153]/30 disabled:opacity-50"
                                                        >
                                                            <option value="Por Procesar">Por Procesar</option>
                                                            <option value="Procesado">Procesado</option>
                                                        </select>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex gap-3 pt-2">
                                                {pendingResponsibleUser && role !== 'viewer' ? (
                                                    <Button
                                                        onClick={handleUpdateResponsible}
                                                        disabled={isUpdatingResponsible}
                                                        className="flex-1 h-14 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-black text-sm shadow-xl shadow-blue-900/10 flex items-center justify-center gap-2"
                                                    >
                                                        <Check className="h-5 w-5" />
                                                        Actualizar Responsable
                                                    </Button>
                                                ) : (
                                                    <div className="flex-1" />
                                                )}
                                                {role !== 'viewer' && (
                                                <Button
                                                    variant="outline"
                                                    onClick={() => handleManualSapSync(selectedInvoice)}
                                                    disabled={syncingId === selectedInvoice.id}
                                                    className="h-14 rounded-2xl px-6 border-gray-100 font-bold text-gray-500 hover:bg-emerald-50 hover:text-emerald-600 transition-all flex items-center justify-center gap-2"
                                                >
                                                    <CloudUpload className="h-5 w-5" />
                                                    Cargar a SAP
                                                </Button>
                                                )}
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
                                                         onClick={() => {
                                                             const actualUrl = (selectedInvoice.documentInfo?.serverRelativeUrl && selectedInvoice.documentInfo.serverRelativeUrl !== '#') 
                                                                 ? selectedInvoice.documentInfo.serverRelativeUrl 
                                                                 : MOCK_PDF_URL;
                                                             window.open(actualUrl, '_blank', 'noopener,noreferrer');
                                                         }}
                                                         className="text-[#254153] hover:bg-[#254153]/10 px-3 py-1.5 rounded-lg transition-all text-xs font-bold flex items-center gap-2 disabled:opacity-40"
                                                         disabled={!selectedInvoice.Attachments}
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
                                                        </div>
                                                    ) : previewUrl ? (
                                                        <>
                                                            <div 
                                                                className="absolute inset-0 z-10 cursor-zoom-in bg-transparent" 
                                                                onClick={() => {
                                                                    const actualUrl = (selectedInvoice.documentInfo?.serverRelativeUrl && selectedInvoice.documentInfo.serverRelativeUrl !== '#') 
                                                                        ? selectedInvoice.documentInfo.serverRelativeUrl 
                                                                        : MOCK_PDF_URL;
                                                                    window.open(actualUrl, '_blank', 'noopener,noreferrer');
                                                                }} 
                                                                title="Clic para abrir el PDF" 
                                                            />
                                                            <iframe 
                                                                src={previewUrl}
                                                                className="w-full h-full border-none pointer-events-none" 
                                                                title="Vista previa de factura"
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

                {/* PDF Viewer Ampliado */}
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
                                className="bg-white rounded-3xl shadow-2xl w-full max-w-6xl h-[90vh] relative overflow-hidden flex flex-col z-10"
                            >
                                <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                                    <h3 className="text-lg font-black text-[#254153] flex items-center gap-2">
                                        <FileText className="h-5 w-5 text-blue-500" />
                                        Visualización de Factura
                                    </h3>
                                    <button
                                        onClick={() => setExpandedPdfUrl(null)}
                                        className="h-10 w-10 rounded-xl bg-white flex items-center justify-center hover:bg-rose-50 hover:text-rose-500 transition-all text-gray-400 border border-gray-200 shadow-sm"
                                    >
                                        <X className="h-5 w-5" />
                                    </button>
                                </div>
                                <div className="flex-1 w-full bg-gray-100 relative animate-pulse flex items-center justify-center text-center">
                                    <iframe 
                                        src={`${expandedPdfUrl}#view=FitH`} 
                                        className="absolute inset-0 w-full h-full border-none" 
                                    />
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>



                {/* Modal Crear Factura (Simulado) */}
                <AnimatePresence>
                    {isCreateModalOpen && (
                        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                onClick={() => setIsCreateModalOpen(false)}
                                className="absolute inset-0 bg-[#254153]/40 backdrop-blur-md"
                            />
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                                className="bg-white rounded-[32px] shadow-2xl w-full max-w-xl relative overflow-hidden border border-white/20 flex flex-col z-10"
                            >
                                <div className="h-3 bg-linear-to-r from-[#254153] to-[#4a6b8a]" />
                                <button
                                    onClick={() => setIsCreateModalOpen(false)}
                                    className="absolute top-6 right-6 h-10 w-10 flex items-center justify-center rounded-full bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600 transition-colors"
                                >
                                    <X className="h-5 w-5" />
                                </button>

                                <form onSubmit={handleCreateMockInvoice} className="p-8 space-y-6">
                                    <div>
                                        <h3 className="text-2xl font-black text-[#254153]">Crear Factura Viventta</h3>
                                        <p className="text-xs text-gray-400 font-bold mt-1">Registrar factura localmente (Modo Visual)</p>
                                    </div>

                                    <div className="space-y-4">
                                        <div className="relative" ref={providerDropdownRef}>
                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider block mb-1">Razón Social del Proveedor *</label>
                                            <div className="relative group">
                                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 group-focus-within:text-[#254153] transition-colors" />
                                                <input
                                                    required
                                                    type="text"
                                                    value={createFormData.proveedor ? createFormData.proveedor : providerSearch}
                                                    onChange={(e) => {
                                                        setProviderSearch(e.target.value);
                                                        if (createFormData.proveedor) {
                                                            setCreateFormData({...createFormData, proveedor: "", nit: ""});
                                                        }
                                                    }}
                                                    onFocus={() => setShowProviderResults(true)}
                                                    className="w-full pl-9 pr-10 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#254153]/10 focus:bg-white transition-all font-bold text-[#254153]"
                                                    placeholder="Buscar proveedor..."
                                                />
                                                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                                                    {isSearchingProviders && <Loader2 className="h-3.5 w-3.5 animate-spin text-[#254153]" />}
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
                                                            providerResults.map((p, idx) => (
                                                                <button
                                                                    key={`${p.numero_identificacion}-${idx}`}
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setCreateFormData({...createFormData, proveedor: p.razon_social, nit: p.numero_identificacion});
                                                                        setProviderSearch(p.razon_social);
                                                                        setShowProviderResults(false);
                                                                    }}
                                                                    className="w-full px-4 py-2.5 text-left hover:bg-gray-50 border-b border-gray-50 last:border-0 transition-colors flex flex-col"
                                                                >
                                                                    <span className="text-xs font-bold text-[#254153] line-clamp-1">{p.razon_social}</span>
                                                                    <span className="text-[10px] text-gray-400">NIT: {p.numero_identificacion}</span>
                                                                </button>
                                                            ))
                                                        ) : (
                                                            <div className="px-4 py-3 text-xs text-gray-400 text-center">
                                                                {isSearchingProviders ? "Buscando..." : "No se encontraron proveedores"}
                                                            </div>
                                                        )}
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>

                                        <div>
                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider block mb-1">NIT del Proveedor *</label>
                                            <div className="relative group">
                                                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 group-focus-within:text-[#254153] transition-colors" />
                                                <input
                                                    readOnly
                                                    type="text"
                                                    value={createFormData.nit}
                                                    className="w-full pl-9 pr-3 py-2.5 bg-gray-100 border border-gray-100 rounded-xl text-sm font-bold text-gray-500 cursor-not-allowed"
                                                    placeholder="NIT automático"
                                                />
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider block mb-1">Número de Factura *</label>
                                                <input
                                                    type="text"
                                                    required
                                                    placeholder="Ej: FVV-1001"
                                                    value={createFormData.nroFactura}
                                                    onChange={(e) => setCreateFormData({ ...createFormData, nroFactura: e.target.value })}
                                                    className="w-full h-11 px-4 rounded-xl bg-gray-50 border border-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-[#254153]/10 focus:bg-white transition-all text-[#254153] font-bold"
                                                />
                                            </div>

                                            <div>
                                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider block mb-1">Valor Total (COP) *</label>
                                                <input
                                                    type="number"
                                                    required
                                                    placeholder="Ej: 1500000"
                                                    value={createFormData.monto}
                                                    onChange={(e) => setCreateFormData({ ...createFormData, monto: e.target.value })}
                                                    className="w-full h-11 px-4 rounded-xl bg-gray-50 border border-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-[#254153]/10 focus:bg-white transition-all text-[#254153] font-bold font-mono"
                                                />
                                            </div>
                                        </div>

                                        <div>
                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider block mb-1">Responsable de Autorizar</label>
                                            <select
                                                value={createFormData.responsable}
                                                onChange={(e) => setCreateFormData({ ...createFormData, responsable: e.target.value })}
                                                className="w-full h-11 px-4 rounded-xl bg-gray-50 border border-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-[#254153]/10 focus:bg-white transition-all text-[#254153] font-bold"
                                            >
                                                <option value="">Selecciona un responsable...</option>
                                                {usersList.map(u => (
                                                    <option key={u.id} value={u.name}>{u.name}</option>
                                                ))}
                                            </select>
                                        </div>

                                        <div>
                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider block mb-1">Observaciones</label>
                                            <textarea
                                                rows={2}
                                                placeholder="Ej: Adquisición de materiales..."
                                                value={createFormData.observaciones}
                                                onChange={(e) => setCreateFormData({ ...createFormData, observaciones: e.target.value })}
                                                className="w-full p-4 rounded-xl bg-gray-50 border border-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-[#254153]/10 focus:bg-white transition-all text-[#254153] font-medium"
                                            />
                                        </div>
                                        
                                        <div>
                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider block mb-1">Adjuntar Factura (PDF) *</label>
                                            <input
                                                type="file"
                                                accept=".pdf"
                                                required
                                                onChange={(e) => {
                                                    if (e.target.files && e.target.files.length > 0) {
                                                        setCreateAttachmentFile(e.target.files[0]);
                                                    } else {
                                                        setCreateAttachmentFile(null);
                                                    }
                                                }}
                                                className="w-full p-2.5 rounded-xl bg-gray-50 border border-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-[#254153]/10 focus:bg-white transition-all text-[#254153] font-medium file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-black file:bg-[#254153] file:text-white hover:file:bg-[#1a2f3d] cursor-pointer"
                                            />
                                        </div>
                                    </div>

                                    <div className="flex gap-4">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={() => setIsCreateModalOpen(false)}
                                            className="flex-1 h-12 rounded-xl text-gray-500 font-bold border-gray-100 hover:bg-gray-50"
                                            disabled={isSubmitting}
                                        >
                                            Cancelar
                                        </Button>
                                        <Button
                                            type="submit"
                                            disabled={isSubmitting}
                                            className="flex-1 h-12 rounded-xl bg-[#254153] hover:bg-[#1a2f3d] text-white font-black"
                                        >
                                            {isSubmitting ? (
                                                <span className="flex items-center justify-center gap-2">
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                    Guardando...
                                                </span>
                                            ) : (
                                                "Crear Factura"
                                            )}
                                        </Button>
                                    </div>
                                </form>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>
            </main>
        </div>
    );
}
