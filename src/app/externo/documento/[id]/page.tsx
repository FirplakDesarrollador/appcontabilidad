/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
    CheckCircle2,
    XCircle,
    FileText,
    User,
    Calendar,
    DollarSign,
    AlertCircle,
    Building2,
    Hash,
    ChevronLeft,
    ChevronRight,
    Loader2,
    Plus,
    Trash2,
    Download,
    X,
    Home
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { SearchableSelect } from "@/components/ui/SearchableSelect";

interface DocumentData {
    id: string;
    proveedor: string;
    nit: string;
    valorTotal: string;
    nroFactura: string; 
    fechaRegistro: string;
    estadoFactura: string;
    aprobacionDoliente: string;
    gestionContabilidad: string;
    responsableActual?: string;
    documentInfo?: any;
}

const parseSafeFloat = (val: any): number => {
    if (!val) return 0;
    if (typeof val === 'number') return val;
    let s = val.toString().replace(/[^\d,. -]/g, '').trim();
    if (!s) return 0;
    const hasComma = s.includes(',');
    const hasDot = s.includes('.');
    if (hasComma && hasDot) {
        if (s.indexOf('.') < s.indexOf(',')) s = s.replace(/\./g, '').replace(',', '.');
        else s = s.replace(/,/g, '');
    } else if (hasComma) s = s.replace(',', '.');
    const res = parseFloat(s);
    return isNaN(res) ? 0 : res;
};

