-- ==============================================================================
-- ACTUALIZACIÓN DE FUNCIÓN TRIGGER: trg_auto_aprobar_factura
-- v2 — Amplía las condiciones de disparo para cubrir upserts del sync-engine:
--   * INSERT con estado evaluable
--   * UPDATE cuando Valor_total cambia
--   * UPDATE cuando Aprobacion_Doliente cambia a un estado evaluable
--     (NULL, '', 'Pendiente', 'Por Aprobar')
--     → cubre el caso del sync-engine que hace upsert con el mismo Valor_total
--       pero llega con Aprobacion_Doliente = NULL o 'Por Aprobar'
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.trg_auto_aprobar_factura()
RETURNS TRIGGER AS $$
DECLARE
    auto_aprobar BOOLEAN;

    historical_cc TEXT;
    match_found BOOLEAN := false;
    fixed_cc_pattern JSONB;
    is_fixed_pattern BOOLEAN;

    regla RECORD;
    valor_factura NUMERIC;
    min_valor NUMERIC;
    max_valor NUMERIC;

    proveedor_id_uuid UUID;

    -- Helper: TRUE si el nuevo estado permite intentar auto-aprobación
    nuevo_estado_evaluable BOOLEAN;
BEGIN
    -- Calcular si el nuevo estado es uno que permite intentar auto-aprobación
    nuevo_estado_evaluable := (
        NEW."Aprobacion_Doliente" IS NULL OR
        NEW."Aprobacion_Doliente" = '' OR
        NEW."Aprobacion_Doliente" = 'Pendiente' OR
        NEW."Aprobacion_Doliente" = 'Por Aprobar'
    );

    -- --------------------------------------------------------------------------
    -- Condiciones de disparo (ampliadas respecto a v1):
    --
    -- A) INSERT con estado evaluable
    -- B) UPDATE donde Valor_total cambió Y el estado nuevo es evaluable
    -- C) UPDATE donde Aprobacion_Doliente cambió Y el estado nuevo es evaluable
    --    → cubre el caso del sync-engine que hace upsert con el mismo Valor_total
    --      pero llega con Aprobacion_Doliente = NULL o 'Por Aprobar'
    -- --------------------------------------------------------------------------
    IF nuevo_estado_evaluable AND (
        TG_OP = 'INSERT'
        OR (TG_OP = 'UPDATE' AND NEW."Valor_total" IS DISTINCT FROM OLD."Valor_total")
        OR (TG_OP = 'UPDATE' AND NEW."Aprobacion_Doliente" IS DISTINCT FROM OLD."Aprobacion_Doliente")
    ) THEN

        SELECT id, aprobacion_automatica
        INTO proveedor_id_uuid, auto_aprobar
        FROM public.proveedores
        WHERE numero_identificacion = NEW."Nit"
        LIMIT 1;

        IF auto_aprobar = true THEN
            -- Validar que el valor sea numérico y mayor a 0 antes de proceder
            IF NEW."Valor_total" IS NOT NULL AND NEW."Valor_total" != '' AND NEW."Valor_total" != '0' THEN

                BEGIN
                    valor_factura := NEW."Valor_total"::NUMERIC;
                EXCEPTION WHEN OTHERS THEN
                    RETURN NEW;
                END;

                IF valor_factura > 0 THEN

                    match_found := false;

                    -- Buscar en la tabla proveedor_aprobacion_reglas
                    FOR regla IN
                        SELECT valor, porcentaje_desviacion, centro_costos, cuenta
                        FROM public.proveedor_aprobacion_reglas
                        WHERE proveedor_id = proveedor_id_uuid
                    LOOP
                        min_valor := regla.valor * (1 - (regla.porcentaje_desviacion / 100.0));
                        max_valor := regla.valor * (1 + (regla.porcentaje_desviacion / 100.0));

                        IF valor_factura >= min_valor AND valor_factura <= max_valor THEN
                            NEW."Aprobacion_Doliente" := 'Aprobado';
                            NEW."FechaAprobacion" := CURRENT_TIMESTAMP;

                            -- Generar o asignar el centro de costos
                            IF regla.centro_costos IS NOT NULL AND regla.centro_costos != '' THEN
                                IF regla.centro_costos LIKE '[%' THEN
                                    -- Formato moderno: Ya es un array JSON
                                    NEW.centro_costos := regla.centro_costos;
                                ELSIF regla.cuenta IS NOT NULL AND regla.cuenta != '' THEN
                                    -- Formato antiguo: columnas individuales
                                    NEW.centro_costos := jsonb_build_array(
                                        jsonb_build_object(
                                            'centroCosto', regla.centro_costos,
                                            'cuenta', regla.cuenta,
                                            'valor', NEW."Valor_total"
                                        )
                                    )::text;
                                ELSE
                                    NEW.centro_costos := regla.centro_costos;
                                END IF;
                            END IF;

                            match_found := true;
                            EXIT;
                        END IF;
                    END LOOP;

                    -- Si no hay reglas configuradas, retrocompatibilidad
                    IF NOT match_found THEN
                        IF NOT EXISTS (SELECT 1 FROM public.proveedor_aprobacion_reglas WHERE proveedor_id = proveedor_id_uuid) THEN
                            -- Aprobación a ciegas
                            NEW."Aprobacion_Doliente" := 'Aprobado';
                            NEW."FechaAprobacion" := CURRENT_TIMESTAMP;

                            -- Estrategia 1: Búsqueda por Valor Exacto
                            SELECT centro_costos INTO historical_cc
                            FROM public."Registro_Facturas"
                            WHERE "Nit" = NEW."Nit"
                              AND "Aprobacion_Doliente" = 'Aprobado'
                              AND centro_costos IS NOT NULL
                              AND centro_costos != ''
                              AND "Valor_total" = NEW."Valor_total"
                              AND "ID" != NEW."ID"
                            ORDER BY "ID" DESC
                            LIMIT 1;

                            IF historical_cc IS NOT NULL THEN
                                NEW.centro_costos := historical_cc;
                            ELSE
                                -- Estrategia 2: Proveedor de Cuenta Fija
                                BEGIN
                                    WITH last_invoices AS (
                                        SELECT centro_costos
                                        FROM public."Registro_Facturas"
                                        WHERE "Nit" = NEW."Nit"
                                          AND "Aprobacion_Doliente" = 'Aprobado'
                                          AND centro_costos IS NOT NULL
                                          AND centro_costos != ''
                                          AND centro_costos LIKE '[%'
                                          AND "ID" != NEW."ID"
                                        ORDER BY "ID" DESC
                                        LIMIT 5
                                    ),
                                    parsed_elements AS (
                                        SELECT (jsonb_array_elements(centro_costos::jsonb)) AS elem
                                        FROM last_invoices
                                        WHERE jsonb_typeof(centro_costos::jsonb) = 'array'
                                          AND jsonb_array_length(centro_costos::jsonb) = 1
                                    ),
                                    grouped_patterns AS (
                                        SELECT
                                            elem->>'centroCosto' AS cc,
                                            elem->>'cuenta' AS cta,
                                            count(*) as c
                                        FROM parsed_elements
                                        GROUP BY elem->>'centroCosto', elem->>'cuenta'
                                    )
                                    SELECT
                                        jsonb_build_array(
                                            jsonb_build_object(
                                                'centroCosto', cc,
                                                'cuenta', cta,
                                                'valor', NEW."Valor_total"
                                            )
                                        ),
                                        (c >= 1 AND c = (SELECT count(*) FROM last_invoices))
                                    INTO fixed_cc_pattern, is_fixed_pattern
                                    FROM grouped_patterns
                                    WHERE c = (SELECT count(*) FROM last_invoices)
                                    LIMIT 1;

                                    IF is_fixed_pattern = true THEN
                                        NEW.centro_costos := fixed_cc_pattern::text;
                                    END IF;
                                EXCEPTION WHEN OTHERS THEN
                                END;
                            END IF;
                        END IF;
                    END IF;

                END IF;
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
