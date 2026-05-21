import { UserCircle } from "lucide-react";

export function SiteHeader({ onNavigateHome, onNavigateSchools }: { onNavigateHome: () => void; onNavigateSchools: () => void }) {
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <nav className="nav-left" aria-label="Primary">
          <button className="wordmark nav-button" type="button" onClick={onNavigateHome}>
            KR_Labs
          </button>
          <button className="nav-button" type="button" onClick={onNavigateSchools}>
            학교별
          </button>
          <a href="https://github.com/ejehoon/KR_Labs" target="_blank" rel="noreferrer">
            Github
          </a>
          <button className="nav-button" type="button" onClick={onNavigateHome}>
            블로그
          </button>
        </nav>
        <button className="login-button" type="button" title="Login">
          <UserCircle size={20} />
          <span>로그인</span>
        </button>
      </div>
    </header>
  );
}
