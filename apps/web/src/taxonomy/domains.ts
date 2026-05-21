import type { ResearchTaxonomy } from "./types";

function area(id: string, label: string, ...matchTerms: string[]) {
  return { id, label, matchTerms: [label, ...matchTerms] };
}

export const ENGINEERING_TAXONOMY: ResearchTaxonomy = {
  slug: "engineering",
  label: "공학",
  groups: [
    {
      id: "electrical",
      label: "전자/전기",
      defaultOpen: false,
      areas: [
        area("semiconductor-circuits", "반도체/집적회로", "반도체", "집적회로", "VLSI", "회로설계", "NPU", "MEMS", "NEMS", "마이크로시스템"),
        area("rf-wireless", "RF/무선통신", "RF", "무선통신", "안테나", "마이크로파", "전파공학", "EMI", "EMC"),
        area("signal-processing", "신호처리", "Signal Processing", "신호처리", "영상처리", "음향/영상 신호처리"),
        area("medical-imaging", "의료영상", "의료 영상", "초음파 영상", "의용전자", "의료AI", "의료 AI"),
        area("control-optimization", "제어/최적화", "제어", "계측", "최적화", "시스템 모델링", "System Modeling", "Optimization"),
        area("power-energy-systems", "전력/에너지 시스템", "전력계통", "전력시스템", "HVDC", "MVDC", "전기기기", "에너지변환"),
      ],
    },
    {
      id: "mechanical",
      label: "기계공학",
      defaultOpen: false,
      areas: [
        area("mechanical-design", "기계공학", "Mechanical", "메카트로닉스", "정밀기기"),
        area("thermal-fluid-energy", "열유체/에너지", "열유체", "열전달", "유체", "에너지공학", "Thermal", "Fluid"),
        area("materials-process", "재료/공정", "재료", "나노소재", "공정공학", "Materials", "Nanomaterial"),
        area("biomechanics-biomedical", "바이오역학/의공학", "생체역학", "바이오역학", "의공학", "바이오메디컬", "Biomedical"),
        area("design-cae", "전산설계/CAE", "CAE", "전산설계", "구조최적설계", "멀티피직스", "모델기반 시뮬레이션"),
        area("robotics-engineering", "로보틱스", "Robotics", "로봇", "로봇공학", "로봇지능"),
      ],
    },
    {
      id: "chemical",
      label: "화공/소재",
      defaultOpen: false,
      areas: [
        area("chemical-engineering", "화공생명공학", "화공", "화공생명", "Chemical Engineering"),
        area("organic-electronics", "유기전자/태양전지", "유기전자", "태양전지", "Perovskite", "Photovoltaic"),
        area("catalysis-polymer", "촉매/고분자", "촉매", "고분자", "Polymer"),
      ],
    },
    {
      id: "civil-architecture",
      label: "건설/교통/건축",
      defaultOpen: false,
      areas: [
        area("civil-environmental", "건설/환경공학", "건설", "환경공학", "지반공학", "교량공학", "콘크리트공학", "수자원", "해안환경"),
        area("transportation-logistics", "교통/물류 시스템", "교통", "도로교통", "철도", "물류", "대중교통"),
        area("architecture", "건축학", "건축학", "건축설계", "건축디자인", "Architectural Design"),
        area("architecture-environment-acoustics", "건축환경/건축음향", "건축음향", "실내음향", "빛환경", "자연채광", "인공조명", "일조환경"),
      ],
    },
  ],
};

export const NATURAL_SCIENCE_TAXONOMY: ResearchTaxonomy = {
  slug: "natural-science",
  label: "자연과학",
  groups: [
    {
      id: "math-physics",
      label: "수학/물리",
      defaultOpen: false,
      areas: [
        area("mathematics", "수학", "Mathematics", "조화해석", "확률", "해석학"),
        area("math-education", "수학교육", "수학교육", "수학교육학", "Mathematics Education"),
        area("pde-topology-algebra", "해석/위상/대수", "편미분방정식", "조화해석", "위상수학", "대수기하학", "표현론", "대수적 조합론", "금융수학"),
        area("physics", "물리학", "Physics", "물리", "광학", "분광", "물성", "입자물리"),
        area("quantum", "양자", "Quantum", "양자컴퓨팅", "양자정보"),
        area("cryptography-coding", "암호/부호 이론", "암호론", "부호론", "Cryptography", "Coding Theory"),
      ],
    },
    {
      id: "chemistry",
      label: "화학",
      defaultOpen: false,
      areas: [
        area("chemistry", "화학", "Chemistry"),
        area("physical-computational-chemistry", "물리/계산화학", "물리화학", "양자화학", "계산화학", "이론화학", "Physical Chemistry", "Quantum Chemistry", "Computational Chemistry"),
        area("organic-chemistry", "유기화학", "Organic Chemistry", "유기합성", "Organic Synthesis"),
        area("inorganic-materials-chemistry", "무기/재료화학", "무기화학", "재료화학", "Materials Chemistry", "Inorganic Chemistry"),
        area("analytical-chemistry", "분석화학", "Analytical Chemistry", "질량분석", "Mass Spectrometry", "분광분석"),
        area("polymer-nano-chemistry", "고분자/나노화학", "고분자화학", "나노화학", "Polymer Chemistry", "Nanochemistry"),
        area("chemical-biology", "화학생물학", "Chemical Biology", "생화학", "Biochemistry", "단백질화학"),
        area("ai-for-science", "AI for Science", "AI4Science", "인공지능 활용", "AI 활용", "Machine Learning for Chemistry"),
      ],
    },
  ],
};

