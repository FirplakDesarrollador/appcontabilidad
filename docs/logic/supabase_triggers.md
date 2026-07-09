# Lógica de Base de Datos (Supabase)

Este documento centraliza el conocimiento sobre procesos automáticos que ocurren directamente en la base de datos de Supabase sin necesidad de intermediarios (n8n o Backend).

## 1. Aprobación Automática de Facturas

### Resumen del Proceso
Cada vez que se inserta una nueva factura en la tabla `Registro_Facturas`, la base de datos verifica si el proveedor tiene habilitada la aprobación automática. Si es así, marca la factura automáticamente como "Aprobada".

### Detalles Técnicos
- **Nombre del Trigger**: `auto_aprobar_factura_trigger`
- **Operación**: `INSERT` (BEFORE)
- **Tabla**: `public.Registro_Facturas`
- **Función Ejecutada**: `public.trg_auto_aprobar_factura()`

### Código de la Función (PL/pgSQL)

```sql
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
BEGIN
    -- Solo actuar si es un INSERT o si el 'Valor_total' ha cambiado en un UPDATE
    IF (TG_OP = 'INSERT') OR (TG_OP = 'UPDATE' AND (NEW."Valor_total" IS DISTINCT FROM OLD."Valor_total")) THEN
        
        -- Solo intentar aprobación si el estado actual es Pendiente, Por Aprobar, NULL o vacío
        IF NEW."Aprobacion_Doliente" IS NULL OR NEW."Aprobacion_Doliente" = '' OR NEW."Aprobacion_Doliente" = 'Pendiente' OR NEW."Aprobacion_Doliente" = 'Por Aprobar' THEN
            
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
                        
                        -- NUEVA LOGICA: Buscar en la tabla proveedor_aprobacion_reglas
                        FOR regla IN 
                            SELECT valor, porcentaje_desviacion, centro_costos, cuenta 
                            FROM public.proveedor_aprobacion_reglas 
                            WHERE proveedor_id = proveedor_id_uuid
                        LOOP
                            min_valor := regla.valor * (1 - (regla.porcentaje_desviacion / 100.0));
                            max_valor := regla.valor * (1 + (regla.porcentaje_desviacion / 100.0));
                            
                            IF valor_factura >= min_valor AND valor_factura <= max_valor THEN
                                NEW."Aprobacion_Doliente" := 'Aprobado';
                                
                                -- Generar el JSON de centro de costos
                                IF regla.centro_costos IS NOT NULL AND regla.cuenta IS NOT NULL THEN
                                    NEW.centro_costos := jsonb_build_array(
                                        jsonb_build_object(
                                            'centroCosto', regla.centro_costos,
                                            'cuenta', regla.cuenta,
                                            'valor', NEW."Valor_total"
                                        )
                                    )::text;
                                END IF;
                                
                                match_found := true;
                                EXIT; -- Salir del loop porque ya encontramos una regla que coincide
                            END IF;
                        END LOOP;

                        -- Si no hay reglas configuradas para este proveedor, mantenemos la retrocompatibilidad:
                        IF NOT match_found THEN
                            IF NOT EXISTS (SELECT 1 FROM public.proveedor_aprobacion_reglas WHERE proveedor_id = proveedor_id_uuid) THEN
                                -- Aprobación a ciegas (retrocompatibilidad para proveedores sin reglas nuevas)
                                NEW."Aprobacion_Doliente" := 'Aprobado';
                                
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
    END IF;

    RETURN NEW;
END;
```

### Tablas Involucradas
1.  **`proveedores`**: Define quién tiene aprobación automática (`aprobacion_automatica: boolean`).
2.  **`Registro_Facturas`**: Donde se aplica el cambio de estado (`Aprobacion_Doliente`).

---
Documentación generada por Antigravity - 25/03/2026
