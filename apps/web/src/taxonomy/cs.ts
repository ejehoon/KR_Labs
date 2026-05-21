import type { ResearchTaxonomy } from "./types";

export const CS_TAXONOMY: ResearchTaxonomy = {
  slug: "cs",
  label: "컴퓨터공학",
  groups: [
    {
      id: "ai",
      label: "AI",
      defaultOpen: true,
      areas: [
        area("artificial-intelligence", "AI", "Artificial intelligence", "AI", "인공지능"),
        area("computer-vision", "컴퓨터 비전", "Computer vision", "컴퓨터비전", "시각지능", "Visual AI"),
        area("machine-learning", "머신러닝", "Machine learning", "Machine Learning", "기계학습", "머신러닝"),
        area(
          "natural-language-processing",
          "자연어처리",
          "Natural language processing",
          "Natural Language Processing",
          "NLP",
          "자연어",
          "자연어처리",
          "언어처리",
          "전산언어학",
          "Computational Linguistics",
          "Language Model",
          "언어모델",
        ),
        area("web-ir", "웹/정보검색", "The Web & information retrieval", "Information retrieval", "정보검색", "웹 검색"),
      ],
    },
    {
      id: "systems",
      label: "시스템",
      defaultOpen: true,
      areas: [
        area("computer-architecture", "컴퓨터 구조", "Computer architecture"),
        area("computer-networks", "컴퓨터 네트워크", "Computer networks", "네트워크", "Routing Protocol", "Ad-hoc"),
        area("computer-security", "컴퓨터 보안", "Computer security", "보안"),
        area("databases", "데이터베이스", "Databases", "Database", "데이터베이스"),
        area("design-automation", "설계 자동화", "Design automation"),
        area("embedded-real-time-systems", "임베디드/실시간 시스템", "Embedded & real-time systems", "Embedded", "Real-time"),
        area("high-performance-computing", "고성능 컴퓨팅", "High-performance computing", "HPC"),
        area("mobile-computing", "모바일 컴퓨팅", "Mobile computing"),
        area("measurement-performance-analysis", "성능 측정/분석", "Measurement & perf. analysis", "Performance analysis"),
        area("operating-systems", "운영체제", "Operating systems", "OS"),
        area("programming-languages", "프로그래밍 언어", "Programming languages"),
        area("software-engineering", "소프트웨어 공학", "Software engineering"),
      ],
    },
    {
      id: "theory",
      label: "이론",
      defaultOpen: false,
      areas: [
        area("algorithms-complexity", "알고리즘/복잡도", "Algorithms & complexity", "Algorithm", "계산이론", "계산복잡도"),
        area("cryptography", "암호학", "Cryptography", "Crypto"),
        area("logic-verification", "논리/검증", "Logic & verification", "Verification"),
      ],
    },
    {
      id: "interdisciplinary",
      label: "융합 분야",
      defaultOpen: true,
      areas: [
        area("bioinformatics", "바이오인포매틱스", "Comp. bio & bioinformatics", "Bioinformatics", "계산생물학"),
        area("computer-graphics", "컴퓨터 그래픽스", "Computer graphics", "Graphics"),
        area("computer-science-education", "컴퓨터과학 교육", "Computer science education", "CS education"),
        area("economics-computation", "경제/계산", "Economics & computation"),
        area("hci", "HCI", "Human-computer interaction", "Human computer interaction", "HCI"),
        area("robotics", "로보틱스", "Robotics", "Robot"),
        area("visualization", "시각화", "Visualization", "Visualisation"),
      ],
    },
    {
      id: "etc",
      label: "기타",
      defaultOpen: true,
      areas: [area("uncategorized", "미분류", "Uncategorized")],
    },
  ],
};

function area(id: string, label: string, ...matchTerms: string[]) {
  return { id, label, matchTerms };
}
