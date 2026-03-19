import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get('secret');

    // Security check using a secret in the URL
    const authHeader = request.headers.get('Authorization');
    const isCron = authHeader === `Bearer ${process.env.CRON_SECRET}`;

    if (secret !== process.env.CRON_SECRET && !isCron) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        console.log('Fetching from Supabase table: Facturas pendientes');
        // Fetch all pending invoices from Supabase
        const { data: facturas, error: fetchError, count } = await supabase
            .from('Facturas pendientes')
            .select('*', { count: 'exact' })
            .order('ID', { ascending: false });

        if (fetchError) {
            console.error('Supabase fetch error:', fetchError);
            throw fetchError;
        }

        console.log(`Fetched ${facturas?.length || 0} facturas (Count: ${count})`);

        if (!facturas || facturas.length === 0) {
            console.log('No data found in Facturas pendientes.');
            return NextResponse.json({
                message: 'No hay facturas pendientes para notificar.',
                debug: {
                    count,
                    hasData: !!facturas,
                    table: 'Facturas pendientes'
                }
            });
        }

        const totalAmount = facturas.reduce((sum, inv) => sum + Number(inv.Total || 0), 0);

        // Format Teams message (Adaptive Card for legacy Webhooks)
        const teamsPayload = {
            type: "message",
            attachments: [
                {
                    contentType: "application/vnd.microsoft.card.adaptive",
                    content: {
                        type: "AdaptiveCard",
                        body: [
                            {
                                type: "TextBlock",
                                size: "Large",
                                weight: "Bolder",
                                text: "📊 Resumen de Facturas Guardadas",
                                color: "Accent"
                            },
                            {
                                type: "FactSet",
                                facts: [
                                    { title: "Total Facturas:", value: `${facturas.length}` }
                                ],
                                spacing: "Medium"
                            },
                            {
                                type: "TextBlock",
                                text: "Detalle de facturas (Top 15):",
                                wrap: true,
                                weight: "Bolder",
                                spacing: "Large",
                                separator: true
                            },
                            ...facturas.slice(0, 15).map(f => ({
                                type: "TextBlock",
                                text: `🔸 **${f.Prefijo || ''}${f.Folio || ''}** | ${f.Nombre_Emisor || 'N/A'} | CUFE: \`${f["CUFE/CUDE"] || 'N/A'}\``,
                                wrap: true,
                                size: "Small",
                                spacing: "None"
                            })),
                            {
                                type: "ActionSet",
                                actions: [
                                    {
                                        type: "Action.OpenUrl",
                                        title: "Ver en el Sistema",
                                        url: "https://app-contabilidad-ten.vercel.app/revision-factura-dian"
                                    }
                                ],
                                spacing: "Large"
                            }
                        ],
                        $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
                        version: "1.4"
                    }
                }
            ]
        };

        const webhookUrl = process.env.TEAMS_WEBHOOK_URL;
        if (!webhookUrl) {
            throw new Error('TEAMS_WEBHOOK_URL is not defined in environment variables');
        }

        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(teamsPayload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Teams Webhook failed: ${errorText}`);
        }

        return NextResponse.json({
            success: true,
            message: 'Notificación enviada a Teams con éxito',
            notifiedCount: facturas.length,
            totalAmount: totalAmount
        });
    } catch (err: any) {
        console.error('Error in notify-teams route:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
