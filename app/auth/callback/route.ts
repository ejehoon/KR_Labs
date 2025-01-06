import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');

  if (code) {
    const supabase = createRouteHandlerClient({ cookies });
    try {
      await supabase.auth.exchangeCodeForSession(code);
      
      // 이메일 인증 완료 후 사용자 정보 업데이트
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.auth.updateUser({
          data: { email_confirmed: true }
        });
      }

      return NextResponse.redirect(requestUrl.origin);
    } catch (error) {
      console.error('Auth error:', error);
      return NextResponse.redirect(`${requestUrl.origin}?error=auth`);
    }
  }

  return NextResponse.redirect(requestUrl.origin);
} 