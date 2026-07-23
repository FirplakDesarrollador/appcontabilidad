"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { User } from "@supabase/supabase-js";
import { motion } from "framer-motion";
import { Sidebar } from "@/components/layout/Sidebar";
import { Button } from "@/components/ui/Button";
import {
    Menu,
    Search,
    Bell,
    FileText,
    FileCheck,
    Ship,
    Briefcase,
    Clock,
    CheckCircle2,
    BarChart3,
    AlertCircle
} from "lucide-react";
import { useSidebar } from "@/context/SidebarContext";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer
} from 'recharts';

export default function DashboardPage() {
    const { toggleSidebar } = useSidebar();
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState<User | null>(null);
    const [stats, setStats] = useState<any[]>([]);
    const [porAprobarPersonas, setPorAprobarPersonas] = useState<any[]>([]);
    const [totals, setTotals] = useState({ porAprobar: 0, porProcesar: 0 });
    const [statsLoading, setStatsLoading] = useState(true);
    
    const [history, setHistory] = useState<any[]>([]);
    const [historyLoading, setHistoryLoading] = useState(true);
    
    const currentDate = new Date();
    const [selectedMonth, setSelectedMonth] = useState(currentDate.getMonth() + 1);
    const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear());

    const fetchHistory = async () => {
        try {
            setHistoryLoading(true);
            const response = await fetch('/api/dashboard-history');
            const data = await response.json();
            if (data.success) {
                setHistory(data.history);
            }
        } catch (error) {
            console.error('Error fetching dashboard history:', error);
        } finally {
            setHistoryLoading(false);
        }
    };

    const fetchStats = async () => {
        try {
            setStatsLoading(true);
            const response = await fetch('/api/dashboard-stats');
            const data = await response.json();
            if (data.success) {
                setStats(data.data);
                setTotals(data.totals);
                setPorAprobarPersonas(data.porAprobarPorPersona || []);
            }
        } catch (error) {
            console.error('Error fetching dashboard stats:', error);
        } finally {
            setStatsLoading(false);
        }
    };

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
                    setLoading(false);
                    fetchStats();
                    fetchHistory();
                }
            } catch (err) {
                console.error("Error inesperado en checkUser:", err);
                router.push("/login");
            }
        };

        checkUser();
    }, [router]);

    if (loading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-[#f8fafc]">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#254153] border-t-transparent" />
            </div>
        );
    }

    // Mapping icons to modules
    const getModuleIcon = (moduleName: string) => {
        switch (moduleName) {
            case 'Aprobación de facturas': return FileCheck;
            case 'Aprobación de documentos': return FileText;
            case 'Radicados de importación': return Ship;
            case 'Facturas Viventta': return Briefcase;
            default: return BarChart3;
        }
    };

    return (
        <div className="min-h-screen bg-[#f8fafc] flex">
            {/* Sidebar */}
            <Sidebar />

            {/* Main Content */}
            <main 
                className="flex-1 relative bg-[#f8fafc] transition-all duration-300 ease-in-out h-screen overflow-y-auto"
                style={{ marginLeft: 'var(--sidebar-width, 256px)' }}
            >
                {/* Topbar */}
                <header className="h-20 bg-white/80 backdrop-blur-xl border-b border-gray-100 flex items-center justify-between px-6 sticky top-0 z-20">
                    <div className="flex items-center gap-4">
                        <button 
                            onClick={toggleSidebar}
                            className="p-2 hover:bg-gray-100 rounded-xl transition-colors text-[#254153]"
                        >
                            <Menu className="h-6 w-6" />
                        </button>
                        <div className="font-semibold text-gray-800 text-lg">Dashboard General</div>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="relative hidden md:block">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Buscar..."
                                className="h-10 pl-10 pr-4 rounded-full bg-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-[#254153]/20 w-64"
                            />
                        </div>
                        <button className="h-10 w-10 flex items-center justify-center rounded-full hover:bg-gray-100 relative">
                            <Bell className="h-5 w-5 text-gray-600" />
                            <span className="absolute top-2 right-2 h-2.5 w-2.5 bg-red-500 rounded-full border-2 border-white"></span>
                        </button>
                        <button className="md:hidden">
                            <Menu className="h-6 w-6 text-gray-600" />
                        </button>
                    </div>
                </header>

                {/* Dashboard Content */}
                <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-8">

                    {/* Welcome Section */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4"
                    >
                        <div>
                            <h1 className="text-3xl font-extrabold text-[#254153]">Resumen Operativo</h1>
                            <p className="text-gray-500 mt-1 font-medium">Visualiza el estado de las facturas y documentos pendientes.</p>
                        </div>
                        <div className="flex gap-2">
                            <Button variant="outline" className="bg-white border-gray-200" onClick={fetchStats}>
                                Actualizar Datos
                            </Button>
                        </div>
                    </motion.div>

                    {/* Global Stats Summary */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.1 }}
                            className="bg-gradient-to-br from-amber-50 to-orange-50 p-6 rounded-2xl shadow-sm border border-orange-100 flex items-center justify-between"
                        >
                            <div>
                                <p className="text-orange-600 font-bold text-sm tracking-wide uppercase mb-1">Total por Aprobar</p>
                                <h3 className="text-4xl font-extrabold text-orange-700">
                                    {statsLoading ? <span className="animate-pulse">...</span> : totals.porAprobar}
                                </h3>
                                <p className="text-orange-600/70 text-xs font-medium mt-2">Documentos esperando revisión del doliente</p>
                            </div>
                            <div className="h-16 w-16 bg-white/60 rounded-full flex items-center justify-center shadow-sm">
                                <Clock className="h-8 w-8 text-orange-500" />
                            </div>
                        </motion.div>
                        
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.2 }}
                            className="bg-gradient-to-br from-blue-50 to-indigo-50 p-6 rounded-2xl shadow-sm border border-blue-100 flex items-center justify-between"
                        >
                            <div>
                                <p className="text-blue-600 font-bold text-sm tracking-wide uppercase mb-1">Total por Procesar</p>
                                <h3 className="text-4xl font-extrabold text-blue-700">
                                    {statsLoading ? <span className="animate-pulse">...</span> : totals.porProcesar}
                                </h3>
                                <p className="text-blue-600/70 text-xs font-medium mt-2">Documentos listos para contabilidad o SAP</p>
                            </div>
                            <div className="h-16 w-16 bg-white/60 rounded-full flex items-center justify-center shadow-sm">
                                <CheckCircle2 className="h-8 w-8 text-blue-500" />
                            </div>
                        </motion.div>
                    </div>

                    {/* Module Cards */}
                    <div>
                        <h3 className="text-lg font-bold text-[#254153] mb-4">Carga Operativa por Módulo</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                            {statsLoading ? (
                                [1, 2, 3, 4].map(i => (
                                    <div key={i} className="h-40 bg-white rounded-2xl shadow-sm border border-gray-100 animate-pulse" />
                                ))
                            ) : (
                                stats.map((stat, i) => {
                                    const Icon = getModuleIcon(stat.module);
                                    return (
                                        <motion.div
                                            key={stat.module}
                                            initial={{ opacity: 0, y: 20 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: 0.3 + (i * 0.1) }}
                                            className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow relative overflow-hidden group"
                                        >
                                            <div className="flex justify-between items-start mb-4">
                                                <div className="bg-[#254153]/5 p-3 rounded-xl group-hover:bg-[#254153]/10 transition-colors">
                                                    <Icon className="h-6 w-6 text-[#254153]" />
                                                </div>
                                            </div>
                                            <h3 className="text-gray-800 text-sm font-bold mb-4 line-clamp-1">{stat.module}</h3>
                                            
                                            <div className="space-y-3">
                                                <div className="flex justify-between items-center bg-orange-50/50 px-3 py-2 rounded-lg border border-orange-100/50">
                                                    <span className="text-xs font-medium text-orange-700">Por Aprobar</span>
                                                    <span className="text-sm font-bold text-orange-700">{stat.porAprobar}</span>
                                                </div>
                                                <div className="flex justify-between items-center bg-blue-50/50 px-3 py-2 rounded-lg border border-blue-100/50">
                                                    <span className="text-xs font-medium text-blue-700">Por Procesar</span>
                                                    <span className="text-sm font-bold text-blue-700">{stat.porProcesar}</span>
                                                </div>
                                                <div className="flex justify-between items-center bg-red-50/50 px-3 py-2 rounded-lg border border-red-100/50">
                                                    <span className="text-xs font-medium text-red-700 flex items-center gap-1">
                                                        <AlertCircle className="h-3 w-3" />
                                                        +2 Días (Vencidas)
                                                    </span>
                                                    <span className="text-sm font-bold text-red-700">{stat.vencidas || 0}</span>
                                                </div>
                                            </div>
                                        </motion.div>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    {/* Charts Section */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Chart 1: Distribución de Tareas */}
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-lg font-bold text-[#254153]">Distribución de Tareas</h3>
                            </div>
                            <div className="h-[300px] w-full">
                                {statsLoading ? (
                                    <div className="h-full w-full bg-gray-50 rounded-xl animate-pulse" />
                                ) : (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart
                                            data={stats}
                                            margin={{ top: 20, right: 30, left: 0, bottom: 5 }}
                                            barGap={8}
                                        >
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                            <XAxis 
                                                dataKey="module" 
                                                axisLine={false} 
                                                tickLine={false} 
                                                tick={{ fill: '#6B7280', fontSize: 12, fontWeight: 500 }}
                                                tickFormatter={(value) => {
                                                    if (value.includes('facturas')) return 'Facturas';
                                                    if (value.includes('documentos')) return 'Documentos';
                                                    if (value.includes('importación')) return 'Importación';
                                                    if (value.includes('Viventta')) return 'Viventta';
                                                    return value;
                                                }}
                                            />
                                            <YAxis 
                                                axisLine={false} 
                                                tickLine={false} 
                                                tick={{ fill: '#6B7280', fontSize: 12 }}
                                            />
                                            <Tooltip 
                                                cursor={{ fill: '#F3F4F6' }}
                                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                            />
                                            <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
                                            <Bar dataKey="porAprobar" name="Por Aprobar" fill="#F97316" radius={[4, 4, 0, 0]} maxBarSize={50} />
                                            <Bar dataKey="porProcesar" name="Por Procesar" fill="#3B82F6" radius={[4, 4, 0, 0]} maxBarSize={50} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                )}
                            </div>
                        </div>

                        {/* Chart 2: Por Aprobar por Persona */}
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-lg font-bold text-[#254153]">Por Aprobar por Persona</h3>
                            </div>
                            <div className="h-[300px] w-full">
                                {statsLoading ? (
                                    <div className="h-full w-full bg-gray-50 rounded-xl animate-pulse" />
                                ) : (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart
                                            data={porAprobarPersonas}
                                            margin={{ top: 20, right: 30, left: 0, bottom: 5 }}
                                            barGap={8}
                                        >
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                            <XAxis 
                                                dataKey="name" 
                                                axisLine={false} 
                                                tickLine={false} 
                                                tick={{ fill: '#6B7280', fontSize: 12, fontWeight: 500 }}
                                                tickFormatter={(value) => value ? value.split(' ')[0] : ''} // Show just first name to avoid overlap
                                            />
                                            <YAxis 
                                                axisLine={false} 
                                                tickLine={false} 
                                                tick={{ fill: '#6B7280', fontSize: 12 }}
                                            />
                                            <Tooltip 
                                                cursor={{ fill: '#F3F4F6' }}
                                                content={({ active, payload, label }) => {
                                                    if (active && payload && payload.length) {
                                                        const data = payload[0].payload;
                                                        return (
                                                            <div className="bg-white p-3 rounded-xl shadow-lg border border-gray-100">
                                                                <p className="font-bold text-[#254153] mb-1">{label}</p>
                                                                <p className="text-sm text-[#F97316]">Documentos Por Aprobar: {data.count}</p>
                                                                <p className="text-sm text-red-500 font-medium">Por aprobar de + de 2 días: {data.overdue || 0}</p>
                                                            </div>
                                                        );
                                                    }
                                                    return null;
                                                }}
                                            />
                                            <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
                                            <Bar dataKey="count" name="Documentos Por Aprobar" fill="#F97316" radius={[4, 4, 0, 0]} maxBarSize={50} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* History Table */}
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                            <h3 className="text-lg font-bold text-[#254153]">Registro Diario (Historial)</h3>
                            <div className="flex items-center gap-3">
                                <select 
                                    className="bg-gray-50 border border-gray-200 text-gray-700 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block px-3 py-2"
                                    value={selectedYear}
                                    onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                                >
                                    {[2024, 2025, 2026, 2027, 2028].map(year => (
                                        <option key={year} value={year}>{year}</option>
                                    ))}
                                </select>
                                <select 
                                    className="bg-gray-50 border border-gray-200 text-gray-700 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block px-3 py-2"
                                    value={selectedMonth}
                                    onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                                >
                                    {[
                                        { val: 1, label: 'Enero' }, { val: 2, label: 'Febrero' }, { val: 3, label: 'Marzo' },
                                        { val: 4, label: 'Abril' }, { val: 5, label: 'Mayo' }, { val: 6, label: 'Junio' },
                                        { val: 7, label: 'Julio' }, { val: 8, label: 'Agosto' }, { val: 9, label: 'Septiembre' },
                                        { val: 10, label: 'Octubre' }, { val: 11, label: 'Noviembre' }, { val: 12, label: 'Diciembre' }
                                    ].map(m => (
                                        <option key={m.val} value={m.val}>{m.label}</option>
                                    ))}
                                </select>
                                <div className="h-8 w-8 bg-blue-50 rounded-lg flex items-center justify-center">
                                    <Clock className="h-4 w-4 text-blue-600" />
                                </div>
                            </div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="text-xs text-gray-500 uppercase bg-gray-50/50 border-b border-gray-100">
                                    <tr>
                                        <th scope="col" className="px-4 py-3 font-semibold rounded-tl-lg">Fecha</th>
                                        <th scope="col" className="px-4 py-3 font-semibold text-center">Nuevas (Hoy)</th>
                                        <th scope="col" className="px-4 py-3 font-semibold text-center">Acumuladas (Mes)</th>
                                        <th scope="col" className="px-4 py-3 font-semibold text-center">Aprobadas (Hoy)</th>
                                        <th scope="col" className="px-4 py-3 font-semibold text-center">Total Aprobadas (Mes)</th>
                                        <th scope="col" className="px-4 py-3 font-semibold text-center">Total por Aprobar</th>
                                        <th scope="col" className="px-4 py-3 font-semibold text-center">Alertas (&gt;2 días)</th>
                                        <th scope="col" className="px-4 py-3 font-semibold text-center">Total por Procesar</th>
                                        <th scope="col" className="px-4 py-3 font-semibold text-center text-indigo-600">Total Digitadas</th>
                                        <th scope="col" className="px-4 py-3 font-semibold text-center text-indigo-700">Total Digitadas (Mes)</th>
                                        <th scope="col" className="px-4 py-3 font-semibold text-center">Digitadas Mateo</th>
                                        <th scope="col" className="px-4 py-3 font-semibold text-center">Digitadas Duvan</th>
                                        <th scope="col" className="px-4 py-3 font-semibold text-center">Digitadas Jesus</th>
                                        <th scope="col" className="px-4 py-3 font-semibold rounded-tr-lg">Desglose por Módulo</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {historyLoading ? (
                                        <tr>
                                            <td colSpan={12} className="px-4 py-8 text-center text-gray-400">
                                                <div className="flex items-center justify-center space-x-2">
                                                    <div className="w-4 h-4 rounded-full border-2 border-gray-300 border-t-blue-600 animate-spin" />
                                                    <span>Cargando historial...</span>
                                                </div>
                                            </td>
                                        </tr>
                                    ) : history.filter(day => {
                                            const [year, month] = day.fecha.split('-');
                                            return parseInt(year) === selectedYear && parseInt(month) === selectedMonth;
                                        }).length === 0 ? (
                                        <tr>
                                            <td colSpan={12} className="px-4 py-8 text-center text-gray-400">
                                                No hay registros históricos para este mes todavía.
                                            </td>
                                        </tr>
                                    ) : (
                                        history.filter(day => {
                                            const [year, month] = day.fecha.split('-');
                                            return parseInt(year) === selectedYear && parseInt(month) === selectedMonth;
                                        }).map((day, idx, arr) => (
                                            <tr key={day.fecha} className={`border-b border-gray-50 hover:bg-gray-50/30 transition-colors ${idx === arr.length - 1 ? 'border-none' : ''}`}>
                                                <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">
                                                    {day.fecha}
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <span className="bg-emerald-50 text-emerald-700 font-bold px-2.5 py-0.5 rounded-md">
                                                        +{day.totalRadicadas || 0}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <span className="bg-purple-50 text-purple-700 font-bold px-2.5 py-0.5 rounded-md">
                                                        {day.totalRadicadasAcumuladas || 0}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <span className="bg-amber-50 text-amber-700 font-bold px-2.5 py-0.5 rounded-md">
                                                        ✓ {day.totalAprobadas || 0}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <span className="bg-yellow-50 text-yellow-700 font-bold px-2.5 py-0.5 rounded-md">
                                                        Σ✓ {day.totalAprobadasAcumuladas || 0}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <span className="bg-orange-50 text-orange-700 font-bold px-2.5 py-0.5 rounded-md">
                                                        {day.totalAprobar}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <span className="bg-red-50 text-red-700 font-bold px-2.5 py-0.5 rounded-md flex items-center justify-center gap-1 w-fit mx-auto">
                                                        <AlertCircle className="w-3 h-3" />
                                                        {day.totalVencidas || 0}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <span className="bg-blue-50 text-blue-700 font-bold px-2.5 py-0.5 rounded-md">
                                                        {day.totalProcesar}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <span className="bg-indigo-100 text-indigo-800 font-extrabold px-2.5 py-0.5 rounded-md">
                                                        {(day.mateo || 0) + (day.duvan || 0) + (day.jesus || 0)}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <span className="bg-indigo-200 text-indigo-900 font-extrabold px-2.5 py-0.5 rounded-md">
                                                        Σ {day.totalDigitadasAcumuladas || 0}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <span className="bg-indigo-50 text-indigo-700 font-bold px-2.5 py-0.5 rounded-md">
                                                        {day.mateo || 0}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <span className="bg-teal-50 text-teal-700 font-bold px-2.5 py-0.5 rounded-md">
                                                        {day.duvan || 0}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <span className="bg-sky-50 text-sky-700 font-bold px-2.5 py-0.5 rounded-md">
                                                        {day.jesus || 0}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="flex flex-col gap-1">
                                                        {day.modulos.map((mod: any) => (
                                                            <div key={mod.nombre} className="text-xs text-gray-600 flex justify-between min-w-[500px]">
                                                                <span className="truncate pr-2 font-semibold" title={mod.nombre}>{mod.nombre}</span>
                                                                <span className="font-medium whitespace-nowrap">
                                                                    <span className="text-emerald-600 mr-1" title="Nuevas (Hoy)">+{mod.radicadas || 0}</span>
                                                                    <span className="text-gray-300 mx-1">|</span>
                                                                    <span className="text-purple-600 mr-1" title="Acumuladas">Σ {mod.radicadasAcumuladas || 0}</span>
                                                                    <span className="text-gray-300 mx-1">|</span>
                                                                    <span className="text-amber-600 mr-1" title="Aprobadas (Hoy)">✓ {mod.aprobadas || 0}</span>
                                                                    <span className="text-gray-300 mx-1">|</span>
                                                                    <span className="text-yellow-600 mr-1" title="Total Aprobadas (Mes)">Σ✓ {mod.aprobadasAcumuladas || 0}</span>
                                                                    <span className="text-gray-300 mx-1">|</span>
                                                                    <span className="text-orange-600" title="Por Aprobar">{mod.porAprobar}</span>
                                                                    <span className="text-gray-300 mx-1">|</span>
                                                                    <span className="text-red-600 mr-1" title="Alertas (>2 días)">⚠ {mod.vencidas || 0}</span>
                                                                    <span className="text-gray-300 mx-1">|</span>
                                                                    <span className="text-blue-600" title="Por Procesar">{mod.porProcesar}</span>
                                                                    <span className="text-gray-300 mx-1">|</span>
                                                                    <span className="text-indigo-800 font-bold" title="Total Digitadas">TD: {(mod.mateo || 0) + (mod.duvan || 0) + (mod.jesus || 0)}</span>
                                                                    <span className="text-gray-300 mx-1">|</span>
                                                                    <span className="text-indigo-900 font-bold" title="Total Digitadas (Mes)">ΣTD: {mod.digitadasAcumuladas || 0}</span>
                                                                    <span className="text-gray-300 mx-1">|</span>
                                                                    <span className="text-indigo-600" title="Mateo">M: {mod.mateo || 0}</span>
                                                                    <span className="text-gray-300 mx-1">|</span>
                                                                    <span className="text-teal-600" title="Duvan">D: {mod.duvan || 0}</span>
                                                                    <span className="text-gray-300 mx-1">|</span>
                                                                    <span className="text-sky-600" title="Jesus">J: {mod.jesus || 0}</span>
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                </div>
            </main>
        </div>
    );
}
