import { NextRequest, NextResponse } from "next/server";
import { getGraphClient, getCachedSiteId, getCachedUserDirectory } from "@/lib/sharepoint";

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.toLowerCase();

    if (!q || q.length < 3) {
        return NextResponse.json({ users: [] });
    }

    try {
        const client = await getGraphClient();
        const siteId = await getCachedSiteId(client, 'FPKContabilidad');
        const directory = await getCachedUserDirectory(client, siteId);

        const matchedUsers = directory
            .filter(u => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
            .slice(0, 10);

        return NextResponse.json({ users: matchedUsers });
    } catch (error: any) {
        console.error("Error searching SharePoint users:", error);
        return NextResponse.json({ error: error.message, users: [] }, { status: 500 });
    }
}