export const BIO_MEDICAL_TAXONOMY: ResearchTaxonomy = {
  slug: "bio-medical",
  label: "생명·의학",
  groups: [
    {
      id: "life-science",
      label: "생명과학",
      defaultOpen: false,
      areas: [
        area("life-science", "생명과학", "Biology", "생명공학", "바이오"),
        area("molecular-cell-biology", "분자/세포생물학", "분자생물학", "세포생물학"),
        area("microbiology-immunology", "미생물/면역", "미생물학", "면역학"),
        area("genetics-rna-protein", "유전/RNA/단백질", "유전", "RNA", "단백질"),
      ],
    },
    {
      id: "computational-bio",
      label: "계산/의생명",
      defaultOpen: false,
      areas: [
        area("bioinformatics", "바이오인포매틱스", "Bioinformatics", "계산생물학"),
        area("medical-ai", "의료 AI", "의료AI", "의료 AI", "의료영상"),
        area("biomedical-engineering", "의공학", "Biomedical", "의공학", "바이오메디컬"),
        area("food-safety-science", "식품안전/식품과학", "식품안전", "식품위생", "위해성평가", "식품영양", "Food Safety", "Food Science"),
      ],
    },
  ],
};

export const SOCIAL_BUSINESS_TAXONOMY: ResearchTaxonomy = {
  slug: "social-business",
  label: "사회과학·경영",
  groups: [
    {
      id: "business",
      label: "경영/경제",
      defaultOpen: false,
      areas: [
        area("business-management", "경영학", "경영학", "Management", "인사조직", "조직행동", "생산관리"),
        area("marketing", "마케팅", "Marketing", "마케팅"),
        area("accounting-finance", "회계/재무", "회계", "재무", "보험"),
        area("business-analytics", "데이터 분석", "Business Analytics", "Data Analytics", "빅데이터", "Big Data"),
        area("economics", "경제학", "Economics", "계량경제", "거시경제", "미시경제", "국제경제", "개발경제"),
        area("finance-ai", "금융 AI", "금융머신러닝", "AI 금융", "Financial Machine Learning", "FinTech"),
      ],
    },
    {
      id: "social-science",
      label: "사회/법/심리",
      defaultOpen: false,
      areas: [
        area("media-communication", "미디어/커뮤니케이션", "미디어", "커뮤니케이션", "신문방송"),
        area("psychology", "심리학", "Psychology", "인지심리", "발달심리", "사회심리", "상담심리", "임상심리", "조직심리"),
        area("political-science", "정치외교학", "정치학", "국제관계", "정치사상", "비교정치", "한국정치", "미국정치", "군사안보"),
        area("sociology", "사회학", "사회학", "사회운동", "조직사회학", "문화사회학", "국제이주", "시민사회"),
        area("gender-studies", "여성학/젠더", "여성학", "젠더", "Gender Studies", "Women's Studies"),
        area("area-global-studies", "글로벌/지역학", "비판적글로벌스터디즈", "Global Studies", "지역학", "동남아시아학", "아세안", "ASEAN"),
        area("law", "법학", "Law", "민법", "형법", "헌법", "상법", "행정법", "노동법", "지적재산권법"),
        area("real-estate-urban", "부동산/도시", "부동산", "도시경제", "도시", "PropTech"),
      ],
    },
  ],
};

export const HUMANITIES_ARTS_TAXONOMY: ResearchTaxonomy = {
  slug: "humanities-arts",
  label: "인문·예술",
  groups: [
    {
      id: "humanities",
      label: "인문학",
      defaultOpen: false,
      areas: [
        area("korean-studies", "한국학", "한국학", "한국정치사", "한국발전", "Korean Studies", "한류"),
        area("korean-language-literature", "국어국문학", "국어국문학", "국어학", "국문학", "국어음운론", "국어문법", "현대소설", "현대시", "고전문학"),
        area("linguistics", "언어학", "언어학", "Linguistics", "Applied Linguistics", "TESOL", "통사론", "심리언어학", "기호학"),
        area("literature", "문학", "문학", "문학비평", "영문학", "미국문학", "프랑스문학", "독일문학", "여성문학", "소설", "Drama"),
        area("history", "역사학", "역사학", "한국현대사", "중국고대사", "동양사", "미국사", "과학기술사", "환경사"),
        area("history-education", "역사교육", "역사교육", "역사적 사고", "문화유산교육"),
        area("philosophy", "철학", "철학", "Philosophy", "분석철학", "인식론", "서양철학", "중국철학", "미학"),
        area("religion", "종교학", "종교학", "종교", "신학", "그리스도교", "불교", "유교", "Islamic Studies"),
        area("cultural-studies", "문화연구", "문화연구", "문화이론", "문화유산학", "미국문화", "독일문화", "매체미학", "Ethnic Studies"),
        area("education", "교육학", "교육학", "교육사회학", "청소년사회학", "교육대학원"),
      ],
    },
    {
      id: "arts-content",
      label: "예술/콘텐츠",
      defaultOpen: false,
      areas: [
        area("art-technology", "아트&테크놀로지", "Art & Technology", "아트앤테크놀로지", "인터랙션", "미디어아트"),
        area("ai-art-content", "AI 예술/콘텐츠", "AI 음악", "AI Arts", "AI Art", "콘텐츠", "VR", "XR", "메타버스"),
        area("design-fashion-craft", "디자인/패션/공예", "서비스디자인", "금속디자인", "패션디자인", "공예", "Fashion Design", "Service Design"),
      ],
    },
  ],
};
