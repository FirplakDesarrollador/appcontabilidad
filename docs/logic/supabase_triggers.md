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
BEGIN
    -- Busca en la tabla proveedores cruzando por el Nit de la nueva factura
    SELECT aprobacion_automatica INTO auto_aprobar
    FROM public.proveedores
    WHERE numero_identificacion = NEW."Nit"
    LIMIT 1;

    -- Si el proveedor tiene aprobacion_automatica en TRUE, cambia el estado a 'Aprobado'
    IF auto_aprobar = true THEN
        NEW."Aprobacion_Doliente" := 'Aprobado';
    END IF;

    RETURN NEW;
END;
```

### Tablas Involucradas
1.  **`proveedores`**: Define quién tiene aprobación automática (`aprobacion_automatica: boolean`).
2.  **`Registro_Facturas`**: Donde se aplica el cambio de estado (`Aprobacion_Doliente`).

---
Documentación generada por Antigravity - 25/03/2026
