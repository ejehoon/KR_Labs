import { BookOpenText, Bookmark, CircleHelp, ClipboardCheck, GraduationCap, House, Moon, School, Sparkles } from "lucide-react";

export type MainSidebarItem = "home" | "school" | "major" | "review" | "ai" | "bookmark";

type MainSidebarProps = {
  activeItem: MainSidebarItem;
  bookmarkCount?: number;
  onNavigateHome: () => void;
  onNavigateSchools: () => void;
  onNavigateMajors: () => void;
  onNavigateReview: () => void;
  onNavigateAi: () => void;
  onNavigateBookmarks: () => void;
};

export function MainSidebar({
  activeItem,
  bookmarkCount = 0,
  onNavigateHome,
  onNavigateSchools,
  onNavigateMajors,
  onNavigateReview,
  onNavigateAi,
  onNavigateBookmarks,
}: MainSidebarProps) {
  const items = [
    { id: "home", label: "홈", icon: House, onClick: onNavigateHome, badge: undefined },
    { id: "school", label: "학교", icon: School, onClick: onNavigateSchools, badge: undefined },
    { id: "major", label: "학과", icon: BookOpenText, onClick: onNavigateMajors, badge: undefined },
    { id: "review", label: "검토", icon: ClipboardCheck, onClick: onNavigateReview, badge: undefined },
    { id: "ai", label: "학교추천AI", icon: Sparkles, onClick: onNavigateAi, badge: undefined },
    { id: "bookmark", label: "북마크", icon: Bookmark, onClick: onNavigateBookmarks, badge: bookmarkCount },
  ] as const;

  return (
    <aside className="main-sidebar" aria-label="메인 메뉴">
      <button className="main-sidebar-logo" type="button" onClick={onNavigateHome} title="KR_Labs 홈">
        <GraduationCap size={23} />
      </button>

      <nav className="main-sidebar-nav">
        {items.map((item, index) => {
          const Icon = item.icon;
          const isBookmark = item.id === "bookmark";
          return (
            <button
              className={activeItem === item.id ? "main-sidebar-item active" : "main-sidebar-item"}
              key={item.id}
              type="button"
              onClick={item.onClick}
              title={item.label}
            >
              {index === 5 && <span className="main-sidebar-divider" aria-hidden="true" />}
              <span className="main-sidebar-icon">
                <Icon size={18} />
                {isBookmark && item.badge > 0 && <span className="main-sidebar-badge">{item.badge}</span>}
              </span>
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="main-sidebar-bottom">
        <button className="main-sidebar-round" type="button" title="도움말">
          <CircleHelp size={20} />
        </button>
        <button className="main-sidebar-round" type="button" title="테마 전환">
          <Moon size={19} />
        </button>
      </div>
    </aside>
  );
}
