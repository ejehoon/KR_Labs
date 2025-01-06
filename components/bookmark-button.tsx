'use client';

import { useState, useEffect } from 'react';
import { Bookmark } from 'lucide-react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useRouter } from 'next/navigation';

interface BookmarkButtonProps {
  professorId: string;
  onBookmarkChange?: () => void;  // 콜백 함수를 옵셔널로 변경
}

export default function BookmarkButton({ professorId, onBookmarkChange }: BookmarkButtonProps) {
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [loading, setLoading] = useState(true);
  const supabase = createClientComponentClient();
  const router = useRouter();

  useEffect(() => {
    const checkBookmarkStatus = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) {
          setLoading(false);
          return;
        }

        const { data: bookmark } = await supabase
          .from('bookmarks')
          .select('*')
          .eq('user_id', session.user.id)
          .eq('lab_id', professorId)
          .single();

        setIsBookmarked(!!bookmark);
      } catch (error) {
        console.error('북마크 상태 확인 에러:', error);
      } finally {
        setLoading(false);
      }
    };

    checkBookmarkStatus();
  }, [professorId, supabase]);

  const toggleBookmark = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        router.push('/login');
        return;
      }

      if (isBookmarked) {
        // 북마크 제거
        await supabase
          .from('bookmarks')
          .delete()
          .eq('user_id', session.user.id)
          .eq('lab_id', professorId);
      } else {
        // 북마크 추가
        await supabase
          .from('bookmarks')
          .insert([
            {
              user_id: session.user.id,
              lab_id: professorId,
            },
          ]);
      }

      setIsBookmarked(!isBookmarked);
      if (onBookmarkChange) {
        onBookmarkChange();  // 콜백 함수 호출
      }
      
    } catch (error) {
      console.error('북마크 토글 에러:', error);
    }
  };

  if (loading) return null;

  return (
    <button
      onClick={toggleBookmark}
      className={`p-1 rounded transition-colors ${
        isBookmarked 
          ? 'text-yellow-400 hover:text-yellow-500' 
          : 'text-gray-300 hover:text-gray-400'
      }`}
      title={isBookmarked ? '북마크 해제' : '북마크 추가'}
    >
      <Bookmark 
        className="h-5 w-5" 
        fill={isBookmarked ? 'currentColor' : 'none'} 
        strokeWidth={1.5}
      />
    </button>
  );
} 