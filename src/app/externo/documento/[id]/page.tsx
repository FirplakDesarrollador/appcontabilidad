/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
    CheckCircle2,
    XCircle,
    FileText,
    FileSpreadsheet,
    Eye,
    User,
    Calendar,
    DollarSign,
    AlertCircle,
    Building2,
    Hash,
    Loader2,
    Plus,
    Trash2,
    Download,
    X,
    Home
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { PdfViewerWithZoom } from "@/components/ui/PdfViewerWithZoom";
import { validarObservacionRechazo, esObservacionPorDefecto } from "@/lib/validarObservacionRechazo";

interface DocumentData {
    id: string;
    proveedor: string;
    nit: string;
    valorTotal: string;
    nroFactura: string; 
    consecutivo?: string;
    fechaRegistro: string;
    estadoFactura: string;
    aprobacionDoliente: string;
    gestionContabilidad: string;
    responsableActual?: string;
    documentInfo?: any;
    pdf_url?: string | null;
    adjunto?: any;
    observaciones?: string;
}

interface DocAttachment {
    id: string;
    name: string;
    url: string;
    downloadUrl: string;
    rawUrl: string;
    isPrincipal: boolean;
    anexoIndex?: number;
    ext: string;
    isPdf: boolean;
    isExcel: boolean;
    isImage: boolean;
}

