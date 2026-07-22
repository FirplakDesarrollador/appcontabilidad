-- SQL Script to create user roles table for access control
-- Run this in your Supabase SQL Editor

-- 1. Create the user_roles table
CREATE TABLE IF NOT EXISTS public.user_roles (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'editor', 'viewer')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Enable Row Level Security (RLS)
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 3. Create RLS Policies
-- Allow anyone to read the roles (useful for checking permissions in the frontend)
DROP POLICY IF EXISTS "Allow public read access to user_roles" ON public.user_roles;
CREATE POLICY "Allow public read access to user_roles" ON public.user_roles 
FOR SELECT USING (true);

-- Only allow service role (admin API) to update roles
-- Note: Service role bypasses RLS by default, so we don't strictly need a policy for it,
-- but we don't allow users to update their own roles.
DROP POLICY IF EXISTS "Deny public update access to user_roles" ON public.user_roles;
CREATE POLICY "Deny public update access to user_roles" ON public.user_roles 
FOR UPDATE USING (false);

-- 4. Create trigger to automatically add new users with 'viewer' role
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role)
  VALUES (new.id, 'viewer');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger the function every time a user is created
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- IMPORTANT: 
-- To make yourself an admin, run this command manually in the SQL editor:
-- UPDATE public.user_roles SET role = 'admin' WHERE user_id = (SELECT id FROM auth.users WHERE email = 'tu_correo@ejemplo.com');

-- 5. RPC & RLS updates to avoid using Service Role Key in Next.js

-- 5a. Create a function to check if the current user is an admin
CREATE OR REPLACE FUNCTION public.is_admin() 
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- 5b. Update RLS policy to allow admins to update roles
DROP POLICY IF EXISTS "Deny public update access to user_roles" ON public.user_roles;
DROP POLICY IF EXISTS "Allow admins to update user_roles" ON public.user_roles;


CREATE POLICY "Allow admins to update user_roles" ON public.user_roles 
FOR UPDATE 
USING (public.is_admin()) 
WITH CHECK (public.is_admin());

-- 5c. Create an RPC function to get all users safely
CREATE OR REPLACE FUNCTION public.get_all_users()
RETURNS TABLE (id UUID, email TEXT, created_at TIMESTAMPTZ, last_sign_in_at TIMESTAMPTZ, role TEXT)
SECURITY DEFINER
AS $$
BEGIN
  -- Verify if the caller is an admin
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  RETURN QUERY
  SELECT 
    au.id, 
    au.email::text, 
    au.created_at, 
    au.last_sign_in_at,
    COALESCE(ur.role, 'viewer')
  FROM auth.users au
  LEFT JOIN public.user_roles ur ON au.id = ur.user_id;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION public.get_all_users() TO authenticated;
