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
          background: 'linear-gradient(to bottom, #B2EBF2, #E0F7FA)'
        }}
      >
        <nav className="py-4 px-6">
          <div className="flex items-center gap-8">
            <a href="/" className="text-lg font-medium text-[#1A237E] hover:text-[#1A237E]/80 transition-colors">
              KR_Labs
            </a>
            <div className="flex gap-6 text-sm">
              <a href="#" className="text-[#1A237E]/70 hover:text-[#1A237E] transition-colors">
                학교별
              </a>
              <a href="#" className="text-[#1A237E]/70 hover:text-[#1A237E] transition-colors">
                블로그
              </a>
            </div>
          </div>
        </nav>

        <div className="relative flex min-h-screen">
          <div className="fixed inset-0 pointer-events-none opacity-50">
            <div className="cloud-bg" />
          </div>
          
          {children}
          
          <div className="fixed bottom-0 right-0 w-[800px] h-[800px] pointer-events-none" 
            style={{ 
              transform: 'translateX(3%) translateY(5%)',
              zIndex: -1
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
