-- Ejecutar este script en el SQL Editor de Supabase (https://supabase.com/dashboard)

ALTER TABLE "Radicados_de_importacion"
ADD COLUMN IF NOT EXISTS "Nit" text,
ADD COLUMN IF NOT EXISTS "Proveedor" text,
ADD COLUMN IF NOT EXISTS "Nro_Factura" text,
ADD COLUMN IF NOT EXISTS "Monto" numeric,
ADD COLUMN IF NOT EXISTS "Responsable_de_Autorizar" text,
ADD COLUMN IF NOT EXISTS "Aprobacion_Doliente" text DEFAULT 'Pendiente',
ADD COLUMN IF NOT EXISTS "Gestion_Contabilidad" text DEFAULT 'Pendiente',
ADD COLUMN IF NOT EXISTS "Consecutivo" text,
ADD COLUMN IF NOT EXISTS "Created" timestamp with time zone DEFAULT timezone('utc'::text, now()),
ADD COLUMN IF NOT EXISTS "FechaAprobacion" timestamp with time zone,
ADD COLUMN IF NOT EXISTS "centro_costos" jsonb,
ADD COLUMN IF NOT EXISTS "Observaciones" text,
ADD COLUMN IF NOT EXISTS "Attachments" boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS "adjuntos_url" text;

-- Habilitar RLS si no está habilitado
ALTER TABLE "Radicados_de_importacion" ENABLE ROW LEVEL SECURITY;

-- Crear política para permitir todo el acceso temporalmente (o ajustar según tus necesidades)
DROP POLICY IF EXISTS "Permitir todo a anon y authenticated" ON "Radicados_de_importacion";
CREATE POLICY "Permitir todo a anon y authenticated"
ON "Radicados_de_importacion"
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);
