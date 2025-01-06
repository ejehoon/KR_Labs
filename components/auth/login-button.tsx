'use client';

import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { UserCircle, LogOut, Bookmark, Settings } from 'lucide-react';
import { useEffect, useState, useRef } from 'react';
import Image from 'next/image';
import LoginModal from './login-modal';
import { useRouter } from 'next/navigation';

export default function LoginButton() {
  const supabase = createClientComponentClient();
  const [user, setUser] = useState<any>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
    };

    getUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    // 드롭다운 외부 클릭 감지
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      subscription.unsubscribe();
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [supabase.auth]);

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      window.localStorage.clear();
      setShowDropdown(false);
      window.location.reload();
    } catch (error) {
      console.error('로그아웃 에러:', error);
    }
  };

  if (!user) {
    return (
      <>
        <button
          onClick={() => setShowLoginModal(true)}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <UserCircle className="w-5 h-5" />
          <span>로그인</span>
        </button>
        <LoginModal 
          isOpen={showLoginModal} 
          onClose={() => setShowLoginModal(false)} 
        />
      </>
    );
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="flex items-center gap-2 px-2 py-1 rounded-full hover:bg-gray-100 transition-colors"
      >
        {user.user_metadata?.avatar_url ? (
          <Image
            src={user.user_metadata.avatar_url}
            alt="프로필"
            width={32}
            height={32}
            className="rounded-full"
          />
        ) : (
          <UserCircle className="w-8 h-8" />
        )}
      </button>

      {showDropdown && (
        <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
          <div className="px-4 py-3 border-b border-gray-200">
            <p className="text-sm font-medium text-gray-900">
              {user.user_metadata?.display_name || user.user_metadata?.name || '사용자'}
            </p>
            <p className="text-xs text-gray-500 mt-1">{user.email}</p>
          </div>
          
          <div className="py-1">
            <button
              onClick={() => {/* 프로필 기능 추가 예정 */}}
              className="w-full flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
            >
              <UserCircle className="w-4 h-4 mr-3" />
              프로필
            </button>
            <button
              onClick={() => router.push('/bookmarks')}
              className="w-full flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
            >
              <Bookmark className="w-4 h-4 mr-3" />
              북마크
            </button>
            <button
              onClick={() => {/* 설정 기능 추가 예정 */}}
              className="w-full flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
            >
              <Settings className="w-4 h-4 mr-3" />
              설정
            </button>
          </div>

          <div className="border-t border-gray-200 py-1">
            <button
              onClick={handleLogout}
              className="w-full flex items-center px-4 py-2 text-sm text-red-600 hover:bg-gray-100"
            >
              <LogOut className="w-4 h-4 mr-3" />
              로그아웃
            </button>
          </div>
        </div>
      )}
    </div>
  );
} 