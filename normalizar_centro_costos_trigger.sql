-- ==============================================================================
-- NORMALIZAR CLAVE DE CENTRO DE COSTOS EN FACTURAS AUTO-APROBADAS
--
-- Problema: 13 de 19 reglas en proveedor_aprobacion_reglas guardan el centro de
-- costos con la clave "centro_costos". El trigger trg_auto_aprobar_factura copia
-- ese texto tal cual a Registro_Facturas.centro_costos, pero el resto de la app
-- (SAP, pantallas externas, aprobacion-facturas) lee "centroCosto"/"centroCostos".
--
-- Solucion: trigger BEFORE adicional que corre DESPUES de auto_aprobar_factura_trigger
-- (orden alfabetico) y renombra "centro_costos" -> "centroCosto" en cada elemento
-- del arreglo JSON. No toca otros elementos ni otras claves.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.trg_normalizar_centro_costos()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.centro_costos IS NOT NULL
       AND NEW.centro_costos LIKE '[%'
       AND NEW.centro_costos LIKE '%"centro_costos"%'
       AND (TG_OP = 'INSERT' OR NEW.centro_costos IS DISTINCT FROM OLD.centro_costos)
    THEN
        BEGIN
            NEW.centro_costos := (
                SELECT jsonb_agg(
                    CASE
                        WHEN e ? 'centro_costos' AND NOT (e ? 'centroCosto')
                        THEN (e - 'centro_costos') || jsonb_build_object('centroCosto', e->'centro_costos')
                        ELSE e
                    END
                )
                FROM jsonb_array_elements(NEW.centro_costos::jsonb) AS e
            )::text;
        EXCEPTION WHEN OTHERS THEN
            -- JSON invalido: se deja el valor original
            NULL;
        END;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS zz_normalizar_centro_costos ON public."Registro_Facturas";

CREATE TRIGGER zz_normalizar_centro_costos
BEFORE INSERT OR UPDATE ON public."Registro_Facturas"
FOR EACH ROW EXECUTE FUNCTION public.trg_normalizar_centro_costos();
