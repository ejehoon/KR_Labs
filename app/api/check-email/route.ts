import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { email } = await request.json();
    const supabase = createRouteHandlerClient({ cookies });

    const { data, error } = await supabase
      .from('auth.users')
      .select('email')
      .eq('email', email)
      .single();

    if (error) {
      return NextResponse.json({ exists: false });
    }

    return NextResponse.json({ exists: Boolean(data) });
  } catch (error) {
    return NextResponse.json({ exists: false });
  }
} 