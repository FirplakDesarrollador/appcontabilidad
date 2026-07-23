import { NextRequest, NextResponse } from "next/server";
import { getGraphClient } from "@/lib/sharepoint";

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.toLowerCase();

    if (!q || q.length < 3) {
        return NextResponse.json({ users: [] });
    }

    try {
        const client = await getGraphClient();
        
        // Obtenemos el site ID de Firplak Contabilidad
        const siteResponse = await client.api('/sites/firplaksa.sharepoint.com:/sites/FPKContabilidad').get();
        const siteId = siteResponse.id;

        // Buscamos usuarios en SharePoint (User Information List)
        let nextLink: string | null = `/sites/${siteId}/lists('User Information List')/items?$expand=fields($select=Title,EMail)&$top=500`;
        const matchedUsers: any[] = [];

        while (nextLink && matchedUsers.length < 10) {
            const allUsers = await client.api(nextLink).get();
            
            for (const u of allUsers.value) {
                const title = u.fields?.Title || "";
                const email = u.fields?.EMail || "";
                
                if (!title || !email) continue;
                
                if (title.toLowerCase().includes(q) || email.toLowerCase().includes(q)) {
                    // Check duplicate
                    if (!matchedUsers.find(mu => mu.email === email)) {
                        matchedUsers.push({
                            name: title,
                            email: email
                        });
                    }
                }
                if (matchedUsers.length >= 10) break;
            }

            nextLink = allUsers['@odata.nextLink'] ? allUsers['@odata.nextLink'].split('v1.0')[1] : null;
        }

        return NextResponse.json({ users: matchedUsers });
    } catch (error: any) {
        console.error("Error searching SharePoint users:", error);
        return NextResponse.json({ error: error.message, users: [] }, { status: 500 });
    }
}
