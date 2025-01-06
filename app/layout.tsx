import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import DrOhChat from "@/components/dr-oh/dr-oh-chat";
import { GeistSans } from 'geist/font/sans';
import LoginButton from '@/components/auth/login-button';
import Mascot from '@/components/mascot';

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
        className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased min-h-screen bg-white`}
      >
        <div className="bg-gray-50 border-b">
          <div className="absolute top-0 right-0 p-4">
            <LoginButton />
          </div>
          <div className="max-w-screen-xl mx-auto px-6 py-8">
            <div className="text-center">
              <h1 className="text-2xl font-bold text-gray-900 mb-3">
                KR_Labs: 한국 CS 연구실 순위
              </h1>
              <p className="text-gray-600 text-sm leading-relaxed max-w-3xl mx-auto">
                KR_Labs는 논문 수와 연구 분야를 기반으로 한국의 주요 CS 연구실들을 분석한 메트릭 기반 순위 시스템입니다.
              </p>
            </div>
          </div>
        </div>

        <nav className="bg-white border-b">
          <div className="px-6 py-3">
            <div className="flex items-center">
              <a 
                href="/" 
                className="text-gray-900 hover:text-gray-600 transition-colors"
              >
                <span className="text-lg font-bold">KR_Labs</span>
              </a>
              <div className="ml-6 flex gap-6">
                <a 
                  href="#" 
                  className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
                >
                  학교별
                </a>
                <a 
                  href="https://github.com/ejehoon/KR_Labs" 
                  className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Github
                </a>
                <a 
                  href="https://leejaehoon.tistory.com/entry/KRRankings-%EA%B0%9C%EB%B0%9C%EA%B8%B0-1" 
                  className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  블로그
                </a>
              </div>
            </div>
          </div>
        </nav>

        <main className="relative min-h-screen">
          {children}
          <Mascot />
          <DrOhChat />
        </main>
      </body>
    </html>
  );
}




