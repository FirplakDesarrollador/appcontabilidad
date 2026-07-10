import React, { useState } from 'react';
import { Plus, Trash2, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { SearchableSelect } from '@/components/ui/SearchableSelect';

interface RuleLine {
    id: string;
    centro_costos: string;
    cuenta: string;
    valor: string;
}

export function ProviderRuleManager({ 
    provider, 
    onAddRule, 
    onDeleteRule, 
    centrosCostosList, 
    cuentasList 
}: { 
    provider: any, 
    onAddRule: (rule: any) => Promise<boolean>, 
    onDeleteRule: (ruleId: string) => Promise<void>,
    centrosCostosList: any[],
    cuentasList: any[]
}) {
    const rules = provider.proveedor_aprobacion_reglas || [];
    const [isAdding, setIsAdding] = useState(false);
    const [newRuleValor, setNewRuleValor] = useState('');
    const [newRuleDesv, setNewRuleDesv] = useState('');
    const [newRuleLines, setNewRuleLines] = useState<RuleLine[]>([{ id: '1', centro_costos: '', cuenta: '', valor: '' }]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleAdd = async () => {
        if (!newRuleValor || !newRuleDesv) {
            alert('Debe ingresar un valor total y una desviación.');
            return;
        }
        
        const invalidLines = newRuleLines.some(l => !l.centro_costos || !l.cuenta || !l.valor);
        if (invalidLines) {
            alert('Todas las líneas de distribución deben tener Centro de Costos, Cuenta y Valor.');
            return;
        }

        const totalLines = newRuleLines.reduce((acc, l) => acc + Number(l.valor), 0);
        if (totalLines !== Number(newRuleValor)) {
            alert(`La suma de los valores de las líneas ($${totalLines.toLocaleString()}) no coincide con el Valor Total ($${Number(newRuleValor).toLocaleString()}).`);
            return;
        }

        setIsSubmitting(true);
        
        // Save lines as JSON string in centro_costos, and leave cuenta as null
        const linesJson = JSON.stringify(newRuleLines.map(l => ({
            centro_costos: l.centro_costos,
            cuenta: l.cuenta,
            valor: Number(l.valor)
        })));

        const success = await onAddRule({
            valor: Number(newRuleValor),
            porcentaje_desviacion: Number(newRuleDesv),
            centro_costos: linesJson,
            cuenta: null
        });
        
        setIsSubmitting(false);
        if (success) {
            setNewRuleValor('');
            setNewRuleDesv('');
            setNewRuleLines([{ id: String(Date.now()), centro_costos: '', cuenta: '', valor: '' }]);
            setIsAdding(false);
        }
    };

    const addLine = () => {
        setNewRuleLines(prev => [...prev, { id: String(Date.now()), centro_costos: '', cuenta: '', valor: '' }]);
    };

    const removeLine = (id: string) => {
        if (newRuleLines.length === 1) return;
        setNewRuleLines(prev => prev.filter(l => l.id !== id));
    };

    const updateLine = (id: string, field: keyof RuleLine, value: string) => {
        setNewRuleLines(prev => prev.map(l => {
            if (l.id === id) {
                const updated = { ...l, [field]: value };
                if (field === 'centro_costos') updated.cuenta = ''; // reset account when CC changes
                return updated;
            }
            return l;
        }));
    };

    // Helper to render stored rules correctly if they are JSON or simple text
    const renderStoredRuleLines = (r: any) => {
        let lines = [];
        try {
            lines = JSON.parse(r.centro_costos);
        } catch (e) {
            // It's a legacy simple rule
            lines = [{ centro_costos: r.centro_costos, cuenta: r.cuenta, valor: r.valor }];
        }
        
        if (!Array.isArray(lines)) {
            lines = [{ centro_costos: r.centro_costos, cuenta: r.cuenta, valor: r.valor }];
        }

        return (
            <div className="flex flex-col gap-1 mt-2">
                {lines.map((line: any, idx: number) => (
                    <div key={idx} className="flex gap-2 text-[11px] text-gray-500 bg-gray-50 p-1.5 rounded-md border border-gray-100 items-center">
                        <span className="flex-1 truncate"><b className="text-gray-700">CC:</b> {line.centro_costos || 'N/A'}</span>
                        <span className="flex-1 truncate"><b className="text-gray-700">Cta:</b> {line.cuenta || 'N/A'}</span>
                        <span className="w-24 text-right font-bold text-gray-700">${Number(line.valor).toLocaleString()}</span>
                    </div>
                ))}
            </div>
        );
    };

    return (
        <div className="mt-4 pt-4 border-t border-green-100/50 flex flex-col gap-3">
            {rules.length > 0 && (
                <div className="space-y-2 mb-2">
                    <label className="text-[10px] font-black text-green-800 uppercase tracking-tight block">Valores Permitidos ({rules.length})</label>
                    {rules.map((r: any) => (
                        <div key={r.id} className="bg-white rounded-lg p-2.5 border border-green-100 flex flex-col gap-1.5 relative group shadow-sm">
                            <button 
                                onClick={() => onDeleteRule(r.id)}
                                className="absolute top-2 right-2 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                title="Eliminar valor"
                            >
                                <Trash2 className="h-3.5 w-3.5" />
                            </button>
                            <div className="flex items-center gap-3">
                                <div>
                                    <span className="text-[9px] text-gray-400 font-bold uppercase block mb-0.5">Valor Total (COP)</span>
                                    <span className="text-sm font-black text-[#254153]">${Number(r.valor).toLocaleString()}</span>
                                </div>
                                <div className="border-l border-gray-100 pl-3">
                                    <span className="text-[9px] text-gray-400 font-bold uppercase block mb-0.5">Desv. (±)</span>
                                    <span className="text-sm font-bold text-gray-600">{r.porcentaje_desviacion}%</span>
                                </div>
                            </div>
                            {renderStoredRuleLines(r)}
                        </div>
                    ))}
                </div>
            )}
            
            {isAdding ? (
                <div className="bg-green-50/50 p-3 rounded-xl border border-green-200 shadow-inner">
                    <div className="flex flex-col gap-3 mb-3">
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label className="text-[9px] font-black text-green-700 uppercase mb-1 block">Valor Total (COP)</label>
                                <input 
                                    type="number" 
                                    value={newRuleValor} 
                                    onChange={e => setNewRuleValor(e.target.value)}
                                    className="w-full h-8 px-2 bg-white border border-green-200 rounded-lg text-xs font-bold text-black focus:outline-none focus:ring-2 focus:ring-green-500/20" 
                                    placeholder="Ej. 150000"
                                />
                            </div>
                            <div>
                                <label className="text-[9px] font-black text-green-700 uppercase mb-1 block">% Desv.</label>
                                <input 
                                    type="number" 
                                    value={newRuleDesv} 
                                    onChange={e => setNewRuleDesv(e.target.value)}
                                    className="w-full h-8 px-2 bg-white border border-green-200 rounded-lg text-xs font-bold text-black focus:outline-none focus:ring-2 focus:ring-green-500/20" 
                                    placeholder="Ej. 10"
                                />
                            </div>
                        </div>

                        <div className="space-y-2 mt-2">
                            <div className="flex justify-between items-center">
                                <label className="text-[10px] font-black text-green-800 uppercase block">Líneas de Distribución</label>
                                <Button 
                                    variant="outline" 
                                    className="h-6 text-[10px] px-2 border-green-200 text-green-700 hover:bg-green-100"
                                    onClick={addLine}
                                >
                                    <Plus className="h-3 w-3 mr-1" /> Línea
                                </Button>
                            </div>
                            
                            {newRuleLines.map((line, index) => (
                                <div key={line.id} className="bg-white p-2.5 rounded-lg border border-green-100 flex flex-col gap-2 relative group shadow-sm">
                                    {newRuleLines.length > 1 && (
                                        <button 
                                            onClick={() => removeLine(line.id)}
                                            className="absolute top-1 right-1 text-gray-300 hover:text-red-500 p-1"
                                        >
                                            <X className="h-3.5 w-3.5" />
                                        </button>
                                    )}
                                    <div className="space-y-1 pr-6">
                                        <label className="text-[9px] font-black text-green-700 uppercase block">C. Costos</label>
                                        <SearchableSelect
                                            options={centrosCostosList.map((c: any) => ({
                                                value: `${c.codigo ? c.codigo + ' - ' : ''}${c.Título}`,
                                                label: `${c.codigo ? c.codigo + ' - ' : ''}${c.Título}`
                                            }))}
                                            value={line.centro_costos}
                                            onChange={(val) => updateLine(line.id, 'centro_costos', val)}
                                            placeholder="Selecciona CC..."
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 pr-6">
                                        <div className="space-y-1">
                                            <label className="text-[9px] font-black text-green-700 uppercase block">Cuenta</label>
                                            <SearchableSelect
                                                options={(() => {
                                                    if (!line.centro_costos) return [];
                                                    const isNoAplica = line.centro_costos.toLowerCase().includes("no aplica");
                                                    if (isNoAplica) {
                                                        return cuentasList.filter((c: any) => 
                                                            c.Título?.startsWith("0") || 
                                                            c.Título?.startsWith("22") ||
                                                            c.Título?.startsWith("1465") ||
                                                            c.Título?.startsWith("740105") ||
                                                            c.Título?.startsWith("530515") ||
                                                            c.Título?.startsWith("1105")
                                                        ).map((c: any) => ({ value: c.Título, label: c.Título }));
                                                    }
                                                    const selectedCC = centrosCostosList.find(c => `${c.codigo ? c.codigo + ' - ' : ''}${c.Título}` === line.centro_costos);
                                                    const prefix = selectedCC?.cuentas_asociadas?.toString();
                                                    const isGV = line.centro_costos.toUpperCase().startsWith("GV");
                                                    const filtered = prefix 
                                                        ? cuentasList.filter(c => c.Título?.startsWith(prefix) || (isGV && c.Título?.startsWith("26059510")))
                                                        : cuentasList;
                                                    return filtered.map((c: any) => ({ value: c.Título, label: c.Título }));
                                                })()}
                                                value={line.cuenta}
                                                onChange={(val) => updateLine(line.id, 'cuenta', val)}
                                                placeholder="Cuenta..."
                                                disabled={!line.centro_costos}
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[9px] font-black text-green-700 uppercase block">Valor</label>
                                            <input 
                                                type="number" 
                                                value={line.valor} 
                                                onChange={e => updateLine(line.id, 'valor', e.target.value)}
                                                className="w-full h-11 px-2 bg-white border border-gray-200 rounded-xl text-sm font-medium text-black focus:outline-none focus:ring-2 focus:ring-[#254153]/10 hover:border-[#254153]/50 transition-all" 
                                                placeholder="Valor..."
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <Button 
                            className="flex-1 h-7 text-[10px] bg-green-600 hover:bg-green-700 text-white" 
                            onClick={handleAdd}
                            disabled={isSubmitting}
                        >
                            {isSubmitting ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Guardar Regla'}
                        </Button>
                        <Button 
                            variant="outline" 
                            className="flex-1 h-7 text-[10px] border-green-200 text-green-700 hover:bg-green-100" 
                            onClick={() => setIsAdding(false)}
                            disabled={isSubmitting}
                        >
                            Cancelar
                        </Button>
                    </div>
                </div>
            ) : (
                <Button 
                    variant="outline" 
                    className="w-full h-8 text-[10px] border-green-200 text-green-700 hover:bg-green-50 border-dashed"
                    onClick={() => setIsAdding(true)}
                >
                    <Plus className="h-3 w-3 mr-1" /> Añadir Valor y Distribución
                </Button>
            )}
        </div>
    );
}