const getAttachmentsForDoc = (doc: DocumentData | null): DocAttachment[] => {
    if (!doc) return [];
    const items: DocAttachment[] = [];

    const getExt = (nameOrUrl: string) => {
        try {
            const clean = (nameOrUrl || '').split('?')[0].split('#')[0];
            const parts = clean.split('.');
            if (parts.length > 1) {
                const ext = parts.pop()?.toLowerCase();
                if (ext && ext.length <= 6 && /^[a-z0-9]+$/.test(ext)) return ext;
            }
        } catch {}
        return 'pdf';
    };

    const buildAttachment = (name: string, rawUrl: string, isPrincipal: boolean, anexoIndex?: number): DocAttachment => {
        const ext = (name.includes('.') ? getExt(name) : '') || getExt(rawUrl) || 'pdf';
        const downloadUrl = `/api/externo/documento/${doc.id}/download?download=true${anexoIndex !== undefined ? `&anexoIndex=${anexoIndex}` : ''}`;
        const previewUrl = `/api/externo/documento/${doc.id}/download${anexoIndex !== undefined ? `?anexoIndex=${anexoIndex}` : ''}`;
        const isPdf = ext === 'pdf';
        const isExcel = ['xlsx', 'xls', 'csv', 'xlsm', 'xlsb'].includes(ext);
        const isImage = ['png', 'jpg', 'jpeg', 'webp', 'svg'].includes(ext);

        return {
            id: isPrincipal ? `principal_${doc.id}` : `anexo_${anexoIndex}`,
            name,
            url: previewUrl,
            downloadUrl,
            rawUrl,
            isPrincipal,
            anexoIndex,
            ext,
            isPdf,
            isExcel,
            isImage
        };
    };

    // 1. Documento principal
    const principalUrl =
        doc.pdf_url ||
        doc.documentInfo?.pdfUrl ||
        (doc.adjunto && typeof doc.adjunto === 'string' && doc.adjunto.startsWith('http') && !doc.adjunto.trim().startsWith('[')
            ? doc.adjunto
            : null);

    if (principalUrl) {
        const ext = getExt(principalUrl);
        const providerClean = (doc.proveedor || '').replace(/[<>:"/\\|?*]/g, '').trim();
        const consecutivo = doc.nroFactura || doc.consecutivo || doc.id;
        const name = providerClean ? `RAD ${providerClean} DOC SOPORTE.${ext}` : `Documento_Principal_${consecutivo}.${ext}`;
        items.push(buildAttachment(name, principalUrl, true));
    }

    // 2. Anexos adicionales en doc.adjunto
    if (doc.adjunto) {
        try {
            const parsed = typeof doc.adjunto === 'string' ? JSON.parse(doc.adjunto) : doc.adjunto;
            if (Array.isArray(parsed)) {
                parsed.forEach((anexo: any, idx: number) => {
                    const anexoName = anexo?.name || `Anexo_${idx + 1}`;
                    items.push(buildAttachment(anexoName, anexo?.url || '', false, idx));
                });
            } else if (typeof doc.adjunto === 'string' && doc.adjunto !== principalUrl && doc.adjunto.startsWith('http')) {
                const ext = getExt(doc.adjunto);
                items.push(buildAttachment(`Anexo_Adicional.${ext}`, doc.adjunto, false, 0));
            }
        } catch {
            if (typeof doc.adjunto === 'string' && doc.adjunto !== principalUrl && doc.adjunto.startsWith('http')) {
                const ext = getExt(doc.adjunto);
                items.push(buildAttachment(`Anexo_Adicional.${ext}`, doc.adjunto, false, 0));
            }
        }
    }

    if (items.length === 0) {
        const consecutivo = doc.nroFactura || doc.consecutivo || doc.id;
        items.push(buildAttachment(`Documento_${consecutivo}.pdf`, `/api/externo/documento/${doc.id}/download`, true));
    }

    return items;
};

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
    const [initialObservaciones, setInitialObservaciones] = useState<string>("");
    const [observacionesError, setObservacionesError] = useState<string | null>(null);
    const observacionesRef = useRef<HTMLTextAreaElement>(null);
    const [distribuciones, setDistribuciones] = useState<{ centroCostos: string; cuenta: string; valor: string }[]>([{ centroCostos: "", cuenta: "", valor: "" }]);
    const [anticipo, setAnticipo] = useState<string>("");
    const [editableTotal, setEditableTotal] = useState<string>("");

    const [centrosCostosList, setCentrosCostosList] = useState<any[]>([]);
    const [cuentasList, setCuentasList] = useState<any[]>([]);
    const [downloadLoading, setDownloadLoading] = useState(false);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [previewError, setPreviewError] = useState<string | null>(null);
    const [activeAttachment, setActiveAttachment] = useState<DocAttachment | null>(null);

    // Reasignment States
    const [isEditingResponsible, setIsEditingResponsible] = useState(false);
    const [userSearchQuery, setUserSearchQuery] = useState("");
    const [userSearchResults, setUserSearchResults] = useState<any[]>([]);
    const [isSearchingUsers, setIsSearchingUsers] = useState(false);
    const [isUpdatingResponsible, setIsUpdatingResponsible] = useState(false);
    const [pendingResponsibleUser, setPendingResponsibleUser] = useState<any>(null);

    const currentDocAttachments = useMemo(() => getAttachmentsForDoc(document), [document]);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            await Promise.all([fetchDocument(), fetchCatalogos()]);
            setLoading(false);
        };
        fetchData();
    }, [itemId]);

    useEffect(() => {
        if (document && currentDocAttachments.length > 0 && !activeAttachment) {
            handleSelectAttachment(currentDocAttachments[0]);
        }
    }, [document, currentDocAttachments]);

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

    const handleSelectAttachment = (att: DocAttachment) => {
        setPreviewError(null);
        setActiveAttachment(att);
        setPreviewUrl(att.url);
    };

    const handleDownloadOne = (att: DocAttachment) => {
        const a = window.document.createElement('a');
        a.href = att.downloadUrl;
        a.download = att.name;
        a.target = '_blank';
        window.document.body.appendChild(a);
        a.click();
        window.document.body.removeChild(a);
    };

    const handleDownloadAll = (attachments: DocAttachment[]) => {
        if (!attachments || attachments.length === 0) return;
        if (attachments.length === 1) {
            handleDownloadOne(attachments[0]);
            return;
        }
        attachments.forEach((att, idx) => {
            setTimeout(() => {
                handleDownloadOne(att);
            }, idx * 350);
        });
    };

    const handleDownload = async () => {
        try {
            setDownloadLoading(true);
            if (activeAttachment) {
                handleDownloadOne(activeAttachment);
                return;
            }
            if (currentDocAttachments.length > 0) {
                handleDownloadOne(currentDocAttachments[0]);
                return;
            }
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
            const target = activeAttachment || currentDocAttachments[0];
            if (target) {
                setActiveAttachment(target);
                setPreviewUrl(target.url);
            }
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
                    if (normalized.length === 0 && data.valorTotal) {
                        setDistribuciones([{ centroCostos: "", cuenta: "", valor: data.valorTotal }]);
                    } else {
                        setDistribuciones(normalized);
                    }
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
            if (data.anticipo) {
                setAnticipo(data.anticipo);
            }
            setObservaciones(data.observaciones || "");
            setInitialObservaciones(data.observaciones || "");
        } catch (err: any) {
            setError(err.message || "No se pudo cargar la información del documento soporte");
        }
    };

    const validateRejectionReason = (): string | null => {
        const validation = validarObservacionRechazo(observaciones, initialObservaciones);
        if (!validation.valid) {
            const msg = validation.error || "Debes ingresar el motivo del rechazo.";
            setObservacionesError(msg);
            setTimeout(() => {
                observacionesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                observacionesRef.current?.focus();
                observacionesRef.current?.select();
            }, 50);
            return msg;
        }
        setObservacionesError(null);
        return null;
    };

    const handleAction = async (action: 'Aprobado' | 'Rechazado') => {
        try {
            if (action === 'Rechazado') {
                const errorMsg = validateRejectionReason();
                if (errorMsg) {
                    alert(errorMsg);
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
                // Validar que cada centro de costos exista en el catálogo
                const ccValidos = new Set(centrosCostosList.map((c: any) => `${c.codigo ? c.codigo + ' - ' : ''}${c.Título}`.trim().toLowerCase()));
                const ccInvalidos = distribuciones.filter(d => !ccValidos.has(String(d.centroCostos).trim().toLowerCase())).map(d => d.centroCostos);
                if (ccInvalidos.length > 0) {
                    alert(`Los siguientes centros de costos no existen en el catálogo. Selecciónalos del desplegable:\n\n- ${Array.from(new Set(ccInvalidos)).join('\n- ')}`);
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
            let data: any = null;
            try {
                data = await res.json();
            } catch {
                if (!res.ok) {
                    throw new Error(`El servidor tardó en responder (${res.status}). Por favor, recarga la página para verificar si la acción se procesó.`);
                }
            }

            if (!data) {
                throw new Error("Respuesta inesperada del servidor. Por favor, recarga la página.");
            }

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
                                    onClick={() => currentDocAttachments.length > 1 ? handleDownloadAll(currentDocAttachments) : handleDownload()}
                                    disabled={downloadLoading}
                                    className="flex items-center justify-center gap-2 px-6 py-3 bg-[#254153]/5 border-2 border-[#254153]/10 rounded-2xl text-[#254153] text-sm font-bold hover:bg-[#254153] hover:text-white transition-all shadow-sm group"
                                >
                                    {downloadLoading ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <Download className="h-4 w-4" />
                                    )}
                                    {downloadLoading
                                        ? "Buscando..."
                                        : currentDocAttachments.length > 1
                                            ? `Descargar Todos (${currentDocAttachments.length})`
                                            : `Descargar Documento ${document?.nroFactura ? `#${document.nroFactura}` : ""}`}
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
                                            {document?.aprobacionDoliente === 'Aprobado' ? (document?.observaciones?.toLowerCase().includes('automática') ? 'APROBADO AUTOMÁTICAMENTE POR REGLA' : 'APROBADO ANTERIORMENTE') :
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

                                    <div className="p-8 space-y-8">
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

                                        {/* Documentos Adjuntos (Principal + Anexos) */}
                                        {currentDocAttachments.length > 0 && (
                                            <div className="bg-gray-50/70 p-5 rounded-2xl border border-gray-100 space-y-3">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <h4 className="text-[11px] font-black text-gray-400 uppercase tracking-[2px]">Documentos Adjuntos</h4>
                                                        <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-lg text-[10px] font-black">
                                                            {currentDocAttachments.length}
                                                        </span>
                                                    </div>
                                                    {currentDocAttachments.length > 1 && (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleDownloadAll(currentDocAttachments)}
                                                            className="text-xs font-black text-blue-600 hover:text-blue-700 flex items-center gap-1 hover:underline transition-colors"
                                                        >
                                                            <Download className="h-3.5 w-3.5" />
                                                            Descargar todos
                                                        </button>
                                                    )}
                                                </div>
                                                <div className="space-y-2.5">
                                                    {currentDocAttachments.map((att, idx) => {
                                                        const isSelected = activeAttachment?.id === att.id;
                                                        return (
                                                            <div
                                                                key={att.id || idx}
                                                                className={`bg-white p-3.5 rounded-xl border shadow-sm flex items-center justify-between group transition-all ${
                                                                    isSelected ? 'border-blue-400 ring-2 ring-blue-100' : 'border-gray-100 hover:border-blue-200'
                                                                }`}
                                                            >
                                                                <div
                                                                    className="flex items-center gap-3 cursor-pointer min-w-0 flex-1 mr-2"
                                                                    onClick={() => handleSelectAttachment(att)}
                                                                    title="Haz clic para ver este archivo en el visor"
                                                                >
                                                                    <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                                                                        att.isExcel ? 'bg-emerald-50 text-emerald-600 group-hover:bg-emerald-100' :
                                                                        att.isImage ? 'bg-purple-50 text-purple-600 group-hover:bg-purple-100' :
                                                                        'bg-blue-50 text-blue-600 group-hover:bg-blue-100'
                                                                    }`}>
                                                                        {att.isExcel ? <FileSpreadsheet className="h-5 w-5" /> :
                                                                         att.isImage ? <Eye className="h-5 w-5" /> :
                                                                         <FileText className="h-5 w-5" />}
                                                                    </div>
                                                                    <div className="min-w-0">
                                                                        <p className="text-sm font-bold text-[#254153] truncate" title={att.name}>
                                                                            {att.name}
                                                                        </p>
                                                                        <p className="text-[10px] text-gray-400 font-medium mt-0.5 flex items-center gap-1.5">
                                                                            <span>{att.isPrincipal ? "Documento Principal" : `Anexo ${att.anexoIndex !== undefined ? att.anexoIndex + 1 : idx}`}</span>
                                                                            <span>•</span>
                                                                            <span className="uppercase font-bold">{att.ext}</span>
                                                                            {isSelected && (
                                                                                <span className="text-blue-600 font-bold ml-1">• En vista</span>
                                                                            )}
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                                <div className="flex items-center gap-1.5 shrink-0">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleSelectAttachment(att)}
                                                                        className={`h-9 px-3 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition-all ${
                                                                            isSelected
                                                                                ? 'bg-[#254153] text-white border-[#254153]'
                                                                                : 'bg-gray-50 hover:bg-gray-100 text-[#254153] border-gray-200'
                                                                        }`}
                                                                        title={`Ver ${att.name}`}
                                                                    >
                                                                        <Eye className="h-3.5 w-3.5" />
                                                                        <span className="hidden sm:inline">Ver</span>
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            handleDownloadOne(att);
                                                                        }}
                                                                        className="h-9 px-3 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-600 text-xs font-bold flex items-center gap-1.5 border border-blue-100/80 transition-all shadow-sm active:scale-95"
                                                                        title={`Descargar ${att.name}`}
                                                                    >
                                                                        <Download className="h-3.5 w-3.5" />
                                                                        <span className="hidden sm:inline">Descargar</span>
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
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
                                                <div className="flex items-center justify-between gap-2">
                                                    <label className="text-sm font-bold text-[#254153]">Observaciones</label>
                                                    {observaciones.trim() !== "" && esObservacionPorDefecto(observaciones, initialObservaciones) && (
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setObservaciones("");
                                                                setObservacionesError(null);
                                                                observacionesRef.current?.focus();
                                                            }}
                                                            className="text-xs font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2.5 py-1 rounded-lg transition-colors"
                                                        >
                                                            Limpiar texto por defecto
                                                        </button>
                                                    )}
                                                </div>
                                                <textarea
                                                    ref={observacionesRef}
                                                    value={observaciones}
                                                    onChange={(e) => {
                                                        setObservaciones(e.target.value);
                                                        if (observacionesError) setObservacionesError(null);
                                                    }}
                                                    className={`w-full rounded-2xl border p-5 focus:ring-4 outline-none transition-all resize-none h-28 text-sm text-gray-700 placeholder-gray-400 ${
                                                        observacionesError
                                                            ? 'border-red-400 bg-red-50/30 focus:ring-red-500/15 focus:border-red-500'
                                                            : 'border-gray-200 focus:ring-[#254153]/10 focus:border-[#254153]'
                                                    }`}
                                                    placeholder="Añade observaciones (obligatorio cambiar el texto por defecto y explicar el motivo si vas a rechazar)..."
                                                    disabled={!!actionLoading}
                                                />
                                                {observacionesError ? (
                                                    <p className="text-xs font-bold text-red-600 flex items-center gap-1.5">
                                                        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                                                        {observacionesError}
                                                    </p>
                                                ) : (observaciones.trim() !== "" && esObservacionPorDefecto(observaciones, initialObservaciones) && (
                                                    <p className="text-[11px] font-medium text-amber-700">
                                                        Nota: Para rechazar debes borrar este mensaje automático y escribir el motivo del rechazo.
                                                    </p>
                                                ))}
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
                                                                                    return cuentasList
                                                                                        .filter((c: any) => 
                                                                                            c.Título?.startsWith("0") || 
                                                                                            c.Título?.startsWith("22") ||
                                                                                            c.Título?.startsWith("1465") ||
                                                                                            c.Título?.startsWith("740105") ||
                                                                                            c.Título?.startsWith("530515") ||
                                                                                            c.Título?.startsWith("1105") ||
                                                                                            c.Título?.startsWith("14350520")
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
                                                        const errorMsg = validateRejectionReason();
                                                        if (errorMsg) {
                                                            alert(errorMsg);
                                                            return;
                                                        }
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

                            {/* Right Column: PDF / Attachment Preview (Sticky) */}
                            <div className="lg:col-span-7 h-full">
                                <div className="lg:sticky lg:top-8 space-y-4">
                                    {currentDocAttachments.length > 1 && (
                                        <div className="bg-white p-3 rounded-2xl shadow-md border border-gray-100 flex items-center gap-2 overflow-x-auto">
                                            {currentDocAttachments.map((att, idx) => {
                                                const isSelected = activeAttachment?.id === att.id;
                                                return (
                                                    <button
                                                        key={att.id || idx}
                                                        type="button"
                                                        onClick={() => handleSelectAttachment(att)}
                                                        className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 shrink-0 transition-all ${
                                                            isSelected
                                                                ? 'bg-[#254153] text-white shadow-sm'
                                                                : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                                                        }`}
                                                    >
                                                        {att.isExcel ? <FileSpreadsheet className="h-4 w-4" /> :
                                                         att.isImage ? <Eye className="h-4 w-4" /> :
                                                         <FileText className="h-4 w-4" />}
                                                        <span className="max-w-[180px] truncate">
                                                            {att.isPrincipal ? 'Documento Principal' : att.name}
                                                        </span>
                                                        <span className={`text-[10px] uppercase px-1.5 py-0.5 rounded ${
                                                            isSelected ? 'bg-white/20 text-white' : 'bg-gray-200/70 text-gray-500'
                                                        }`}>
                                                            {att.ext}
                                                        </span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}

                                    <div className="bg-white p-4 sm:p-6 rounded-[32px] shadow-2xl border border-gray-100 overflow-hidden h-fit">
                                        {activeAttachment && !activeAttachment.isPdf && activeAttachment.isImage && previewUrl ? (
                                            <div className="space-y-4">
                                                <div className="flex items-center justify-between px-2">
                                                    <div>
                                                        <h3 className="text-sm font-black text-[#254153] uppercase tracking-wider">Vista de Imagen</h3>
                                                        <p className="text-xs text-gray-500 font-medium truncate max-w-md">{activeAttachment.name}</p>
                                                    </div>
                                                    <Button
                                                        type="button"
                                                        onClick={() => handleDownloadOne(activeAttachment)}
                                                        className="h-9 px-4 bg-[#254153] hover:bg-[#1a2e3b] text-white font-bold rounded-xl text-xs flex items-center gap-2"
                                                    >
                                                        <Download className="h-3.5 w-3.5" />
                                                        Descargar
                                                    </Button>
                                                </div>
                                                <div className="min-h-[500px] max-h-[75vh] bg-gray-50 rounded-2xl border border-gray-100 flex items-center justify-center p-4 overflow-auto">
                                                    <img
                                                        src={previewUrl}
                                                        alt={activeAttachment.name}
                                                        className="max-w-full max-h-[70vh] object-contain rounded-lg shadow-sm"
                                                    />
                                                </div>
                                            </div>
                                        ) : activeAttachment && !activeAttachment.isPdf ? (
                                            <div className="min-h-[450px] flex flex-col items-center justify-center p-8 text-center bg-gray-50/60 rounded-2xl border border-gray-100">
                                                <div className={`h-20 w-20 rounded-2xl flex items-center justify-center mb-4 shadow-sm border ${
                                                    activeAttachment.isExcel
                                                        ? 'bg-emerald-100/80 border-emerald-200/50 text-emerald-600'
                                                        : 'bg-blue-100/80 border-blue-200/50 text-blue-600'
                                                }`}>
                                                    {activeAttachment.isExcel ? (
                                                        <FileSpreadsheet className="h-10 w-10" />
                                                    ) : (
                                                        <FileText className="h-10 w-10" />
                                                    )}
                                                </div>
                                                <p className="text-base font-black text-[#254153] mb-1 px-4 truncate max-w-full" title={activeAttachment.name}>
                                                    {activeAttachment.name}
                                                </p>
                                                <p className="text-xs text-gray-500 font-medium mb-6 max-w-sm">
                                                    {activeAttachment.isExcel
                                                        ? "Hoja de cálculo Excel lista para descargar y revisar en tu equipo."
                                                        : `Archivo (${activeAttachment.ext.toUpperCase()}) listo para descargar y revisar en tu equipo.`}
                                                </p>
                                                <Button
                                                    type="button"
                                                    onClick={() => handleDownloadOne(activeAttachment)}
                                                    className={`h-11 px-6 text-white font-bold rounded-xl flex items-center gap-2 shadow-md text-sm transition-all ${
                                                        activeAttachment.isExcel
                                                            ? 'bg-emerald-600 hover:bg-emerald-700'
                                                            : 'bg-[#254153] hover:bg-[#1a2e3b]'
                                                    }`}
                                                >
                                                    <Download className="h-4 w-4" />
                                                    Descargar {activeAttachment.name}
                                                </Button>
                                            </div>
                                        ) : (
                                            <PdfViewerWithZoom
                                                url={previewUrl}
                                                title={activeAttachment?.isPrincipal ? "Vista del Documento Principal" : `Vista de Anexo`}
                                                fileName={activeAttachment?.name || document?.documentInfo?.fileName || "Visualización Directa"}
                                                isLoading={previewLoading}
                                                error={previewError}
                                                onRetry={handlePreview}
                                                isNativeSharePoint={false}
                                                onDownload={handleDownload}
                                            />
                                        )}
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
