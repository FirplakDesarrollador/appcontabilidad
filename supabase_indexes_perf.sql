-- ==============================================================================
-- Script de Índices para Acelerar la Aplicación de Facturas en Supabase
-- Ejecutar este script en el SQL Editor de Supabase
-- ==============================================================================

-- 1. Índice para filtrado de facturas Por Aprobar (Pendientes)
CREATE INDEX IF NOT EXISTS idx_reg_facturas_aprobacion 
ON "Registro_Facturas" ("Aprobacion_Doliente");

-- 2. Índice para filtrado de Gestión Contabilidad (Por Procesar / Procesado)
CREATE INDEX IF NOT EXISTS idx_reg_facturas_gestion 
ON "Registro_Facturas" ("Gestion_Contabilidad");

-- 3. Índice para ordenamiento descendente por ID
CREATE INDEX IF NOT EXISTS idx_reg_facturas_id_desc 
ON "Registro_Facturas" ("ID" DESC);

-- 4. Índice compuesto para la pestaña "Pendientes" (Aprobacion_Doliente + ID DESC)
CREATE INDEX IF NOT EXISTS idx_reg_facturas_pending_comp 
ON "Registro_Facturas" ("Aprobacion_Doliente", "ID" DESC);

-- 5. Índice compuesto para "Por Procesar" y "Procesadas"
CREATE INDEX IF NOT EXISTS idx_reg_facturas_processed_comp 
ON "Registro_Facturas" ("Aprobacion_Doliente", "Gestion_Contabilidad", "FechaProcesado");

-- 6. Índice para búsquedas por NIT y Número de Factura
CREATE INDEX IF NOT EXISTS idx_reg_facturas_nit_nro 
ON "Registro_Facturas" ("Nit", "Nro_Factura");
