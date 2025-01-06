'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Mail } from 'lucide-react';
import Image from 'next/image';
import { useState } from 'react';
import SignUpModal from './signup-modal';
import { AlertCircle } from 'lucide-react';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function LoginModal({ isOpen, onClose }: LoginModalProps) {
  const supabase = createClientComponentClient();
  const [showSignUp, setShowSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleEmailLogin = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        if (error.message.includes('Invalid login credentials')) {
          setError('이메일 또는 비밀번호가 올바르지 않습니다.');
        } else if (error.message.includes('Email not confirmed')) {
          setError('이메일 인증이 완료되지 않았습니다. 이메일을 확인해주세요.');
        } else {
          throw error;
        }
        return;
      }

      if (data.user) {
        onClose();
      }
    } catch (error) {
      console.error('로그인 에러:', error);
      setError('로그인 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKakaoLogin = async () => {
    try {
      await supabase.auth.signOut();
      window.localStorage.clear();

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'kakao',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: {
            prompt: 'login'
          }
        }
      });

      if (error) throw error;
    } catch (error) {
      console.error('로그인 에러:', error);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="text-center text-2xl font-bold">로그인</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-4">
          {error && (
            <div className="flex items-center gap-2 text-sm text-red-500 bg-red-50 p-3 rounded-md">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">이메일</label>
            <input
              type="email"
              placeholder="이메일을 입력하세요"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-2.5 text-gray-900 bg-gray-50 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">비밀번호</label>
            <input
              type="password"
              placeholder="비밀번호를 입력하세요"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-2.5 text-gray-900 bg-gray-50 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
            />
          </div>

          <Button
            onClick={handleEmailLogin}
            disabled={isLoading}
            className="w-full py-6 bg-blue-600 hover:bg-blue-700"
          >
            {isLoading ? "로그인 중..." : "로그인"}
          </Button>

          <div className="relative my-2">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300"></div>
            </div>
          </div>

          <Button
            variant="outline"
            className="w-full py-6"
            onClick={handleKakaoLogin}
          >
            <Image
              src="/images/kakao-logo.png"
              alt="Kakao"
              width={24}
              height={24}
              className="mr-2"
            />
            카카오로 로그인
          </Button>

          <div className="text-center text-sm text-gray-500">
            <button 
              onClick={() => setShowSignUp(true)}
              className="text-blue-500 hover:underline"
            >
              계정이 없으신가요? 가입하기
            </button>
          </div>
        </div>
      </DialogContent>
      <SignUpModal 
        isOpen={showSignUp} 
        onClose={() => setShowSignUp(false)} 
      />
    </Dialog>
  );
} 