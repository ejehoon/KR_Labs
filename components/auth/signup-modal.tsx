'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useState } from 'react';
import { AlertCircle } from 'lucide-react';

interface SignUpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type ErrorMessages = {
  [key: string]: string;
};

interface AuthError {
  message: string;
}

export default function SignUpModal({ isOpen, onClose }: SignUpModalProps) {
  const supabase = createClientComponentClient();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [confirmationRequired, setConfirmationRequired] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validateForm = () => {
    if (!email || !password || !confirmPassword || !displayName) {
      setError("모든 필드를 입력해주세요.");
      return false;
    }
    if (password !== confirmPassword) {
      setError("비밀번호가 일치하지 않습니다.");
      return false;
    }
    if (password.length < 6) {
      setError("비밀번호는 최소 6자 이상이어야 합니다.");
      return false;
    }
    setError(null);
    return true;
  };

  const checkEmailExists = async (email: string) => {
    try {
      const response = await fetch('/api/check-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });
      const { exists } = await response.json();
      return exists;
    } catch {
      return false;
    }
  };

  const handleSignUp = async () => {
    if (!validateForm()) return;

    try {
      setIsLoading(true);

      // 이메일 중복 체크
      const { data: existingUser } = await supabase
        .from('users')
        .select('id')
        .eq('email', email)
        .single();

      if (existingUser) {
        setError('이미 가입된 이메일입니다. 로그인을 시도해주세요.');
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          data: {
            display_name: displayName,
          }
        },
      });

      if (error) {
        if (error.message.includes('already registered')) {
          setError('이미 가입된 이메일입니다. 로그인을 시도해주세요.');
          return;
        }
        throw error;
      }

      if (data?.user) {
        setConfirmationRequired(true);
        setError(null);
      }
    } catch (error) {
      console.error('회원가입 에러:', error);
      const errorMessages: ErrorMessages = {
        'Invalid email': '유효하지 않은 이메일 주소입니다.',
        'Signup requires a valid password': '유효한 비밀번호가 필요합니다.',
        'Password should be at least 6 characters': '비밀번호는 최소 6자 이상이어야 합니다.',
        'User already registered': '이미 가입된 이메일입니다. 로그인을 시도해주세요.',
      };

      // error 타입 체크 및 처리
      const authError = error as AuthError;
      setError(
        authError.message && errorMessages[authError.message]
          ? errorMessages[authError.message]
          : '회원가입 중 오류가 발생했습니다. 다시 시도해주세요.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="text-center text-2xl font-bold">KR_Labs 회원가입</DialogTitle>
          <p className="text-center text-sm text-gray-500 mt-2">
            한국 CS 연구실 정보 플랫폼에 오신 것을 환영합니다
          </p>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-4">
          {error && (
            <div className="flex items-center gap-2 text-sm text-red-500 bg-red-50 p-3 rounded-md">
              <AlertCircle className="h-4 w-4" />
              {error}
              {error.includes('이미 가입된 이메일') && (
                <button
                  onClick={onClose}
                  className="ml-auto text-blue-600 hover:underline text-xs"
                >
                  로그인하기
                </button>
              )}
            </div>
          )}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">이름</label>
            <input
              type="text"
              placeholder="이름을 입력해주세요"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full p-2.5 text-gray-900 bg-gray-50 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">이메일</label>
            <input
              type="email"
              placeholder="university@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-2.5 text-gray-900 bg-gray-50 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">비밀번호</label>
            <input
              type="password"
              placeholder="6자 이상 입력해주세요"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-2.5 text-gray-900 bg-gray-50 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">비밀번호 확인</label>
            <input
              type="password"
              placeholder="비밀번호를 다시 입력해주세요"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full p-2.5 text-gray-900 bg-gray-50 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
            />
          </div>
          <Button
            onClick={handleSignUp}
            disabled={isLoading || confirmationRequired}
            className={`w-full py-6 mt-2 ${
              confirmationRequired 
                ? 'bg-green-600 hover:bg-green-700' 
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {isLoading ? "처리중..." : confirmationRequired ? "메일함을 확인해주세요" : "가입하기"}
          </Button>
          <p className="text-xs text-center text-gray-500 mt-4">
            가입하기 버튼을 클릭하면 KR_Labs의{' '}
            <a href="#" className="text-blue-600 hover:underline">이용약관</a>과{' '}
            <a href="#" className="text-blue-600 hover:underline">개인정보처리방침</a>에 동의하게 됩니다.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
} 