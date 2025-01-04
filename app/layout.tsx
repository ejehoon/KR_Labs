import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});

const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "KR Labs - 한국 컴퓨터공학 연구실 정보",
  description: "한국 대학의 컴퓨터공학 연구실 정보를 쉽게 찾아보세요",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="light">
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased min-h-screen overflow-x-hidden`}
        style={{
          background: '#E0F7FA'
        }}
      >
        <div className="bg-[#E3F2FD] p-4 border-b border-[#1A237E]/10">
          <h1 className="text-2xl font-bold text-[#1A237E] mb-2">
            KR_Labs: 한국 컴퓨터공학 연구실 순위
          </h1>
          <p className="text-[#1A237E]/70 text-sm leading-relaxed">
            KR_Labs는 한국의 주요 컴퓨터공학 연구실들을 논문 수와 연구 분야별로 순위화한 메트릭 기반 순위 시스템입니다. 
            왼쪽의 연구 분야를 선택하거나 <span className="text-[#1A237E] font-medium">ON/OFF</span>하여 
            원하는 분야의 연구실을 찾아보세요.
          </p>
        </div>

        <nav className="bg-white/50 backdrop-blur-sm border-b border-[#1A237E]/10">
          <div className="px-6 py-2 flex items-center gap-6">
            <a 
              href="/" 
              className="text-[#1A237E] hover:text-[#1A237E]/80 transition-colors flex items-center gap-2"
            >
              <span className="text-lg font-bold">KR_Labs</span>
            </a>
            <div className="h-4 w-[1px] bg-[#1A237E]/20" />
            <div className="flex gap-4">
              <a 
                href="#" 
                className="text-sm text-[#1A237E]/70 hover:text-[#1A237E] transition-colors px-2 py-1 rounded-md"
              >
                학교별
              </a>
              <a 
                href="#" 
                className="text-sm text-[#1A237E]/70 hover:text-[#1A237E] transition-colors px-2 py-1 rounded-md"
              >
                블로그
              </a>
            </div>
          </div>
        </nav>

        <div className="relative flex min-h-screen">
          {children}
          
          <div className="fixed bottom-0 right-0 w-[800px] h-[800px] hidden lg:block" 
            style={{ 
              transform: 'translateX(3%) translateY(5%)',
              zIndex: 10
            }}>
            <img
              src="/images/mascot.png"
              alt="마스코트"
              className="absolute bottom-0 right-0 w-full h-full object-contain"
              style={{
                transform: 'scale(1)'
              }}
            />
          </div>
        </div>
      </body>
    </html>
  );
}

