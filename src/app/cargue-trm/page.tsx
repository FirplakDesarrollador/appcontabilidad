"use client";

import { Sidebar } from "@/components/layout/Sidebar";
import { Button } from "@/components/ui/Button";
import { RefreshCw, ArrowLeft, TrendingUp, Landmark, Calendar, AlertCircle } from "lucide-react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useState, useEffect } from "react";

interface TRMData {
    valor: string;
    unidad: string;
    vigenciadesde: string;
    vigenciahasta: string;
}

export default function CargueTrmPage() {
    const [trmData, setTrmData] = useState<TRMData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        setIsMounted(true);
    }, []);


    // SAP Session State
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [timeLeft, setTimeLeft] = useState<number>(0); // in seconds
    const [isSapLoading, setIsSapLoading] = useState(false);
    const [sapError, setSapError] = useState<string | null>(null);
    const [sapTrm, setSapTrm] = useState<number | null>(null);
    const [isSapTrmLoading, setIsSapTrmLoading] = useState(false);

    const fetchSapTrm = async (sid: string) => {
        setIsSapTrmLoading(true);
        try {
            const response = await fetch('/api/sap-currency-rate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId: sid }),
            });

            // Handle if the response is a raw number (not strict JSON)
            const text = await response.text();
            let data;
            try {
                data = JSON.parse(text);
            } catch (e) {
                // If parsing fails, use the raw text if it's a number
                data = text;
            }

            // SAP Returns a raw number or an object depending on the version
            if (typeof data === 'number' || !isNaN(parseFloat(data))) {
                setSapTrm(parseFloat(data));
            } else if (data && typeof data === 'object') {
                // If it's the raw value from Service Layer
                const val = parseFloat(data.value || data.Rate || data.toString());
                if (!isNaN(val)) setSapTrm(val);
            }
        } catch (error) {
            console.error('Failed to fetch SAP TRM:', error);
        } finally {
            setIsSapTrmLoading(false);
        }
    };

    const fetchSapSession = async () => {
        setIsSapLoading(true);
        setSapError(null);
        try {
            console.log('Iniciando autenticación con SAP B1...');
            const response = await fetch('/api/sap-login', { method: 'POST' });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.details?.error?.message?.value || errData.error || 'Error de conexión con SAP');
            }

            const data = await response.json();

            if (data.SessionId) {
                const sid = data.SessionId;
                console.log('%c SAP SESSION ID OBTENIDO ', 'background: #254153; color: white; font-weight: bold;', sid);

                setSessionId(sid);
                // Set countdown timer: use SAP timeout or default to 30 minutes
                const timeoutMinutes = data.SessionTimeout || 30;
                setTimeLeft(timeoutMinutes * 60);

                // Immediately fetch the current TRM from SAP using the new token
                fetchSapTrm(sid);
            } else {
                setSapError('SAP no devolvió un ID de sesión válido.');
            }
        } catch (error: any) {
            console.error('Fallo en el login de SAP:', error);
            setSapError(error.message || 'Error de comunicación con el servidor');
        } finally {
            setIsSapLoading(false);
        }
    };

    const fetchTRM = async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch("https://www.datos.gov.co/resource/32sa-8pi3.json?$limit=1&$order=vigenciadesde DESC");
            if (!response.ok) throw new Error("Error al obtener la TRM");
            const data = await response.json();
            if (data && data.length > 0) {
                setTrmData(data[0]);
            }
        } catch (err) {
            console.error("Fetch error:", err);
            setError("No se pudo cargar la TRM actual.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTRM();
        fetchSapSession();
    }, []);

    // Countdown Timer Effect
    useEffect(() => {
        if (timeLeft <= 0) {
            if (sessionId) {
                fetchSapSession();
            }
            return;
        }

        const timer = setInterval(() => {
            setTimeLeft((prev) => prev - 1);
        }, 1000);

        return () => clearInterval(timer);
    }, [timeLeft, sessionId]);

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const formatCurrency = (value: string) => {
        return new Intl.NumberFormat('es-CO', {
            style: 'currency',
            currency: 'COP',
            minimumFractionDigits: 2
        }).format(parseFloat(value));
    };

    const [isSyncing, setIsSyncing] = useState(false);
    const [syncResult, setSyncResult] = useState<{ success: boolean; message: string } | null>(null);

    const handleSyncToSAP = async () => {
        if (!sessionId || !trmData) return;

        setIsSyncing(true);
        setSyncResult(null);

        try {
            const response = await fetch('/api/sap-set-currency-rate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId,
                    rate: trmData.valor
                }),
            });

            const data = await response.json();

            if (response.ok) {
                setSyncResult({ success: true, message: 'TRM sincronizada correctamente en SAP' });
                // Refresh SAP TRM after sync
                fetchSapTrm(sessionId);
            } else {
                setSyncResult({
                    success: false,
                    message: data.details?.error?.message?.value || data.error || 'Error al sincronizar'
                });
            }
        } catch (error: any) {
            setSyncResult({ success: false, message: 'Error de conexión' });
        } finally {
            setIsSyncing(false);
        }
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('es-CO', {
            day: '2-digit',
            month: 'long',
            year: 'numeric'
        });
    };

    if (!isMounted) return null;

    return (
        <div className="flex h-screen bg-[#f8fafc]">
            <Sidebar />

            <main className="flex-1 md:ml-64 p-8 overflow-y-auto">
                <div className="max-w-4xl mx-auto space-y-8">
                    {/* Header */}
                    <div className="flex flex-col gap-6">
                        <Link
                            href="/"
                            className="flex items-center gap-2 text-sm text-gray-500 hover:text-[#254153] transition-colors w-fit"
                        >
                            <ArrowLeft className="h-4 w-4" />
                            Volver al Dashboard
                        </Link>

                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                            <div className="space-y-6">
                                <div>
                                    <h1 className="text-3xl font-bold text-[#254153]">Cargue de TRM en SAP</h1>
                                    <p className="text-gray-500 mt-1">Sincronización manual de tasas de cambio con SAP Business One.</p>
                                </div>

                                {/* SAP Session Info Box */}
                                <div className="bg-white border-2 border-[#254153]/20 rounded-2xl p-4 shadow-md min-w-[320px] w-full md:w-fit transition-all duration-500">
                                    <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-100">
                                        <div className="flex items-center gap-2">
                                            <div className={`h-3 w-3 rounded-full ${sessionId ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : sapError ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]' : 'bg-amber-400 animate-pulse'}`} />
                                            <span className="text-[10px] font-black text-[#254153] uppercase tracking-wider">Estado de Conexión SAP</span>
                                        </div>
                                        {isSapLoading && <RefreshCw className="h-4 w-4 animate-spin text-[#254153]" />}
                                    </div>

                                    {sessionId ? (
                                        <div className="space-y-3">
                                            <div className="bg-gray-50 p-3 rounded-xl border border-gray-100 relative group/sid">
                                                <p className="text-[9px] text-gray-400 uppercase font-bold mb-1 tracking-widest flex justify-between">
                                                    TOKEN (SessionId):
                                                    <span className="text-[8px] text-green-600">ACTIVO</span>
                                                </p>
                                                <p className="text-xs font-mono font-black text-[#254153] break-all">
                                                    {sessionId}
                                                </p>
                                                <div className="absolute top-2 right-2 opacity-0 group-hover/sid:opacity-100 transition-opacity">
                                                    <button
                                                        onClick={() => navigator.clipboard.writeText(sessionId)}
                                                        className="p-1 hover:bg-gray-200 rounded text-[8px] font-black uppercase text-gray-500"
                                                    >
                                                        Copiar
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="flex items-center justify-between px-2 py-2 bg-[#254153]/5 rounded-lg border border-[#254153]/10">
                                                <div className="flex flex-col">
                                                    <span className="text-[9px] text-gray-400 font-black uppercase tracking-tight">Expira en (30 min):</span>
                                                    <div className="flex items-center gap-1">
                                                        <span className={`text-lg font-mono font-black ${timeLeft < 300 ? 'text-red-500 animate-pulse' : 'text-[#254153]'}`}>
                                                            {formatTime(timeLeft)}
                                                        </span>
                                                        <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={fetchSapSession}
                                                    className="p-2 hover:bg-[#254153]/10 rounded-full transition-colors"
                                                    title="Renovar Token"
                                                >
                                                    <RefreshCw className="h-4 w-4 text-[#254153]" />
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className={`${sapError ? 'bg-red-50 border-red-100' : 'bg-gray-50 border-gray-100'} p-4 rounded-xl border-2 border-dashed`}>
                                            <div className="flex items-center flex-col text-center gap-3">
                                                <div className={`p-2 rounded-lg ${sapError ? 'bg-red-100 text-red-600' : 'bg-gray-200 text-gray-400'}`}>
                                                    <RefreshCw className={`h-5 w-5 ${isSapLoading ? 'animate-spin' : ''}`} />
                                                </div>
                                                <div>
                                                    <p className={`text-xs font-bold ${sapError ? 'text-red-700' : 'text-gray-500'}`}>
                                                        {isSapLoading ? 'Estableciendo conexión...' : sapError ? 'Error en Sesión SAP' : 'Sesión Desconectada'}
                                                    </p>
                                                    {sapError && <p className="text-[10px] text-red-600/70 mt-1 max-w-[200px] line-clamp-2">{sapError}</p>}
                                                </div>
                                                {!isSapLoading && (
                                                    <Button
                                                        onClick={fetchSapSession}
                                                        className="h-9 px-4 text-[10px] font-black uppercase rounded-lg shadow-sm"
                                                    >
                                                        Obtener Token (30 min)
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="bg-[#254153]/10 p-4 rounded-2xl self-start md:self-center">
                                <RefreshCw
                                    className={`h-8 w-8 text-[#254153] cursor-pointer transition-transform duration-500 ${loading ? 'animate-spin' : 'hover:rotate-180'}`}
                                    onClick={fetchTRM}
                                />
                            </div>
                        </div>
                    </div>

                    {/* TRM Cards Section */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* SFC TRM Card */}
                        <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100 flex flex-col relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-4 opacity-5">
                                <Landmark className="h-24 w-24" />
                            </div>
                            <div className="flex items-center gap-3 mb-6">
                                <div className="p-2 bg-blue-50 rounded-lg">
                                    <TrendingUp className="h-5 w-5 text-blue-600" />
                                </div>
                                <h2 className="text-lg font-semibold text-[#254153]">TRM Oficial (SFC)</h2>
                            </div>

                            {loading ? (
                                <div className="flex flex-col gap-2 animate-pulse">
                                    <div className="h-10 w-32 bg-gray-100 rounded-lg"></div>
                                    <div className="h-4 w-48 bg-gray-50 rounded"></div>
                                </div>
                            ) : error ? (
                                <div className="flex flex-col gap-2 text-red-500">
                                    <div className="flex items-center gap-2">
                                        <AlertCircle className="h-4 w-4" />
                                        <p className="text-sm">{error}</p>
                                    </div>
                                    <button onClick={fetchTRM} className="text-xs underline text-left">Reintentar</button>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div>
                                        <p className="text-4xl font-bold text-[#254153]">
                                            {trmData ? formatCurrency(trmData.valor) : "$0,00"}
                                        </p>
                                        <div className="flex items-center gap-2 mt-2 text-gray-500 text-sm">
                                            <Calendar className="h-4 w-4" />
                                            <span>Vigencia: {trmData ? formatDate(trmData.vigenciadesde) : "---"}</span>
                                        </div>
                                    </div>
                                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-green-50 text-green-700 rounded-full text-xs font-medium">
                                        Sincronizado con SFC
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* SAP TRM Card */}
                        <div className="bg-[#254153] rounded-3xl p-8 shadow-lg border border-[#254153]/50 flex flex-col relative overflow-hidden text-white group">
                            <div className="absolute top-0 right-0 p-4 opacity-10 transition-transform group-hover:rotate-45 duration-700">
                                <RefreshCw className="h-24 w-24" />
                            </div>
                            <div className="flex items-center justify-between mb-6 relative z-10">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-white/10 rounded-lg">
                                        <Landmark className="h-5 w-5 text-blue-300" />
                                    </div>
                                    <h2 className="text-lg font-semibold uppercase tracking-tight">TRM en SAP</h2>
                                </div>
                                {sessionId && !isSapTrmLoading && (
                                    <button
                                        onClick={() => fetchSapTrm(sessionId)}
                                        className="p-2 hover:bg-white/10 rounded-full transition-colors"
                                        title="Recargar desde SAP"
                                    >
                                        <RefreshCw className="h-4 w-4" />
                                    </button>
                                )}
                            </div>

                            <div className="space-y-4 relative z-10">
                                <div>
                                    {isSapTrmLoading ? (
                                        <div className="flex flex-col gap-2 animate-pulse">
                                            <div className="h-10 w-32 bg-white/10 rounded-lg"></div>
                                            <div className="h-4 w-48 bg-white/5 rounded"></div>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="flex items-baseline gap-1">
                                                <p className="text-4xl font-black text-white">
                                                    {sapTrm ? formatCurrency(sapTrm.toString()) : "$0,00"}
                                                </p>
                                                {!sapTrm && !isSapTrmLoading && sessionId && (
                                                    <span className="text-xs text-blue-300 animate-pulse">Sin datos</span>
                                                )}
                                            </div>
                                            <p className="text-blue-200/60 text-[10px] font-bold uppercase tracking-widest mt-2">{sapTrm ? 'Valor actual configurado en SAP' : 'Consultando tablas de SAP...'}</p>
                                        </>
                                    )}
                                </div>
                                <div className={`inline-flex items-center gap-2 px-3 py-1.5 ${sessionId ? 'bg-green-500/20 text-green-300 border border-green-500/30' : 'bg-white/5 text-blue-200 border border-white/10'} rounded-full text-[10px] font-black uppercase tracking-tighter`}>
                                    <div className={`h-1.5 w-1.5 rounded-full ${sessionId ? 'bg-green-400 animate-pulse' : 'bg-blue-300'}`} />
                                    {sessionId ? (isSapTrmLoading ? 'Leyendo datos SAP...' : 'Canal SAP Conectado') : 'Esperando sesión SAP...'}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Action Button */}
                    <div className="flex flex-col items-center gap-4 py-4">
                        <Button
                            className={`px-8 py-6 rounded-2xl flex items-center gap-3 text-lg transition-all shadow-xl disabled:opacity-50 ${syncResult?.success
                                ? 'bg-green-600 hover:bg-green-700'
                                : 'bg-[#254153] hover:bg-[#1a2e3b]'
                                }`}
                            disabled={loading || !!error || isSyncing || !sessionId}
                            onClick={handleSyncToSAP}
                            isLoading={isSyncing}
                        >
                            <RefreshCw className={`h-5 w-5 ${isSyncing ? 'animate-spin' : ''}`} />
                            {syncResult?.success ? '¡Sincronizado!' : 'Sincronizar ahora hacia SAP'}
                        </Button>

                        {syncResult && (
                            <motion.div
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold ${syncResult.success
                                    ? 'bg-green-50 text-green-700 border border-green-100'
                                    : 'bg-red-50 text-red-700 border border-red-100'
                                    }`}
                            >
                                {syncResult.success ? (
                                    <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                                ) : (
                                    <AlertCircle className="h-4 w-4" />
                                )}
                                {syncResult.message}
                            </motion.div>
                        )}
                    </div>

                    {/* Features List */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {[
                            { title: "Sincronización diaria", desc: "Obtención automática de la TRM del Banco de la República." },
                            { title: "Cálculo de EUR", desc: "Cálculo automático de la tasa EUR basada en la TRM del día." },
                            { title: "Inserción en SAP", desc: "Conexión directa con SAP B1 para actualización de tablas." }
                        ].map((feature, i) => (
                            <div key={i} className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                                <h3 className="font-semibold text-[#254153] mb-2">{feature.title}</h3>
                                <p className="text-sm text-gray-500 leading-relaxed">{feature.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </main>
        </div>
    );
}
