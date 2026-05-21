export type UniversityLogo = {
  alt: string;
  fallback: string;
  src?: string;
};

const universityLogos: Record<string, UniversityLogo> = {
  서강대학교: {
    alt: "서강대학교 로고",
    fallback: "서",
    src: "/school-logos/sogang-clean.png",
  },
  성균관대학교: {
    alt: "성균관대학교 로고",
    fallback: "성",
    src: "/school-logos/skku-clean.png",
  },
  한양대학교: {
    alt: "한양대학교 로고",
    fallback: "한",
    src: "/school-logos/hanyang-clean.png",
  },
};

export function getUniversityLogo(school: string): UniversityLogo {
  return universityLogos[school] ?? { alt: `${school} 로고`, fallback: school.slice(0, 1) || "K" };
}
