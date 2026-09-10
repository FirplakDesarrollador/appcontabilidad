-- ==============================================================================
-- SCRIPT DE REPARACIÓN: Facturas atascadas en "Por Aprobar" / "Pendiente"
-- que pertenecen a proveedores con aprobación automática.
--
-- CÓMO FUNCIONA:
--   Hace un UPDATE de Aprobacion_Doliente = 'Por Aprobar' sobre sí mismo,
--   lo que cambia el valor (IS DISTINCT FROM) y dispara el trigger v2,
--   que evaluará automáticamente si corresponde aprobar la factura.
--
-- SEGURIDAD:
--   Solo toca facturas con estado NULL, '', 'Pendiente' o 'Por Aprobar'.
--   No toca facturas ya Aprobadas, Rechazadas ni en ningún otro estado.
--
-- USO: Pegar y ejecutar en el SQL Editor de Supabase.
-- ==============================================================================

-- 1. Vista previa: cuántas facturas serán evaluadas
SELECT
    rf."ID",
    rf."Nit",
    rf."Proveedor",
    rf."Nro_Factura",
    rf."Valor_total",
    rf."Aprobacion_Doliente" AS estado_actual,
    p.aprobacion_automatica
FROM public."Registro_Facturas" rf
JOIN public.proveedores p ON p.numero_identificacion = rf."Nit"
WHERE p.aprobacion_automatica = true
  AND (
      rf."Aprobacion_Doliente" IS NULL OR
      rf."Aprobacion_Doliente" = '' OR
      rf."Aprobacion_Doliente" = 'Pendiente' OR
      rf."Aprobacion_Doliente" = 'Por Aprobar'
  )
  AND rf."Valor_total" IS NOT NULL
  AND rf."Valor_total" != ''
  AND rf."Valor_total" != '0'
ORDER BY rf."ID" DESC;

-- ==============================================================================
-- 2. Reparación: forzar re-evaluación del trigger
--    (descomentar cuando hayas revisado la vista previa)
-- ==============================================================================

/*
UPDATE public."Registro_Facturas" rf
SET "Aprobacion_Doliente" = 'Por Aprobar'
FROM public.proveedores p
WHERE p.numero_identificacion = rf."Nit"
  AND p.aprobacion_automatica = true
  AND (
      rf."Aprobacion_Doliente" IS NULL OR
      rf."Aprobacion_Doliente" = '' OR
      rf."Aprobacion_Doliente" = 'Pendiente' OR
      rf."Aprobacion_Doliente" = 'Por Aprobar'
  )
  AND rf."Valor_total" IS NOT NULL
  AND rf."Valor_total" != ''
  AND rf."Valor_total" != '0';
*/

-- ==============================================================================
-- 3. Verificación post-reparación: ver cuántas quedaron aprobadas
-- ==============================================================================

/*
SELECT
    rf."Aprobacion_Doliente" AS estado_final,
    count(*) AS cantidad
FROM public."Registro_Facturas" rf
JOIN public.proveedores p ON p.numero_identificacion = rf."Nit"
WHERE p.aprobacion_automatica = true
GROUP BY rf."Aprobacion_Doliente"
ORDER BY cantidad DESC;
*/
