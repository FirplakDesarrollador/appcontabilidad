"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";

type Role = "admin" | "editor" | "viewer";

interface AuthContextType {
    user: User | null;
    role: Role;
    isLoading: boolean;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    role: "viewer",
    isLoading: true,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [role, setRole] = useState<Role>("viewer");
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        let isMounted = true;

        const fetchUserAndRole = async (sessionUser: User | null) => {
            if (!sessionUser) {
                if (isMounted) {
                    setUser(null);
                    setRole("viewer");
                    setIsLoading(false);
                }
                return;
            }

            setUser(sessionUser);

            // Fetch role from user_roles table
            try {
                const { data, error } = await supabase
                    .from("user_roles")
                    .select("role")
                    .eq("user_id", sessionUser.id)
                    .single();

                if (error) {
                    console.error("Error fetching user role:", error);
                    if (isMounted) setRole("viewer"); // Fallback
                } else if (data && isMounted) {
                    setRole(data.role as Role);
                }
            } catch (err) {
                console.error("Unexpected error fetching user role:", err);
                if (isMounted) setRole("viewer");
            } finally {
                if (isMounted) setIsLoading(false);
            }
        };

        // Check active session on mount
        supabase.auth.getSession().then(({ data: { session } }) => {
            fetchUserAndRole(session?.user || null);
        });

        // Listen for auth changes
        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, session) => {
            fetchUserAndRole(session?.user || null);
        });

        return () => {
            isMounted = false;
            subscription.unsubscribe();
        };
    }, []);

    return (
        <AuthContext.Provider value={{ user, role, isLoading }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);
