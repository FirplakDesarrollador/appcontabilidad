const FRASES_OBSERVACION_POR_DEFECTO = [
    'sincronizada automaticamente desde facture',
    'nota credito sincronizada automaticamente desde facture',
    'sincronizada via power automate',
    'nota credito sincronizada via power automate',
    'creada automaticamente',
    'factura cargada directamente en el portal',
    'nota credito cargada directamente en el portal',
    'sincronizacion manual desde portal de aprobacion',
    'aprobado via portal externo',
    'rechazado via portal externo',
    'aprobado via link',
    'rechazado via link',
    'aprobado automaticamente por regla',
    'aprobada automaticamente por regla',
];

function normalizarTexto(texto: string): string {
    return texto
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

export function esObservacionPorDefecto(
    observaciones?: string | null,
    observacionInicial?: string | null
): boolean {
    if (!observaciones) return true;
    const norm = normalizarTexto(observaciones);
    if (!norm) return true;

    if (observacionInicial && observacionInicial.trim()) {
        const normInicial = normalizarTexto(observacionInicial);
        if (normInicial && norm === normInicial) {
            return true;
        }
    }

    return FRASES_OBSERVACION_POR_DEFECTO.some((frase) => norm.includes(frase));
}

export function validarObservacionRechazo(
    observaciones?: string | null,
    observacionInicial?: string | null
): { valid: boolean; error?: string } {
    if (!observaciones || !observaciones.trim()) {
        return {
            valid: false,
            error: 'Debes ingresar el motivo del rechazo en el campo de observaciones.',
        };
    }

    const norm = normalizarTexto(observaciones);

    if (observacionInicial && observacionInicial.trim()) {
        const normInicial = normalizarTexto(observacionInicial);
        if (normInicial && norm === normInicial) {
            return {
                valid: false,
                error: 'No puedes rechazar con el mensaje que viene por defecto en las observaciones. Debes cambiarlo y escribir el motivo del rechazo.',
            };
        }
    }

    if (FRASES_OBSERVACION_POR_DEFECTO.some((frase) => norm.includes(frase))) {
        return {
            valid: false,
            error: 'Debes borrar el mensaje automático por defecto en observaciones y escribir el motivo real del rechazo.',
        };
    }

    if (observaciones.trim().length < 5) {
        return {
            valid: false,
            error: 'Por favor escribe un motivo de rechazo más descriptivo (mínimo 5 caracteres).',
        };
    }

    return { valid: true };
}
