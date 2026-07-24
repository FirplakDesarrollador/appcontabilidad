import { NextResponse } from 'next/server';
import { Client } from 'pg';

export async function GET() {
    try {
        const client = new Client({ connectionString: process.env.DATABASE_URL + '?sslmode=require' });
        await client.connect();
        await client.query('ALTER TABLE public."Radicados_de_importacion" ADD COLUMN IF NOT EXISTS "ProcesadoPor" text');
        await client.query('ALTER TABLE public."Radicados_de_importacion" ADD COLUMN IF NOT EXISTS "FechaProcesado" timestamp with time zone');
        await client.query('ALTER TABLE public."Radicados_de_importacion" ADD COLUMN IF NOT EXISTS "DigitadoPor" text');
        await client.query('ALTER TABLE public."Radicados_de_importacion" ADD COLUMN IF NOT EXISTS "Procesado" text');
        await client.end();
        return NextResponse.json({ success: true });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
