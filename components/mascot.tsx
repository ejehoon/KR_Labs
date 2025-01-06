'use client';

import { usePathname } from 'next/navigation';

export default function Mascot() {
  const pathname = usePathname();

  if (pathname === '/bookmarks') return null;

  return (
    <div 
      className="fixed bottom-0 right-0 w-[800px] h-[800px] hidden lg:block pointer-events-none" 
      style={{ 
        transform: 'translateX(3%) translateY(5%)',
        zIndex: 10
      }}
    >
      <img
        src="/images/mascot.png"
        alt="마스코트"
        className="absolute bottom-0 right-0 w-full h-full object-contain"
      />
    </div>
  );
} 