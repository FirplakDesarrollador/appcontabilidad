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
    ChevronRight,
    Loader2,
    Plus,
    Trash2,
    Download,
    X
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
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [actionLoading, setActionLoading] = useState<string | null>(null); 
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    const [observaciones, setObservaciones] = useState<string>("");
    const [distribuciones, setDistribuciones] = useState<{ centroCostos: string; cuenta: string; valor: string }[]>([{ centroCostos: "", cuenta: "", valor: "" }]);
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
                            <Button onClick={() => window.location.href = `/externo/pendientes?responsable=${encodeURIComponent(document?.responsableActual || "")}`} className="w-full bg-[#254153] text-white">Ver mis pendientes</Button>
                        </motion.div>
                    </div>
                ) : (
                    <div className="max-w-[1600px] mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-8">
                        <div className="lg:col-span-5 space-y-8">
                            <div className="bg-white rounded-[32px] shadow-xl border border-gray-100 overflow-hidden">
                                <div className="px-8 py-4 bg-[#254153]/5 text-[#254153] text-sm font-bold flex justify-between">
                                    <span>{document?.aprobacionDoliente === 'Aprobado' ? 'APROBADO' : document?.aprobacionDoliente === 'Rechazado' ? 'RECHAZADO' : 'PENDIENTE'}</span>
                                    <button onClick={() => setIsEditingResponsible(true)} className="text-xs underline">Reasignar</button>
                                </div>

                                <AnimatePresence>
                                    {isEditingResponsible && (
                                        <div className="p-8 bg-[#254153] text-white space-y-4">
                                            <div className="flex justify-between items-center text-xs font-black uppercase tracking-widest">
                                                <span>Reasignar Responsable</span>
                                                <button onClick={() => setIsEditingResponsible(false)}><X className="h-4 w-4"/></button>
                                            </div>
                                            <input type="text" placeholder="Escribe nombre..." className="w-full bg-white/10 rounded-2xl py-3 px-4 text-sm" value={userSearchQuery} onChange={(e) => setUserSearchQuery(e.target.value)} />
                                            <div className="max-h-[200px] overflow-y-auto">
                                                {userSearchResults.map(u => (
                                                    <button key={u.id} onClick={() => setPendingResponsibleUser(u)} className="w-full p-3 text-left hover:bg-white/10 text-xs border-b border-white/5">{u.name}</button>
                                                ))}
                                            </div>
                                            {pendingResponsibleUser && (
                                                <Button onClick={handleUpdateResponsible} className="w-full bg-green-500 text-white font-bold h-10 mt-2">Confirmar a {pendingResponsibleUser.name}</Button>
                                            )}
                                        </div>
                                    )}
                                </AnimatePresence>

                                <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Proveedor</p>
                                        <p className="text-lg font-bold text-gray-900 leading-tight">{document?.proveedor}</p>
                                        <p className="text-xs text-gray-500">NIT: {document?.nit}</p>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Valor Total</p>
                                        <input type="text" value={editableTotal} onChange={(e) => setEditableTotal(e.target.value)} className="text-xl font-black text-[#254153] bg-gray-50 rounded-xl px-3 py-1 w-full" />
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Documento</p>
                                        <p className="font-bold text-gray-800">#{document?.nroFactura}</p>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Responsable Actual</p>
                                        <p className="font-bold text-gray-800">{document?.responsableActual}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white rounded-[32px] p-8 space-y-8 shadow-xl border border-gray-100">
                                <div className="space-y-4">
                                    <label className="text-sm font-bold text-[#254153]">¿Tiene anticipo o no el documento?</label>
                                    <div className="grid grid-cols-1 gap-2">
                                        {['Con anticipo', 'Sin anticipo', 'Compra con tarjeta'].map(v => (
                                            <button key={v} onClick={() => setAnticipo(v)} className={`p-4 rounded-xl border-2 text-xs font-bold capitalize transition-all ${anticipo === v ? 'border-[#254153] bg-[#254153]/5' : 'border-gray-50'}`}>{v}</button>
                                        ))}
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <label className="text-sm font-bold text-[#254153]">Observaciones</label>
                                    <textarea value={observaciones} onChange={e => setObservaciones(e.target.value)} className="w-full rounded-2xl border p-4 text-sm h-24" placeholder="Opcional..." />
                                </div>

                                <div className="space-y-4">
                                    <div className="flex justify-between items-center text-sm font-bold">
                                        <span>Distribución Contable</span>
                                        <button onClick={() => setDistribuciones([...distribuciones, { centroCostos: '', cuenta: '', valor: '' }])} className="text-blue-600 text-xs">+ Agregar</button>
                                    </div>
                                    {distribuciones.map((d, i) => (
                                        <div key={i} className="p-4 bg-gray-50 rounded-xl space-y-3 relative">
                                            {distribuciones.length > 1 && <button onClick={() => setDistribuciones(distribuciones.filter((_, idx) => idx !== i))} className="absolute top-2 right-2 text-red-500"><Trash2 size={14}/></button>}
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
                                                value={d.centroCostos}
                                                onChange={val => {
                                                    const copy = [...distribuciones];
                                                    copy[i].centroCostos = val;
                                                    copy[i].cuenta = "";
                                                    setDistribuciones(copy);
                                                }}
                                                placeholder="Centro Costos..."
                                            />
                                            <SearchableSelect
                                                options={(() => {
                                                    const isNoAplica = d.centroCostos?.toLowerCase().includes("no aplica");

                                                    if (isNoAplica) {
                                                        // Mostrar cuentas permitidas para No aplica
                                                        return cuentasList
                                                            .filter((c: any) => 
                                                                c.Título?.startsWith("0") || 
                                                                c.Título?.startsWith("22") ||
                                                                c.Título?.startsWith("1465") ||
                                                                c.Título?.startsWith("1105")
                                                            )
                                                            .map((c: any) => ({
                                                                value: c.Título,
                                                                label: c.Título
                                                            }));
                                                    }

                                                    const selectedCC = centrosCostosList.find(c => `${c.codigo ? c.codigo + ' - ' : ''}${c.Título}` === d.centroCostos);
                                                    const prefix = selectedCC?.cuentas_asociadas?.toString();
                                                    const filtered = prefix 
                                                        ? cuentasList.filter(c => c.Título?.startsWith(prefix))
                                                        : cuentasList;
                                                    
                                                    return filtered.map((c: any) => ({
                                                        value: c.Título,
                                                        label: c.Título
                                                    }));
                                                })()}
                                                value={d.cuenta}
                                                onChange={val => {
                                                    const copy = [...distribuciones];
                                                    copy[i].cuenta = val;
                                                    setDistribuciones(copy);
                                                }}
                                                placeholder="Cuenta..."
                                            />
                                            <div className="relative">
                                                <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                                                <input type="number" value={d.valor} onChange={e => {
                                                    const copy = [...distribuciones];
                                                    copy[i].valor = e.target.value;
                                                    setDistribuciones(copy);
                                                }} className="w-full pl-7 pr-3 py-2 rounded-lg border text-sm" placeholder="Valor..." />
                                            </div>
                                        </div>
                                    ))}
                                    <div className="p-3 bg-gray-100 rounded-lg text-xs font-bold flex justify-between">
                                        <span>TOTAL DISTRIBUIDO:</span>
                                        <span className={parseSafeFloat(distribuciones.reduce((s, d) => s + parseSafeFloat(d.valor), 0)) > parseSafeFloat(editableTotal) + 0.1 ? 'text-red-500' : 'text-green-600'}>
                                            ${distribuciones.reduce((s, d) => s + parseSafeFloat(d.valor), 0).toLocaleString()}
                                        </span>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <Button onClick={() => handleAction('Aprobado')} disabled={!!actionLoading} className="h-14 bg-[#254153] text-white font-black">APROBAR</Button>
                                    <Button onClick={() => handleAction('Rechazado')} variant="outline" disabled={!!actionLoading} className="h-14 border-red-100 text-red-500">RECHAZAR</Button>
                                </div>
                            </div>
                        </div>

                        <div className="lg:col-span-7 h-full">
                            <div className="lg:sticky lg:top-8 bg-white p-6 rounded-[32px] shadow-2xl border border-gray-100 min-h-[700px]">
                                <h4 className="text-sm font-black mb-4 uppercase flex items-center gap-2"><FileText size={16}/> Vista Previa</h4>
                                <div className="bg-gray-50 rounded-2xl h-[700px] overflow-hidden">
                                    {previewLoading ? <Loader2 className="animate-spin mx-auto mt-20" /> : previewUrl ? <iframe src={previewUrl} className="w-full h-full border-0" /> : <div className="p-20 text-center text-gray-400 text-xs">Vista previa no disponible</div>}
                                </div>
                                <Button onClick={handleDownload} className="mt-4 w-full bg-blue-50 text-blue-600 font-bold border-blue-100">Descargar Original</Button>
                            </div>
                        </div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
