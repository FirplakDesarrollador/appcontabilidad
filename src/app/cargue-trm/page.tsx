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

interface EuroData {
    valor: number;
    factorConversion: number;
    fecha: string;
}

export default function CargueTrmPage() {
    const [trmData, setTrmData] = useState<TRMData | null>(null);
    const [euroData, setEuroData] = useState<EuroData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        setIsMounted(true);
    }, []);


    // SAP Session State for multiple DBs
    const [sessions, setSessions] = useState<Record<string, { sessionId: string | null; timeLeft: number; error: string | null; loading: boolean; usd: number | null; eur: number | null; trmLoading: boolean }>>({
        'Firplak_SA': { sessionId: null, timeLeft: 0, error: null, loading: false, usd: null, eur: null, trmLoading: false },
        'DBViventta': { sessionId: null, timeLeft: 0, error: null, loading: false, usd: null, eur: null, trmLoading: false }
    });

    const updateDBState = (db: string, newState: any) => {
        setSessions(prev => ({
            ...prev,
            [db]: { ...prev[db], ...newState }
        }));
    };

    const fetchSapTrm = async (sid: string, db: string) => {
        updateDBState(db, { trmLoading: true });
        try {
            // Fetch USD
            const responseUsd = await fetch('/api/sap-currency-rate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId: sid, currency: 'USD' }),
            });

            const textUsd = await responseUsd.text();
            let dataUsd;
            try { dataUsd = JSON.parse(textUsd); } catch (e) { dataUsd = textUsd; }

            let usdVal: number | null = null;
            if (typeof dataUsd === 'number' || !isNaN(parseFloat(dataUsd))) {
                usdVal = parseFloat(dataUsd);
            } else if (dataUsd && typeof dataUsd === 'object') {
                const val = parseFloat(dataUsd.value || dataUsd.Rate || dataUsd.toString());
                if (!isNaN(val)) usdVal = val;
            }

            // Fetch EUR
            const responseEur = await fetch('/api/sap-currency-rate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId: sid, currency: 'EUR' }),
            });

            const textEur = await responseEur.text();
            let dataEur;
            try { dataEur = JSON.parse(textEur); } catch (e) { dataEur = textEur; }

            let eurVal: number | null = null;
            if (typeof dataEur === 'number' || !isNaN(parseFloat(dataEur))) {
                eurVal = parseFloat(dataEur);
            } else if (dataEur && typeof dataEur === 'object') {
                const val = parseFloat(dataEur.value || dataEur.Rate || dataEur.toString());
                if (!isNaN(val)) eurVal = val;
            }

            updateDBState(db, { usd: usdVal, eur: eurVal });
        } catch (error) {
            console.error(`Failed to fetch SAP rates for ${db}:`, error);
        } finally {
            updateDBState(db, { trmLoading: false });
        }
    };

    const fetchSapSession = async (db: string) => {
        updateDBState(db, { loading: true, error: null });
        try {
            console.log(`Iniciando autenticación con SAP B1 (${db})...`);
            const response = await fetch('/api/sap-login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ companyDB: db })
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.details?.error?.message?.value || errData.error || 'Error de conexión con SAP');
            }

            const data = await response.json();

            if (data.SessionId) {
                const sid = data.SessionId;
                console.log(`%c SAP SESSION ID OBTENIDO (${db}) `, 'background: #254153; color: white; font-weight: bold;', sid);

                // Set countdown timer: use SAP timeout or default to 30 minutes
                const timeoutMinutes = data.SessionTimeout || 30;

                updateDBState(db, {
                    sessionId: sid,
                    timeLeft: timeoutMinutes * 60
                });

                // Immediately fetch the current TRM from SAP using the new token
                fetchSapTrm(sid, db);
            } else {
                updateDBState(db, { error: 'SAP no devolvió un ID de sesión válido.' });
            }
        } catch (error: any) {
            console.error(`Fallo en el login de SAP (${db}):`, error);
            updateDBState(db, { error: error.message || 'Error de comunicación con el servidor' });
        } finally {
            updateDBState(db, { loading: false });
        }
    };

    const fetchTRM = async () => {
        setLoading(true);
        setError(null);
        try {
            // Fetch USD TRM
            const responseUsd = await fetch("https://www.datos.gov.co/resource/32sa-8pi3.json?$limit=1&$order=vigenciadesde DESC");
            if (!responseUsd.ok) throw new Error("Error al obtener la TRM");
            const dataUsd = await responseUsd.json();

            if (dataUsd && dataUsd.length > 0) {
                const usdVal = dataUsd[0];
                setTrmData(usdVal);

                // Fetch USD/EUR Cross Rate
                try {
                    const responseCross = await fetch("https://api.frankfurter.app/latest?from=USD&to=EUR");
                    if (responseCross.ok) {
                        const crossData = await responseCross.json();
                        const eurFactor = crossData.rates.EUR;
                        const copVal = parseFloat(usdVal.valor);
                        // EUR/COP = TRM_USD * (1 / factor_USD_EUR)
                        // Actually frankfurter gives USD as base: 1 USD = X EUR.
                        // So 1 EUR = 1/X USD.
                        // 1 EUR = (1/X) * TRM_USD COP.
                        const eurCop = copVal / eurFactor;

                        setEuroData({
                            valor: eurCop,
                            factorConversion: eurFactor,
                            fecha: crossData.date
                        });
                    }
                } catch (err) {
                    console.error("Cross rate error:", err);
                }
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
        fetchSapSession('Firplak_SA');
        fetchSapSession('DBViventta');
    }, []);

    // Countdown Timer Effect
    useEffect(() => {
        const timer = setInterval(() => {
            setSessions(prev => {
                const updated = { ...prev };
                let hashChange = false;
                Object.keys(updated).forEach(db => {
                    if (updated[db].timeLeft > 0) {
                        updated[db] = { ...updated[db], timeLeft: updated[db].timeLeft - 1 };
                        hashChange = true;
                        if (updated[db].timeLeft === 0 && updated[db].sessionId) {
                            fetchSapSession(db);
                        }
                    }
                });
                return hashChange ? updated : prev;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, []);

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
        if (!trmData) return;

        setIsSyncing(true);
        setSyncResult(null);

        try {
            const databases = Object.keys(sessions);
            const syncResults = [];

            for (const db of databases) {
                const { sessionId } = sessions[db];
                if (!sessionId) {
                    syncResults.push({ db, success: false, message: 'Sin sesión' });
                    continue;
                }

                // Sincronizar USD
                const responseUsd = await fetch('/api/sap-set-currency-rate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        sessionId,
                        rate: trmData.valor,
                        currency: 'USD'
                    }),
                });

                // Sincronizar EUR si existe
                let eurSuccess = true;
                if (euroData) {
                    const responseEur = await fetch('/api/sap-set-currency-rate', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            sessionId,
                            rate: euroData.valor.toFixed(2),
                            currency: 'EUR'
                        }),
                    });
                    if (!responseEur.ok) eurSuccess = false;
                }

                if (responseUsd.ok && eurSuccess) {
                    syncResults.push({ db, success: true });
                    fetchSapTrm(sessionId, db);
                } else {
                    syncResults.push({ db, success: false, message: !responseUsd.ok ? 'Error USD' : 'Error EUR' });
                }
            }

            const allSuccess = syncResults.every(r => r.success);
            setSyncResult({
                success: allSuccess,
                message: allSuccess
                    ? 'TRM sincronizadas en todas las bases de datos'
                    : `Errores: ${syncResults.filter(r => !r.success).map(r => `${r.db}: ${r.message}`).join(', ')}`
            });

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
                                    <p className="text-gray-500 mt-1">Sincronización manual de tasas de cambio con SAP (Firplak y Viventta).</p>
                                </div>

                                {/* SAP Sessions Info Boxes */}
                                <div className="flex flex-wrap gap-4">
                                    {Object.entries(sessions).map(([db, state]) => (
                                        <div key={db} className="bg-white border-2 border-[#254153]/20 rounded-2xl p-4 shadow-md min-w-[320px] transition-all duration-500">
                                            <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-100">
                                                <div className="flex items-center gap-2">
                                                    <div className={`h-3 w-3 rounded-full ${state.sessionId ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : state.error ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]' : 'bg-amber-400 animate-pulse'}`} />
                                                    <span className="text-[10px] font-black text-[#254153] uppercase tracking-wider">Conexión SAP: {db}</span>
                                                </div>
                                                {state.loading && <RefreshCw className="h-4 w-4 animate-spin text-[#254153]" />}
                                            </div>

                                            {state.sessionId ? (
                                                <div className="space-y-3">
                                                    <div className="bg-gray-50 p-3 rounded-xl border border-gray-100 relative group/sid">
                                                        <p className="text-[9px] text-gray-400 uppercase font-bold mb-1 tracking-widest flex justify-between">
                                                            TOKEN:
                                                            <span className="text-[8px] text-green-600">ACTIVO</span>
                                                        </p>
                                                        <p className="text-[10px] font-mono font-black text-[#254153] break-all line-clamp-1">
                                                            {state.sessionId}
                                                        </p>
                                                        <div className="absolute top-2 right-2 opacity-0 group-hover/sid:opacity-100 transition-opacity">
                                                            <button
                                                                onClick={() => navigator.clipboard.writeText(state.sessionId!)}
                                                                className="p-1 hover:bg-gray-200 rounded text-[8px] font-black uppercase text-gray-500"
                                                            >
                                                                Copiar
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center justify-between px-2 py-2 bg-[#254153]/5 rounded-lg border border-[#254153]/10">
                                                        <div className="flex flex-col">
                                                            <span className="text-[9px] text-gray-400 font-black uppercase tracking-tight">Expira en:</span>
                                                            <div className="flex items-center gap-1">
                                                                <span className={`text-lg font-mono font-black ${state.timeLeft < 300 ? 'text-red-500 animate-pulse' : 'text-[#254153]'}`}>
                                                                    {formatTime(state.timeLeft)}
                                                                </span>
                                                                <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                                                            </div>
                                                        </div>
                                                        <button
                                                            onClick={() => fetchSapSession(db)}
                                                            className="p-2 hover:bg-[#254153]/10 rounded-full transition-colors"
                                                            title="Renovar Token"
                                                        >
                                                            <RefreshCw className="h-4 w-4 text-[#254153]" />
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className={`${state.error ? 'bg-red-50 border-red-100' : 'bg-gray-50 border-gray-100'} p-4 rounded-xl border-2 border-dashed`}>
                                                    <div className="flex items-center flex-col text-center gap-3">
                                                        <div className={`p-2 rounded-lg ${state.error ? 'bg-red-100 text-red-600' : 'bg-gray-200 text-gray-400'}`}>
                                                            <RefreshCw className={`h-5 w-5 ${state.loading ? 'animate-spin' : ''}`} />
                                                        </div>
                                                        <div>
                                                            <p className={`text-xs font-bold ${state.error ? 'text-red-700' : 'text-gray-500'}`}>
                                                                {state.loading ? 'Conectando...' : state.error ? 'Error' : 'Desconectado'}
                                                            </p>
                                                            {state.error && <p className="text-[10px] text-red-600/70 mt-1 max-w-[200px] line-clamp-1">{state.error}</p>}
                                                        </div>
                                                        {!state.loading && (
                                                            <Button
                                                                onClick={() => fetchSapSession(db)}
                                                                className="h-8 px-4 text-[9px] font-black uppercase rounded-lg shadow-sm"
                                                            >
                                                                Conectar
                                                            </Button>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>

                                <div className="bg-[#254153]/10 p-4 rounded-2xl self-start md:self-center">
                                    <RefreshCw
                                        className={`h-8 w-8 text-[#254153] cursor-pointer transition-transform duration-500 ${loading ? 'animate-spin' : 'hover:rotate-180'}`}
                                        onClick={fetchTRM}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* TRM Cards Section */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* SFC TRM Card (USD) */}
                        <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100 flex flex-col relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-4 opacity-5">
                                <Landmark className="h-24 w-24" />
                            </div>
                            <div className="flex items-center gap-3 mb-6">
                                <div className="p-2 bg-blue-50 rounded-lg">
                                    <TrendingUp className="h-5 w-5 text-blue-600" />
                                </div>
                                <h2 className="text-lg font-semibold text-[#254153]">TRM Oficial USD (SFC)</h2>
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

                        {/* SAP TRM Section */}
                        <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4 bg-[#254153]/5 p-4 rounded-[2rem] border border-[#254153]/10">
                            {Object.entries(sessions).map(([db, state]) => (
                                <div key={db} className="bg-[#254153] rounded-3xl p-6 shadow-lg border border-[#254153]/50 flex flex-col relative overflow-hidden text-white group">
                                    <div className="absolute top-0 right-0 p-4 opacity-10 transition-transform group-hover:rotate-45 duration-700">
                                        <RefreshCw className="h-16 w-16" />
                                    </div>
                                    <div className="flex items-center justify-between mb-4 relative z-10">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-white/10 rounded-lg">
                                                <Landmark className="h-4 w-4 text-blue-300" />
                                            </div>
                                            <h2 className="text-sm font-black uppercase tracking-widest">{db}</h2>
                                        </div>
                                        {state.sessionId && !state.trmLoading && (
                                            <button
                                                onClick={() => fetchSapTrm(state.sessionId!, db)}
                                                className="p-2 hover:bg-white/10 rounded-full transition-colors"
                                                title="Recargar desde SAP"
                                            >
                                                <RefreshCw className="h-3 w-3" />
                                            </button>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-2 gap-4 relative z-10">
                                        <div className="space-y-1">
                                            <p className="text-[10px] font-black text-blue-300/60 uppercase">USD en SAP</p>
                                            {state.trmLoading ? (
                                                <div className="h-6 w-20 bg-white/10 animate-pulse rounded" />
                                            ) : (
                                                <p className="text-xl font-black">{state.usd ? formatCurrency(state.usd.toString()) : "$0,00"}</p>
                                            )}
                                        </div>
                                        <div className="space-y-1 text-right">
                                            <p className="text-[10px] font-black text-purple-300/60 uppercase">EUR en SAP</p>
                                            {state.trmLoading ? (
                                                <div className="h-6 w-20 bg-white/10 animate-pulse rounded ml-auto" />
                                            ) : (
                                                <p className="text-xl font-black">{state.eur ? formatCurrency(state.eur.toString()) : "$0,00"}</p>
                                            )}
                                        </div>
                                    </div>

                                    <div className="mt-4 flex items-center gap-2">
                                        <div className={`h-1.5 w-1.5 rounded-full ${state.sessionId ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
                                        <span className="text-[9px] font-black uppercase tracking-tighter opacity-70">
                                            {state.sessionId ? 'Sesión Activa' : 'Sin Sesión'}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Calculated Euro Card */}
                        <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100 flex flex-col relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-4 opacity-5">
                                <TrendingUp className="h-24 w-24" />
                            </div>
                            <div className="flex items-center gap-3 mb-6">
                                <div className="p-2 bg-purple-50 rounded-lg">
                                    <TrendingUp className="h-5 w-5 text-purple-600" />
                                </div>
                                <h2 className="text-lg font-semibold text-[#254153]">Euro Calculado</h2>
                            </div>

                            {loading ? (
                                <div className="flex flex-col gap-2 animate-pulse">
                                    <div className="h-10 w-32 bg-gray-100 rounded-lg"></div>
                                    <div className="h-4 w-48 bg-gray-50 rounded"></div>
                                </div>
                            ) : error ? (
                                <div className="text-red-500 text-sm">Error al calcular Euro</div>
                            ) : (
                                <div className="space-y-4">
                                    <div>
                                        <p className="text-4xl font-bold text-[#254153]">
                                            {euroData ? formatCurrency(euroData.valor.toString()) : "$0,00"}
                                        </p>
                                        <div className="flex flex-col gap-1 mt-2 text-gray-500 text-xs">
                                            <div className="flex items-center gap-2">
                                                <RefreshCw className="h-3 w-3" />
                                                <span>Factor: 1 USD = {euroData?.factorConversion.toFixed(4)} EUR</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Calendar className="h-3 w-3" />
                                                <span>Fecha Factor: {euroData?.fecha || '---'}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-purple-50 text-purple-700 rounded-full text-xs font-medium">
                                        Cálculo USD * (1/Factor)
                                    </div>
                                </div>
                            )}
                        </div>

                    </div>

                    {/* Action Button */}
                    <div className="flex flex-col items-center gap-4 py-4">
                        <Button
                            className={`px-8 py-6 rounded-2xl flex items-center gap-3 text-lg transition-all shadow-xl disabled:opacity-50 ${syncResult?.success
                                ? 'bg-green-600 hover:bg-green-700'
                                : 'bg-[#254153] hover:bg-[#1a2e3b]'
                                }`}
                            disabled={loading || !!error || isSyncing || !Object.values(sessions).some(s => s.sessionId)}
                            onClick={handleSyncToSAP}
                            isLoading={isSyncing}
                        >
                            <RefreshCw className={`h-5 w-5 ${isSyncing ? 'animate-spin' : ''}`} />
                            {syncResult?.success ? '¡Sincronizado!' : 'Sincronizar en Firplak y Viventta'}
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
