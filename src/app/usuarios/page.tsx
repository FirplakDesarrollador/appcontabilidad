"use client";

import React, { useEffect, useState } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Users, Loader2, ShieldCheck, Mail, Calendar, AlertCircle } from "lucide-react";

interface AppUser {
    id: string;
    email: string;
    role: "admin" | "editor" | "viewer";
    created_at: string;
    last_sign_in_at?: string;
}

export default function UsuariosPage() {
    const { role, isLoading: authLoading } = useAuth();
    const router = useRouter();
    
    const [users, setUsers] = useState<AppUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [updatingId, setUpdatingId] = useState<string | null>(null);

    useEffect(() => {
        if (!authLoading && role !== "admin") {
            router.push("/");
        }
    }, [role, authLoading, router]);

    useEffect(() => {
        const fetchUsers = async () => {
            try {
                const res = await fetch("/api/users");
                if (!res.ok) {
                    const errorData = await res.json();
                    throw new Error(errorData.error || "Error al cargar usuarios");
                }
                const data = await res.json();
                setUsers(data);
            } catch (err: any) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        if (role === "admin") {
            fetchUsers();
        }
    }, [role]);

    const handleRoleChange = async (userId: string, newRole: string) => {
        setUpdatingId(userId);
        try {
            const res = await fetch("/api/users", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId, role: newRole }),
            });
            
            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.error || "Error al actualizar rol");
            }
            
            setUsers(users.map(u => u.id === userId ? { ...u, role: newRole as any } : u));
        } catch (err: any) {
            alert("Error: " + err.message);
        } finally {
            setUpdatingId(null);
        }
    };

    if (authLoading || role !== "admin") {
        return (
            <div className="flex h-screen items-center justify-center bg-[#f8fafc]">
                <Loader2 className="h-10 w-10 animate-spin text-[#254153]" />
            </div>
        );
    }

    return (
        <div className="flex h-screen bg-[#f8fafc] font-sans overflow-hidden">
            <Sidebar />
            <main className="flex-1 flex flex-col min-w-0 overflow-hidden md:ml-64 relative">
                {/* Header */}
                <header className="bg-white/80 backdrop-blur-xl border-b border-gray-200 sticky top-0 z-20 shadow-sm">
                    <div className="px-6 py-4 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="h-12 w-12 rounded-2xl bg-[#254153]/5 flex items-center justify-center">
                                <Users className="h-6 w-6 text-[#254153]" />
                            </div>
                            <div>
                                <h1 className="text-2xl font-bold text-[#254153] tracking-tight">Control de Usuarios</h1>
                                <p className="text-sm text-gray-500 font-medium">Gestiona los permisos y accesos del sistema</p>
                            </div>
                        </div>
                    </div>
                </header>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
                    {error && (
                        <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 flex items-start gap-3">
                            <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                            <div>
                                <h3 className="font-semibold text-red-800">Atención requerida</h3>
                                <p className="text-sm text-red-600 mt-1">{error}</p>
                            </div>
                        </div>
                    )}

                    {loading ? (
                        <div className="flex items-center justify-center h-64">
                            <Loader2 className="h-8 w-8 animate-spin text-[#254153]" />
                        </div>
                    ) : (
                        <motion.div 
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="bg-white rounded-3xl border border-gray-100 shadow-xl overflow-hidden"
                        >
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-gray-50/80 border-b border-gray-100">
                                            <th className="py-4 px-6 font-semibold text-gray-500 text-sm">Usuario</th>
                                            <th className="py-4 px-6 font-semibold text-gray-500 text-sm">Fecha de Registro</th>
                                            <th className="py-4 px-6 font-semibold text-gray-500 text-sm">Rol Actual</th>
                                            <th className="py-4 px-6 font-semibold text-gray-500 text-sm text-right">Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {users.map((u, index) => (
                                            <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                                                <td className="py-4 px-6">
                                                    <div className="flex items-center gap-3">
                                                        <div className="h-10 w-10 rounded-full bg-[#254153]/10 flex items-center justify-center text-[#254153] font-bold">
                                                            {u.email[0].toUpperCase()}
                                                        </div>
                                                        <div>
                                                            <p className="font-semibold text-[#254153]">{u.email}</p>
                                                            <p className="text-xs text-gray-400 font-mono">{u.id.substring(0,8)}...</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="py-4 px-6 text-sm text-gray-600">
                                                    {new Date(u.created_at).toLocaleDateString()}
                                                </td>
                                                <td className="py-4 px-6">
                                                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
                                                        u.role === 'admin' ? 'bg-purple-100 text-purple-700' :
                                                        u.role === 'editor' ? 'bg-blue-100 text-blue-700' :
                                                        'bg-gray-100 text-gray-700'
                                                    }`}>
                                                        {u.role === 'admin' ? <ShieldCheck className="h-3.5 w-3.5" /> : null}
                                                        {u.role === 'admin' ? 'Administrador' : u.role === 'editor' ? 'Editor' : 'Solo Vista'}
                                                    </span>
                                                </td>
                                                <td className="py-4 px-6 text-right">
                                                    <select 
                                                        disabled={updatingId === u.id}
                                                        value={u.role}
                                                        onChange={(e) => handleRoleChange(u.id, e.target.value)}
                                                        className="bg-gray-50 border border-gray-200 text-[#254153] text-sm rounded-lg focus:ring-[#254153] focus:border-[#254153] p-2.5 outline-none font-medium cursor-pointer hover:bg-gray-100 transition-colors disabled:opacity-50"
                                                    >
                                                        <option value="admin">Administrador</option>
                                                        <option value="editor">Editor</option>
                                                        <option value="viewer">Solo Vista</option>
                                                    </select>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </motion.div>
                    )}
                </div>
            </main>
        </div>
    );
}