export default function PublicDocumentApprovalPage() {
    const params = useParams();
    const itemId = params.id as string;

    const [document, setDocument] = useState<DocumentData | null>(null);
    const [initialResponsable, setInitialResponsable] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [actionLoading, setActionLoading] = useState<string | null>(null); 
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    const [observaciones, setObservaciones] = useState<string>("");
    const [distribuciones, setDistribuciones] = useState<{ centroCostos: string; cuenta: string; valor: string }[]>([]);
    const [anticipo, setAnticipo] = useState<string>("");
    const [editableTotal, setEditableTotal] = useState<string>("");

    const [centrosCostosList, setCentrosCostosList] = useState<any[]>([]);
    const [cuentasList, setCuentasList] = useState<any[]>([]);
    const [downloadLoading, setDownloadLoading] = useState(false);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [previewError, setPreviewError] = useState<string | null>(null);

    // Reasignment States
    const [isEditingResponsible, setIsEditingResponsible] = useState(false);
    const [userSearchQuery, setUserSearchQuery] = useState("");
    const [userSearchResults, setUserSearchResults] = useState<any[]>([]);
    const [isSearchingUsers, setIsSearchingUsers] = useState(false);
    const [isUpdatingResponsible, setIsUpdatingResponsible] = useState(false);
    const [pendingResponsibleUser, setPendingResponsibleUser] = useState<any>(null);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            await Promise.all([fetchDocument(), fetchCatalogos()]);
            setLoading(false);
        };
        fetchData();
    }, [itemId]);

    useEffect(() => {
        if (document && document.documentInfo && !previewUrl && !previewLoading && !previewError) {
            handlePreview();
        }
    }, [document]);

    useEffect(() => {
        const searchUsers = async () => {
            if (userSearchQuery.length < 3) {
                setUserSearchResults([]);
                return;
            }
            setIsSearchingUsers(true);
            try {
                const res = await fetch(`/api/users/search?q=${encodeURIComponent(userSearchQuery)}`);
                const data = await res.json();
                setUserSearchResults(data.users || []);
            } catch (err) {
                console.error('Error searching users:', err);
            } finally {
                setIsSearchingUsers(false);
            }
        };
        const timer = setTimeout(searchUsers, 500);
        return () => clearTimeout(timer);
    }, [userSearchQuery]);

    const fetchPdfBlob = async () => {
        const fileName = document?.documentInfo?.fileName || 'Documento';
        const res = await fetch(`/api/externo/documento/${itemId}/download?file=${encodeURIComponent(fileName)}`);
        
        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || "No se ha encontrado documento soporte en PDF");
        }
        return await res.blob();
    };

    const handleDownload = async () => {
        try {
            setDownloadLoading(true);
            if (document?.documentInfo?.pdfUrl) {
                const a = window.document.createElement('a');
                a.href = document.documentInfo.pdfUrl;
                a.download = document.documentInfo.fileName || 'Documento.pdf';
                a.target = '_blank';
                window.document.body.appendChild(a);
                a.click();
                window.document.body.removeChild(a);
                return;
            }
            const blob = await fetchPdfBlob();
            const fileName = document?.documentInfo?.fileName || 'Documento';
            const url = window.URL.createObjectURL(blob);
            const a = window.document.createElement('a');
            a.href = url;
            a.download = fileName.toLowerCase().endsWith('.pdf') ? fileName : `${fileName}.pdf`;
            window.document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            window.document.body.removeChild(a);
        } catch (err: any) {
            alert(err.message || "Error al intentar descargar el documento");
        } finally {
            setDownloadLoading(false);
        }
    };

    const handlePreview = async () => {
        try {
            setPreviewError(null);
            setPreviewLoading(true);
            if (document?.documentInfo?.pdfUrl) {
                setPreviewUrl(document.documentInfo.pdfUrl);
                return;
            }
            const blob = await fetchPdfBlob();
            const url = window.URL.createObjectURL(blob);
            setPreviewUrl(url);
        } catch (err: any) {
            setPreviewError(err.message || "No se pudo cargar la vista previa");
        } finally {
            setPreviewLoading(false);
        }
    };

    const fetchCatalogos = async () => {
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

    const fetchDocument = async () => {
        try {
            const res = await fetch(`/api/externo/documento/${itemId}`);
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            setDocument(data);
            setInitialResponsable(prev => prev === null ? (data.responsableActual || "") : prev);
            // Default distribution from SharePoint if available, otherwise default to total
            if (data.distribuciones) {
                try {
                    const parsed = typeof data.distribuciones === 'string' 
                        ? JSON.parse(data.distribuciones) 
                        : data.distribuciones;
                    
                    const normalized = parsed.map((d: any) => ({
                        centroCostos: d.centroCosto || d.centroCostos || "",
                        cuenta: d.cuenta || "",
                        valor: d.valor || "0"
                    }));
                    setDistribuciones(normalized);
                } catch (e) {
                    console.error("Error parsing distributions:", e);
                    if (data.valorTotal) {
                        setDistribuciones([{ centroCostos: "", cuenta: "", valor: data.valorTotal }]);
                    }
                }
            } else if (data.valorTotal) {
                setDistribuciones([{ centroCostos: "", cuenta: "", valor: data.valorTotal }]);
            }

            if (data.valorTotal) {
                setEditableTotal(data.valorTotal);
            }
        } catch (err: any) {
            setError(err.message || "No se pudo cargar la información del documento soporte");
        }
    };

    const handleAction = async (action: 'Aprobado' | 'Rechazado') => {
        try {
            if (action === 'Rechazado') {
                if (!observaciones || observaciones.trim() === "") {
                    alert("Por favor, ingresa una observación para poder rechazar el documento.");
                    return;
                }
            }

            if (action === 'Aprobado') {
                if (!anticipo) {
                    alert("Por favor, responde las preguntas de validación antes de aprobar.");
                    return;
                }
                const docTotal = parseSafeFloat(editableTotal);
                const distributionsTotal = distribuciones.reduce((sum, dist) => sum + parseSafeFloat(dist.valor), 0);
                if (distributionsTotal > docTotal + 0.01) {
                    alert(`El total distribuido (${distributionsTotal}) no puede ser mayor al valor total (${docTotal}).`);
                    return;
                }
                if (distribuciones.some(d => !d.centroCostos || !d.cuenta || !d.valor)) {
                    alert("Por favor, completa todos los campos de distribución antes de aprobar.");
                    return;
                }
            }

            setActionLoading(action);
            const res = await fetch('/api/externo/accion', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    itemId,
                    action,
                    observaciones,
                    distribuciones,
                    anticipo,
                    valor: editableTotal,
                    nit: document?.nit,
                    nroFactura: document?.nroFactura,
                    listName: 'Documento_Soporte'
                })
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);

            if (res.ok) {
                const actionText = action === 'Aprobado' ? 'aprobado' : 'rechazado';
                
                if (action === 'Aprobado' && data.sap) {
                    if (data.sap.success) {
                        setSuccessMessage(`Documento ${actionText} exitosamente y borrador creado en SAP (#${data.sap.draftId})`);
                    } else {
                        setSuccessMessage(`Documento ${actionText} en SharePoint, pero hubo un error en SAP: ${data.sap.error}`);
                    }
                } else {
                    setSuccessMessage(`El documento ha sido ${actionText} exitosamente.`);
                }
            }
            fetchDocument();
        } catch (err: any) {
            alert(err.message || "Error al procesar la acción");
        } finally {
            setActionLoading(null);
        }
    };

    const handleUpdateResponsible = async () => {
        if (!pendingResponsibleUser) return;
        try {
            setIsUpdatingResponsible(true);
            const res = await fetch('/api/sharepoint/update-responsible', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    itemId,
                    userEmail: pendingResponsibleUser.email,
                    userName: pendingResponsibleUser.name,
                    assignedByName: document?.responsableActual,
                    invoiceNumber: document?.nroFactura,
                    providerName: document?.proveedor,
                    listName: 'Documento_Soporte'
                })
            });
            if (!res.ok) throw new Error('Error al actualizar responsable');
            setSuccessMessage(`Documento reasignado exitosamente a ${pendingResponsibleUser.name}`);
            setIsEditingResponsible(false);
            setPendingResponsibleUser(null);
            fetchDocument();
        } catch (err: any) {
            alert(err.message || 'Error al reasignar responsable');
        } finally {
            setIsUpdatingResponsible(false);
        }
    };

    if (loading) return (
        <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-6">
            <Loader2 className="h-10 w-10 text-[#254153] animate-spin mb-4" />
        </div>
    );

    if (error) return (
        <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-6 text-center">
            <div className="max-w-md bg-white p-8 rounded-3xl shadow-xl border border-red-100">
                <AlertCircle className="h-8 w-8 text-red-500 mx-auto mb-4" />
                <h1 className="text-2xl font-bold mb-2">Error de Acceso</h1>
                <p className="text-gray-500 mb-8">{error}</p>
                <Button onClick={() => window.location.reload()}>Reintentar</Button>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-[#f8fafc] p-4 md:p-8">
            <AnimatePresence mode="wait">
                {successMessage ? (
                    <div className="flex items-center justify-center min-h-[80vh]">
                        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="max-w-md w-full bg-white p-10 rounded-[32px] shadow-2xl text-center">
                            <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-8" />
                            <h2 className="text-3xl font-bold mb-4">¡Listo!</h2>
                            <p className="text-gray-600 mb-10 text-lg">{successMessage}</p>
                            <Button 
                                onClick={() => window.location.href = `/externo/pendientes?responsable=${encodeURIComponent(initialResponsable || document?.responsableActual || "")}`} 
                                className="w-full bg-[#254153] text-white"
                            >
                                Ver mis pendientes
                            </Button>
                        </motion.div>
                    </div>
                ) : (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="max-w-[1600px] mx-auto w-full"
                    >
                        {/* Header */}
                        <div className="flex flex-col md:flex-row md:items-center gap-4 mb-8 px-2">
                            <div className="flex items-center gap-3">
                                <div className="bg-[#254153] p-2.5 rounded-2xl">
                                    <FileText className="h-6 w-6 text-white" />
                                </div>
                                <div>
                                    <h1 className="text-2xl font-bold text-[#254153]">Revisión de Documento Soporte</h1>
                                    <p className="text-gray-500 text-sm">Portal externo de aprobación</p>
                                </div>
                            </div>
                            <div className="md:ml-auto flex items-center gap-3">
                                <Button
                                    onClick={() => window.location.href = `/externo/pendientes?responsable=${encodeURIComponent(initialResponsable || document?.responsableActual || "")}`}
                                    className="flex items-center justify-center gap-2 px-6 py-3 bg-white border-2 border-[#254153]/10 rounded-2xl text-[#254153] text-sm font-bold hover:bg-gray-50 transition-all shadow-sm group"
                                >
                                    <Home className="h-4 w-4" />
                                    Inicio
                                </Button>
                                <Button
                                    onClick={handleDownload}
                                    disabled={downloadLoading}
                                    className="flex items-center justify-center gap-2 px-6 py-3 bg-[#254153]/5 border-2 border-[#254153]/10 rounded-2xl text-[#254153] text-sm font-bold hover:bg-[#254153] hover:text-white transition-all shadow-sm group"
                                >
                                    {downloadLoading ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <Download className="h-4 w-4" />
                                    )}
                                    {downloadLoading ? "Buscando..." : `Descargar Documento ${document?.nroFactura ? `#${document.nroFactura}` : ""}`}
                                </Button>
                            </div>
                        </div>

                        {/* Layout Grid */}
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                            
                            {/* Left Column: Data and Forms */}
                            <div className="lg:col-span-5 space-y-8">
                                {/* Main Info Card */}
                                <div className="bg-white rounded-[32px] shadow-xl border border-gray-100 overflow-hidden">
                                    {/* Status Banner */}
                                    <div className={`px-8 py-4 ${document?.aprobacionDoliente === 'Aprobado' ? 'bg-green-50 text-green-700' :
                                        document?.aprobacionDoliente === 'Rechazado' ? 'bg-red-50 text-red-700' :
                                            'bg-[#254153]/5 text-[#254153]'
                                        } text-sm font-bold flex items-center justify-between`}>
                                        <div className="flex items-center gap-2">
                                            <div className={`h-2 w-2 rounded-full ${document?.aprobacionDoliente === 'Aprobado' ? 'bg-green-500' :
                                                document?.aprobacionDoliente === 'Rechazado' ? 'bg-red-500' :
                                                    'bg-[#254153] animate-pulse'
                                                }`} />
                                            {document?.aprobacionDoliente === 'Aprobado' ? 'APROBADO ANTERIORMENTE' :
                                                document?.aprobacionDoliente === 'Rechazado' ? 'RECHAZADO ANTERIORMENTE' :
                                                    'PENDIENTE DE TU ACCIÓN'}
                                        </div>
                                        <div className="flex items-center gap-4">
                                            {(!document?.aprobacionDoliente || document.aprobacionDoliente === 'Pendiente' || document.aprobacionDoliente === 'Por Aprobar') && !isEditingResponsible && (
                                                <button 
                                                    onClick={() => setIsEditingResponsible(true)}
                                                    className="bg-white hover:bg-[#254153] hover:text-white px-5 py-2.5 rounded-xl border-2 border-[#254153]/10 text-xs font-black uppercase transition-all shadow-sm active:scale-95 flex items-center gap-2"
                                                >
                                                    <User className="h-4 w-4" />
                                                    Reasignar Documento
                                                </button>
                                            )}
                                            <span className="opacity-60 text-xs">#{document?.id}</span>
                                        </div>
                                    </div>

                                    {/* Reassignment Search Overlay */}
                                    <AnimatePresence>
                                        {isEditingResponsible && (
                                            <motion.div
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: 'auto', opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                className="bg-[#244153] text-white overflow-hidden"
                                            >
                                                <div className="p-8 space-y-4">
                                                    <div className="flex items-center justify-between">
                                                        <h3 className="text-sm font-black uppercase tracking-widest">Reasignar Responsable</h3>
                                                        <button onClick={() => setIsEditingResponsible(false)} className="opacity-60 hover:opacity-100 transition-all">
                                                            <X className="h-5 w-5" />
                                                        </button>
                                                    </div>
                                                    
                                                    <div className="relative">
                                                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                                            {isSearchingUsers ? (
                                                                <Loader2 className="h-4 w-4 animate-spin text-white/40" />
                                                            ) : (
                                                                <User className="h-4 w-4 text-white/40" />
                                                            )}
                                                        </div>
                                                        <input 
                                                            type="text"
                                                            placeholder="Escribe el nombre del nuevo responsable..."
                                                            className="w-full bg-white/10 border border-white/20 rounded-2xl py-3.5 pl-11 pr-4 text-sm font-bold placeholder:text-white/30 outline-none focus:bg-white/20 focus:border-white/40 transition-all"
                                                            value={userSearchQuery}
                                                            onChange={(e) => setUserSearchQuery(e.target.value)}
                                                            autoFocus
                                                        />
                                                    </div>

                                                    {userSearchResults.length > 0 && (
                                                        <div className="bg-white/10 rounded-[20px] border border-white/10 divide-y divide-white/10 max-h-[250px] overflow-y-auto">
                                                            {userSearchResults.map((user) => (
                                                                <button
                                                                    key={user.id}
                                                                    onClick={() => {
                                                                        setPendingResponsibleUser(user);
                                                                        setUserSearchQuery("");
                                                                        setUserSearchResults([]);
                                                                    }}
                                                                    className="w-full px-5 py-3 text-left hover:bg-white/10 transition-all flex items-center justify-between group"
                                                                >
                                                                    <div>
                                                                        <p className="text-sm font-bold text-white">{user.name}</p>
                                                                        <p className="text-[10px] text-white/40 font-medium">{user.email}</p>
                                                                    </div>
                                                                    <div className="h-6 w-6 rounded-full bg-white/10 flex items-center justify-center group-hover:bg-[#4ade80] group-hover:text-white transition-all">
                                                                        <Plus className="h-3 w-3" />
                                                                    </div>
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}

                                                    {pendingResponsibleUser && (
                                                        <motion.div 
                                                            initial={{ opacity: 0, y: 10 }}
                                                            animate={{ opacity: 1, y: 0 }}
                                                            className="bg-white/10 p-4 rounded-2xl border-2 border-[#4ade80]/40 flex items-center justify-between"
                                                        >
                                                            <div className="flex items-center gap-3">
                                                                <div className="h-10 w-10 rounded-full bg-[#4ade80]/20 flex items-center justify-center border border-[#4ade80]/40">
                                                                    <User className="h-5 w-5 text-[#4ade80]" />
                                                                </div>
                                                                <div>
                                                                    <p className="text-xs font-black uppercase text-[#4ade80] tracking-wider mb-0.5">Nuevo Responsable</p>
                                                                    <p className="text-sm font-bold text-white">{pendingResponsibleUser.name}</p>
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <button 
                                                                    onClick={() => setPendingResponsibleUser(null)}
                                                                    className="px-4 py-2 rounded-xl text-xs font-bold hover:bg-white/10 transition-all text-white"
                                                                >
                                                                    Cancelar
                                                                </button>
                                                                <Button 
                                                                    onClick={handleUpdateResponsible}
                                                                    disabled={isUpdatingResponsible}
                                                                    className="bg-[#4ade80] hover:bg-[#22c55e] text-[#1a2e3b] font-black text-xs px-6 rounded-xl h-10 shadow-lg shadow-[#4ade80]/20"
                                                                >
                                                                    {isUpdatingResponsible ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar Cambio"}
                                                                </Button>
                                                            </div>
                                                        </motion.div>
                                                    )}
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>

                                    <div className="p-8 space-y-10">
                                        {/* Info Grid */}
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                            <div className="space-y-1.5">
                                                <div className="flex items-center gap-2 text-gray-400 mb-1">
                                                    <Building2 className="h-4 w-4" />
                                                    <span className="text-[10px] font-black uppercase tracking-wider">Proveedor</span>
                                                </div>
                                                <p className="text-lg font-bold text-gray-900 leading-tight">{document?.proveedor}</p>
                                                <p className="text-xs text-gray-500">NIT: {document?.nit}</p>
                                            </div>

                                            <div className="space-y-1.5">
                                                <div className="flex items-center gap-2 text-gray-400 mb-1">
                                                    <DollarSign className="h-4 w-4" />
                                                    <span className="text-[10px] font-black uppercase tracking-wider">Valor Total</span>
                                                </div>
                                                <div className="relative group">
                                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-10">
                                                        <span className="text-gray-400 font-bold">$</span>
                                                    </div>
                                                    <input 
                                                        type="text"
                                                        value={editableTotal}
                                                        onChange={(e) => setEditableTotal(e.target.value)}
                                                        className="text-2xl font-black text-[#254153] bg-[#254153]/5 border-2 border-transparent focus:border-[#254153]/20 focus:bg-white rounded-2xl py-2 pl-8 pr-4 w-full outline-none transition-all hover:bg-[#254153]/10"
                                                        placeholder="0.00"
                                                    />
                                                </div>
                                            </div>

                                            <div className="space-y-1.5">
                                                <div className="flex items-center gap-2 text-gray-400 mb-1">
                                                    <Hash className="h-4 w-4" />
                                                    <span className="text-[10px] font-black uppercase tracking-wider">Documento</span>
                                                </div>
                                                <p className="text-base font-bold text-gray-800">{document?.nroFactura}</p>
                                            </div>

                                            <div className="space-y-1.5">
                                                <div className="flex items-center gap-2 text-gray-400 mb-1">
                                                    <User className="h-4 w-4" />
                                                    <span className="text-[10px] font-black uppercase tracking-wider">Responsable</span>
                                                </div>
                                                <p className="text-base font-bold text-gray-800">{document?.responsableActual || "No asignado"}</p>
                                            </div>

                                            <div className="space-y-1.5">
                                                <div className="flex items-center gap-2 text-gray-400 mb-1">
                                                    <Calendar className="h-4 w-4" />
                                                    <span className="text-[10px] font-black uppercase tracking-wider">Fecha</span>
                                                </div>
                                                <p className="text-base font-bold text-gray-800">
                                                    {document?.fechaRegistro ? new Date(document.fechaRegistro).toLocaleDateString('es-CO', {
                                                        day: 'numeric',
                                                        month: 'short',
                                                        year: 'numeric'
                                                    }) : 'N/A'}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Form and Actions */}
                                <div className="bg-white rounded-[32px] shadow-xl border border-gray-100 p-8 md:p-10">
                                    {(!document?.aprobacionDoliente || document.aprobacionDoliente === 'Pendiente' || document.aprobacionDoliente === 'Por Aprobar') ? (
                                        <div className="space-y-8">
                                            <div className="space-y-4">
                                                <label className="text-sm font-bold text-[#254153]">¿Tiene anticipo o no el documento?</label>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-3 gap-3">
                                                    {[
                                                        { id: 'con-anticipo', label: 'Con anticipo', value: 'Con anticipo' },
                                                        { id: 'sin-anticipo', label: 'Sin anticipo', value: 'Sin anticipo' },
                                                        { id: 'con-tarjeta', label: 'Compra con tarjeta', value: 'Compra con tarjeta' }
                                                    ].map((opt) => (
                                                        <label
                                                            key={opt.id}
                                                            className={`flex items-center justify-center p-3.5 rounded-2xl border-2 cursor-pointer transition-all ${
                                                                anticipo === opt.value
                                                                    ? 'border-[#254153] bg-[#254153]/5 text-[#254153]'
                                                                    : 'border-gray-50 bg-gray-50/30 text-gray-500 hover:border-gray-200'
                                                            }`}
                                                        >
                                                            <input
                                                                type="radio"
                                                                name="anticipo"
                                                                value={opt.value}
                                                                checked={anticipo === opt.value}
                                                                onChange={(e) => setAnticipo(e.target.value)}
                                                                className="sr-only"
                                                            />
                                                            <span className="text-xs font-bold text-center leading-tight">{opt.label}</span>
                                                        </label>
                                                    ))}
                                                </div>
                                            </div>

                                            <div className="space-y-3">
                                                <label className="text-sm font-bold text-[#254153]">Observaciones</label>
                                                <textarea
                                                    value={observaciones}
                                                    onChange={(e) => setObservaciones(e.target.value)}
                                                    className="w-full rounded-2xl border border-gray-200 p-5 focus:ring-4 focus:ring-[#254153]/10 focus:border-[#254153] outline-none transition-all resize-none h-28 text-sm text-gray-700 placeholder-gray-400"
                                                    placeholder="Añade observaciones (obligatorio para rechazar)..."
                                                    disabled={!!actionLoading}
                                                />
                                            </div>

                                            <div className="space-y-5">
                                                <div className="flex items-center justify-between">
                                                    <label className="text-sm font-bold text-[#254153]">Distribución Contable</label>
                                                    <Button 
                                                        variant="outline" 
                                                        onClick={() => {
                                                            const totalDoc = parseFloat(document?.valorTotal || "0");
                                                            const currentDistTotal = distribuciones.reduce((s, d) => s + (parseFloat(d.valor) || 0), 0);
                                                            const remaining = Math.max(0, totalDoc - currentDistTotal);
                                                            setDistribuciones([...distribuciones, { centroCostos: '', cuenta: '', valor: remaining > 0 ? remaining.toString() : '' }]);
                                                        }}
                                                        className="h-9 py-0 px-4 text-xs font-bold border-[#254153]/10 text-[#254153] bg-[#254153]/5 hover:bg-[#254153] hover:text-white rounded-xl transition-all"
                                                        disabled={!!actionLoading}
                                                    >
                                                        <Plus className="h-4 w-4 mr-1" /> Agregar Fila
                                                    </Button>
                                                </div>

                                                <div className="space-y-4">
                                                    {distribuciones.map((distribucion, index) => (
                                                        <div key={index} className="space-y-3 p-5 bg-gray-50 rounded-2xl border border-gray-100 relative group transition-all hover:bg-white hover:shadow-md">
                                                            {distribuciones.length > 1 && (
                                                                <button 
                                                                    onClick={() => setDistribuciones(distribuciones.filter((_, i) => i !== index))}
                                                                    className="absolute -top-3 -right-3 h-8 w-8 bg-white border border-red-100 text-red-500 rounded-full flex items-center justify-center hover:bg-red-500 hover:text-white transition-all shadow-md z-10"
                                                                    disabled={!!actionLoading}
                                                                >
                                                                    <Trash2 className="h-4 w-4" />
                                                                </button>
                                                            )}
                                                            
                                                            <div className="grid grid-cols-1 gap-4">
                                                                <div className="space-y-1.5">
                                                                    <label className="text-[10px] font-black uppercase text-gray-500 tracking-wider">Centro Costos</label>
                                                                    <SearchableSelect
                                                                        options={(() => {
                                                                            const uniqueMap = new Map();
                                                                            centrosCostosList.forEach((c: any) => {
                                                                                const label = `${c.codigo ? c.codigo + ' - ' : ''}${c.Título}`;
                                                                                if (!uniqueMap.has(label)) {
                                                                                    uniqueMap.set(label, { value: label, label });
                                                                                }
                                                                            });
                                                                            return Array.from(uniqueMap.values());
                                                                        })()}
                                                                        value={distribucion.centroCostos}
                                                                        onChange={(val) => {
                                                                            const newDist = [...distribuciones];
                                                                            newDist[index].centroCostos = val;
                                                                            newDist[index].cuenta = "";
                                                                            setDistribuciones(newDist);
                                                                        }}
                                                                        placeholder="Selecciona CC..."
                                                                        disabled={!!actionLoading}
                                                                    />
                                                                </div>

                                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                                    <div className="space-y-1.5">
                                                                        <label className="text-[10px] font-black uppercase text-gray-500 tracking-wider">Cuenta</label>
                                                                        <SearchableSelect
                                                                            options={(() => {
                                                                                const isNoAplica = distribucion.centroCostos?.toLowerCase().includes("no aplica");
                                                                                
                                                                                if (isNoAplica) {
                                                                                    // Mostrar cuentas permitidas para No aplica
                                                                                    return cuentasList
                                                                                        .filter((c: any) => 
                                                                                            c.Título?.startsWith("0") || 
                                                                                            c.Título?.startsWith("22") ||
                                                                                            c.Título?.startsWith("1465") ||
                                                                                            c.Título?.startsWith("740105") ||
                                                                                            c.Título?.startsWith("530515") ||
                                                                                            c.Título?.startsWith("1105")
                                                                                        )
                                                                                        .map((c: any) => ({
                                                                                            value: c.Título,
                                                                                            label: c.Título
                                                                                        }));
                                                                                }

                                                                                const selectedCC = centrosCostosList.find(c => `${c.codigo ? c.codigo + ' - ' : ''}${c.Título}` === distribucion.centroCostos);
                                                                                const prefix = selectedCC?.cuentas_asociadas?.toString();
                                                                                const isGV = distribucion.centroCostos?.toUpperCase().startsWith("GV");
                                                                                const filtered = prefix 
                                                                                    ? cuentasList.filter(c => c.Título?.startsWith(prefix) || (isGV && c.Título?.startsWith("26059510")))
                                                                                    : cuentasList;
                                                                                
                                                                                return filtered.map((c: any) => ({
                                                                                    value: c.Título,
                                                                                    label: c.Título
                                                                                }));
                                                                            })()}
                                                                            value={distribucion.cuenta}
                                                                            onChange={(val) => {
                                                                                const newDist = [...distribuciones];
                                                                                newDist[index].cuenta = val;
                                                                                setDistribuciones(newDist);
                                                                            }}
                                                                            placeholder="Selecciona Cuenta..."
                                                                            disabled={!!actionLoading || !distribucion.centroCostos}
                                                                        />
                                                                    </div>

                                                                    <div className="space-y-1.5">
                                                                        <label className="text-[10px] font-black uppercase text-gray-500 tracking-wider">Valor a Pagar</label>
                                                                        <div className="relative">
                                                                            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                                                                                <DollarSign className="h-4 w-4 text-[#254153]" />
                                                                            </div>
                                                                            <input
                                                                                type="number"
                                                                                value={distribucion.valor}
                                                                                onChange={(e) => {
                                                                                    const newValue = e.target.value;
                                                                                    const newDist = [...distribuciones];
                                                                                    newDist[index].valor = newValue;
                                                                                    setDistribuciones(newDist);
                                                                                }}
                                                                                className="w-full rounded-xl border border-gray-200 pl-9 pr-12 py-2.5 text-sm text-gray-900 font-bold outline-none focus:border-[#254153] focus:ring-2 focus:ring-[#254153]/10 bg-white"
                                                                                disabled={!!actionLoading}
                                                                            />
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => {
                                                                                    const totalDoc = parseSafeFloat(editableTotal);
                                                                                    const otherDistTotal = distribuciones.reduce((s, d, i) => i === index ? s : s + parseSafeFloat(d.valor), 0);
                                                                                    const remaining = Math.max(0, totalDoc - otherDistTotal);
                                                                                    const newDist = [...distribuciones];
                                                                                    newDist[index].valor = remaining.toString();
                                                                                    setDistribuciones(newDist);
                                                                                }}
                                                                                className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-black uppercase text-[#254153] bg-[#254153]/5 px-2 py-1 rounded-lg hover:bg-[#254153] hover:text-white transition-all"
                                                                                disabled={!!actionLoading}
                                                                                title="Completar el valor restante"
                                                                            >
                                                                                Fin
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>

                                                <div className="bg-[#254153]/5 p-5 rounded-2xl border border-gray-100">
                                                    <div className="flex justify-between items-center text-sm">
                                                        <span className="font-bold text-gray-500 uppercase text-[10px] tracking-widest">Total distribuido</span>
                                                        <span className={`font-black text-base ${
                                                            editableTotal && (distribuciones.reduce((s,d) => s + parseSafeFloat(d.valor), 0) <= parseSafeFloat(editableTotal) + 0.01)
                                                            ? 'text-green-600' : 'text-red-500'
                                                        }`}>
                                                            {new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
                                                                .format(distribuciones.reduce((s,d) => s + parseSafeFloat(d.valor), 0))}
                                                            <span className="text-gray-300 font-normal mx-2.5">/</span>
                                                            {editableTotal && new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(parseSafeFloat(editableTotal))}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4">
                                                <Button
                                                    className="h-16 rounded-3xl bg-[#254153] hover:bg-[#1a2e3b] text-base font-black shadow-xl shadow-[#254153]/20 transition-all hover:scale-[1.02] active:scale-[0.98] order-2 sm:order-1"
                                                    disabled={!!actionLoading}
                                                    onClick={() => handleAction('Aprobado')}
                                                >
                                                    {actionLoading === 'Aprobado' ? (
                                                        <Loader2 className="h-6 w-6 animate-spin mr-3" />
                                                    ) : (
                                                        <CheckCircle2 className="h-6 w-6 mr-3" />
                                                    )}
                                                    Aprobar Documento
                                                </Button>
                                                <Button
                                                    variant="outline"
                                                    className="h-16 rounded-3xl border-2 border-red-50 text-red-500 hover:bg-red-50 hover:border-red-100 hover:text-red-700 text-base font-black transition-all hover:scale-[1.02] active:scale-[0.98] order-1 sm:order-2"
                                                    disabled={!!actionLoading}
                                                    onClick={() => {
                                                        if (confirm("¿Estás seguro que deseas rechazar este documento soporte?")) {
                                                            handleAction('Rechazado');
                                                        }
                                                    }}
                                                >
                                                    {actionLoading === 'Rechazado' ? (
                                                        <Loader2 className="h-6 w-6 animate-spin mr-3" />
                                                    ) : (
                                                        <XCircle className="h-6 w-6 mr-3" />
                                                    )}
                                                    Rechazar
                                                </Button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="text-center p-10 bg-gray-50 rounded-[32px] border border-gray-100">
                                            <div className="bg-white h-16 w-16 rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm">
                                                <CheckCircle2 className="h-8 w-8 text-green-500" />
                                            </div>
                                            <p className="text-gray-700 font-bold mb-2">Ya Procesado</p>
                                            <p className="text-gray-500 text-sm font-medium italic">
                                                Este documento soporte ya fue gestionado y no admite más cambios desde este acceso externo.
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Right Column: PDF Preview (Sticky) */}
                            <div className="lg:col-span-7 h-full">
                                <div className="lg:sticky lg:top-8 space-y-4">
                                    <div className="bg-white p-4 sm:p-6 rounded-[32px] shadow-2xl border border-gray-100 overflow-hidden h-fit">
                                        <div className="flex items-center justify-between mb-6 px-2">
                                            <div className="flex items-center gap-3">
                                                <div className="bg-blue-50 p-2 rounded-xl">
                                                    <FileText className="h-5 w-5 text-blue-600" />
                                                </div>
                                                <div>
                                                    <h4 className="text-sm font-black text-gray-800 uppercase tracking-wider">Vista del Documento</h4>
                                                    <p className="text-[10px] text-gray-400 font-bold">{document?.documentInfo?.fileName || "Visualización Directa"}</p>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="relative min-h-[500px] lg:min-h-[750px] w-full bg-gray-50 rounded-2xl border border-gray-100 overflow-hidden group">
                                            {previewLoading ? (
                                                <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm z-10 transition-all">
                                                    <Loader2 className="h-10 w-10 text-[#254153] animate-spin mb-4" />
                                                    <p className="text-xs font-black text-[#254153] uppercase tracking-[2px]">Optimizando visualización...</p>
                                                </div>
                                            ) : previewError ? (
                                                <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center bg-red-50/50">
                                                    <div className="bg-white p-4 rounded-full shadow-sm mb-4">
                                                        <AlertCircle className="h-8 w-8 text-red-500" />
                                                    </div>
                                                    <p className="text-sm font-black text-red-900 mb-4 px-4">{previewError}</p>
                                                    <Button 
                                                        onClick={handlePreview} 
                                                        className="px-8 py-4 bg-red-500 hover:bg-red-600 text-white font-bold rounded-2xl shadow-lg transition-all"
                                                    >
                                                        Reintentar Carga
                                                    </Button>
                                                </div>
                                            ) : previewUrl ? (
                                                <iframe 
                                                    src={`${previewUrl}#toolbar=0&navpanes=0&scrollbar=1`} 
                                                    className="w-full h-[500px] lg:h-[750px] border-none shadow-inner bg-white"
                                                    title="Document Preview"
                                                />
                                            ) : (
                                                <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-50 border-2 border-dashed border-gray-200 rounded-2xl m-4">
                                                    <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100 mb-4">
                                                        <FileText className="h-8 w-8 text-[#254153]/20" />
                                                    </div>
                                                    <p className="text-xs font-bold text-gray-400">Esperando archivo...</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Quick Tips or Footer for Right Column */}
                                    <div className="hidden lg:flex items-center gap-4 px-8 py-4 bg-[#254153]/5 rounded-[24px] border border-[#254153]/5">
                                        <div className="h-2 w-2 rounded-full bg-green-500" />
                                        <p className="text-[10px] font-bold text-[#254153] opacity-60">Visualización en tiempo real optimizada para Fibra Óptica y conexiones 4G+.</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Footer Info */}
                        <div className="mt-12 text-center pb-8 border-t border-gray-100 pt-8">
                            <p className="text-gray-400 text-[10px] font-medium leading-loose">
                                Este enlace es de uso exclusivo para el responsable de autorizar el documento soporte.<br />
                                Soporte técnico: firplaksa.sharepoint.com | © 2026 Firplak SA - Sistema Automático de Gestión
                            </p>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
