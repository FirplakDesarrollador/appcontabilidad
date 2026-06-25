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
    val_ref NUMERIC;
    pct_desv NUMERIC;
    valor_factura NUMERIC;
    min_valor NUMERIC;
    max_valor NUMERIC;
BEGIN
    -- Solo actuar si es un INSERT o si el 'Valor_total' ha cambiado en un UPDATE
    IF (TG_OP = 'INSERT') OR (TG_OP = 'UPDATE' AND (NEW."Valor_total" IS DISTINCT FROM OLD."Valor_total")) THEN
        
        -- Solo intentar aprobación si el estado actual es Pendiente, Por Aprobar, NULL o vacío
        IF NEW."Aprobacion_Doliente" IS NULL OR NEW."Aprobacion_Doliente" = '' OR NEW."Aprobacion_Doliente" = 'Pendiente' OR NEW."Aprobacion_Doliente" = 'Por Aprobar' THEN
            
            SELECT aprobacion_automatica, valor_de_referencia, porcentaje_desviacion 
            INTO auto_aprobar, val_ref, pct_desv
            FROM public.proveedores
            WHERE numero_identificacion = NEW."Nit"
            LIMIT 1;

            IF auto_aprobar = true THEN
                -- Validar que el valor sea numérico y mayor a 0 antes de proceder
                IF NEW."Valor_total" IS NOT NULL AND NEW."Valor_total" != '' AND NEW."Valor_total" != '0' THEN
                    
                    -- Intentamos el cast. Si falla, el trigger simplemente continúa sin aprobar
                    BEGIN
                        valor_factura := NEW."Valor_total"::NUMERIC;
                    EXCEPTION WHEN OTHERS THEN
                        RETURN NEW;
                    END;

                    IF valor_factura > 0 THEN
                        -- Si existen valores de validación de rango, procedemos a calcular
                        IF val_ref IS NOT NULL AND pct_desv IS NOT NULL THEN
                            min_valor := val_ref * (1 - (pct_desv / 100.0));
                            max_valor := val_ref * (1 + (pct_desv / 100.0));
                            
                            IF valor_factura >= min_valor AND valor_factura <= max_valor THEN
                                NEW."Aprobacion_Doliente" := 'Aprobado';
                            END IF;
                        ELSE
                            -- Si el proveedor tiene aprobación automática activa pero sin rango, se aprueba directo
                            NEW."Aprobacion_Doliente" := 'Aprobado';
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
