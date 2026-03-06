import { NextRequest, NextResponse } from 'next/server';
import { getGraphClient } from '@/lib/sharepoint';

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const query = searchParams.get('q');

        if (!query || query.length < 3) {
            return NextResponse.json({ users: [] });
        }

        const client = await getGraphClient();

        // Search users in the company tenant
        // Filter by displayName or mail or userPrincipalName
        const usersResponse = await client.api('/users')
            .filter(`startsWith(displayName,'${query}') or startsWith(userPrincipalName,'${query}') or startsWith(givenName,'${query}') or startsWith(surname,'${query}')`)
            .select('id,displayName,userPrincipalName,mail')
            .top(10)
            .get();

        const users = usersResponse.value.map((user: any) => ({
            id: user.id,
            name: user.displayName,
            email: user.mail || user.userPrincipalName
        }));

        return NextResponse.json({ users });
    } catch (error: any) {
        console.error('Error searching users:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
