export type ResearchFieldDefinition = {
  id: string;
  labelKo: string;
  labelEn?: string;
  parentId?: string;
  aliases: string[];
};

export type ResearchFieldMatch = {
  fieldId: string;
  labelKo: string;
  confidence: number;
  evidence: string[];
};

export type ResearchFieldSuggestion = {
  suggestedLabel: string;
  reason: string;
  evidence: string[];
};

export type ResearchClassificationStatus = "matched" | "new_category_candidate" | "needs_review";

export type ResearchClassification = {
  matches: ResearchFieldMatch[];
  suggestions: ResearchFieldSuggestion[];
  rejectedMatches?: ResearchFieldMatch[];
  status?: ResearchClassificationStatus;
  threshold?: number;
};

const COLLAPSE_PARENT_FIELD_IDS = new Set(["ai", "systems", "chemistry", "mechanical", "bio", "medicine"]);
export const DEFAULT_RESEARCH_MATCH_THRESHOLD = 0.7;

export const RESEARCH_FIELDS: ResearchFieldDefinition[] = [
  {
    id: "ai",
    labelKo: "AI",
    labelEn: "Artificial Intelligence",
    aliases: ["AI", "Artificial Intelligence", "인공지능", "지식공학", "Knowledge Engineering", "Intelligent/Interactive Computing", "Information & Intelligence System", "Software intelligent/interactive", "인지지능", "지능형 정보처리"],
  },
  {
    id: "ai.machine_learning",
    parentId: "ai",
    labelKo: "머신러닝",
    labelEn: "Machine Learning",
    aliases: ["Machine Learning", "ML", "머신러닝", "기계학습", "통계학습", "압축지능", "Compression Intelligence"],
  },
  {
    id: "ai.deep_learning",
    parentId: "ai.machine_learning",
    labelKo: "딥러닝",
    labelEn: "Deep Learning",
    aliases: ["Deep Learning", "딥러닝", "신경망", "Neural Network", "Neural Networks"],
  },
  {
    id: "ai.computer_vision",
    parentId: "ai",
    labelKo: "컴퓨터 비전",
    labelEn: "Computer Vision",
    aliases: ["Computer Vision", "컴퓨터비전", "컴퓨터 비전", "영상인식", "시각지능", "시각 및 지능시스템", "Visual AI", "Visual Intelligence", "비주얼 인텔리전스", "Image Recognition"],
  },
  {
    id: "ai.nlp",
    parentId: "ai",
    labelKo: "자연어처리",
    labelEn: "Natural Language Processing",
    aliases: ["NLP", "Natural Language", "Natural Language Processing", "Human Language Intelligence", "Language Intelligence", "자연어", "자연어처리", "언어처리", "언어이해", "언어 인텔리전스", "음성대화 인터페이스"],
  },
  {
    id: "ai.nlp.llm",
    parentId: "ai.nlp",
    labelKo: "LLM",
    labelEn: "Large Language Models",
    aliases: ["LLM", "Large Language Model", "Large Language Models", "언어모델", "대형언어모델", "거대언어모델", "자연어모델", "Foundation Model", "생성형 언어모델"],
  },
  {
    id: "ai.speech",
    parentId: "ai",
    labelKo: "음성/오디오 AI",
    aliases: ["음성인식", "음성", "음향 신호처리", "오디오", "Speech Recognition", "Speech", "Audio"],
  },
  {
    id: "ai.generative_ai",
    parentId: "ai",
    labelKo: "생성형 AI",
    labelEn: "Generative AI",
    aliases: ["Generative AI", "생성형AI", "생성형 AI", "생성모델", "Generative Model"],
  },
  {
    id: "ai.safety",
    parentId: "ai",
    labelKo: "AI Safety",
    aliases: ["AI Safety", "AI 안전", "안전한 AI", "Responsible AI", "Trustworthy AI"],
  },
  {
    id: "ai.multimodal",
    parentId: "ai",
    labelKo: "멀티모달 AI",
    aliases: ["Multimodal", "멀티모달", "Multi-modal", "Vision-Language", "VLM"],
  },
  {
    id: "ai.agent",
    parentId: "ai",
    labelKo: "AI Agent",
    aliases: ["AI Agent", "AI 에이전트", "에이전트", "Agentic"],
  },
  {
    id: "robotics",
    labelKo: "로보틱스",
    aliases: ["Robotics", "로보틱스", "로봇", "로봇지능"],
  },
  {
    id: "systems.networks",
    parentId: "systems",
    labelKo: "네트워크",
    aliases: ["Network", "Networks", "네트워크", "통신네트워크", "모바일 네트워크", "위성 네트워크", "차량 네트워크", "Mobile Computing", "모바일 컴퓨팅", "인터넷", "Routing Protocol", "Ad-hoc Routing", "Ad-hoc"],
  },
  {
    id: "systems.architecture",
    parentId: "systems",
    labelKo: "컴퓨터 구조",
    aliases: ["Computer Architecture", "컴퓨터 구조", "컴퓨터 아키텍처", "컴퓨터 아키텍쳐", "아키텍처", "아키텍쳐", "메모리 시스템", "시스템 및 메모리 신뢰성", "고속 컴퓨팅", "고속컴퓨팅", "Memory System", "Memory Systems", "DRAM", "SSD", "Soft Error", "Soft Error Rate", "High speed I/O", "High-speed I/O"],
  },
  {
    id: "systems.embedded",
    parentId: "systems",
    labelKo: "임베디드 시스템",
    aliases: ["Embedded", "임베디드", "임베디드 시스템", "SoC", "SOC"],
  },
  {
    id: "systems.database",
    parentId: "systems",
    labelKo: "데이터베이스",
    aliases: ["Database", "Databases", "데이터베이스", "DBMS"],
  },
  {
    id: "software_engineering",
    labelKo: "소프트웨어 공학",
    aliases: ["Software Engineering", "소프트웨어 공학", "소프트웨어 엔지니어링", "프로그램 분석", "프로그래밍 언어", "Programming Language"],
  },
  {
    id: "graphics",
    labelKo: "컴퓨터 그래픽스",
    aliases: ["Computer Graphics", "컴퓨터 그래픽스", "그래픽스", "시각표현", "Visualization", "시각화"],
  },
  {
    id: "data_science.analytics",
    labelKo: "데이터 분석",
    aliases: ["Data Analytics", "데이터 분석", "Data Science", "데이터 사이언스", "Business Analytics", "Decision Analysis", "빅데이터", "Big Data"],
  },
  {
    id: "systems",
    labelKo: "시스템",
    aliases: ["컴퓨팅 시스템", "컴퓨터 시스템", "AI 시스템", "인공지능 시스템", "시스템 소프트웨어", "운영체제"],
  },
  {
    id: "systems.distributed",
    parentId: "systems",
    labelKo: "분산시스템",
    aliases: ["Distributed", "분산", "분산 컴퓨팅", "클라우드", "Cloud"],
  },
  {
    id: "systems.high_performance",
    parentId: "systems",
    labelKo: "고성능 컴퓨팅",
    aliases: ["High Performance", "HPC", "고성능", "GPU", "가속", "병렬"],
  },
  {
    id: "systems.security",
    parentId: "systems",
    labelKo: "보안",
    aliases: ["Security", "보안", "정보보호", "암호", "Privacy", "프라이버시"],
  },
  {
    id: "theory.crypto",
    labelKo: "암호/부호 이론",
    aliases: ["암호론", "암호", "부호론", "Coding Theory", "Cryptography"],
  },
  {
    id: "theory.computation",
    labelKo: "계산이론",
    aliases: ["계산이론", "Theory of Computation", "Computability", "Complexity Theory", "계산복잡도"],
  },
  {
    id: "theory.algorithms",
    labelKo: "알고리즘",
    aliases: ["알고리즘", "Algorithm", "Algorithms", "Algorithm Design", "Computational Geometry", "계산기하", "자료구조"],
  },
  {
    id: "electronics.semiconductor",
    labelKo: "반도체/집적회로",
    aliases: ["반도체", "집적회로", "IC", "VLSI", "디지털 회로", "아날로그 회로", "혼성신호", "회로설계", "회로 설계", "SoC 설계", "SOC 디자인", "System-on-Chip", "Low Power", "디지털시스템설계", "고속디지털시스템설계", "Reliable analog", "mixed-signal", "Digitally-assisted analog", "Low-distortion", "low-noise circuits", "High-speed I/O", "High speed I/O", "박막트랜지스터", "투명전극", "박막", "나노소자", "Nano/Semiconductor", "Semiconductor Device", "Memory Devices", "Logic Devices", "나노전자소자", "정보통신소자", "MEMS", "NEMS", "마이크로시스템"],
  },
  {
    id: "electronics",
    labelKo: "전기전자공학",
    aliases: ["전자공학", "전기전자", "전기공학", "Electrical Engineering", "Electronics"],
  },
  {
    id: "electronics.display",
    labelKo: "디스플레이/광전자",
    aliases: ["디스플레이", "Display", "광전자", "Optoelectronics", "Photonics", "Nanophotonics", "Confined Photons", "나노광전자", "광소자"],
  },
  {
    id: "electronics.rf",
    labelKo: "RF/무선통신",
    aliases: ["RF", "마이크로파", "안테나", "무선통신", "이동무선통신", "모바일 커뮤니케이션", "Mobile Communication", "Mobile Communications", "6G", "5G", "위성통신", "전파공학", "EMI", "EMC", "Communications", "Wireless Communication", "통신"],
  },
  {
    id: "electronics.control",
    labelKo: "제어/계측",
    aliases: ["Control Systems", "제어", "계측", "최적화응용", "Optimization", "최적화", "시스템 모델링", "System Modeling"],
  },
  {
    id: "electronics.power_energy_systems",
    labelKo: "전력/에너지 시스템",
    aliases: ["전력시스템", "전력 시스템", "전력계통", "Power System", "Power Systems", "HVDC", "MVDC", "전력기기", "전기기기", "에너지변환", "에너지 변환", "에너지디바이스", "Energy Device", "Energy Devices", "수요반응", "전력품질", "전력설비", "Energy Conversion"],
  },
  {
    id: "signal_processing",
    labelKo: "신호처리",
    aliases: ["Signal Processing", "신호처리", "영상처리", "음향/영상 신호처리", "지능형 신호처리"],
  },
  {
    id: "medical_imaging",
    labelKo: "의료영상",
    aliases: ["의료영상", "의료 영상", "초음파 영상", "의용전자", "의료AI", "의료 AI"],
  },
  {
    id: "mechanical",
    labelKo: "기계공학",
    aliases: ["기계공학", "Mechanical", "메카트로닉스", "기계설계", "융합설계", "정밀기기", "동역학", "구조역학", "고체역학", "재료역학"],
  },
  {
    id: "mechanical.thermal_fluid",
    parentId: "mechanical",
    labelKo: "열유체/에너지",
    aliases: ["열유체", "열전달", "유체", "에너지공학", "Energy", "Thermal", "Fluid"],
  },
  {
    id: "mechanical.materials",
    parentId: "mechanical",
    labelKo: "재료/공정",
    aliases: ["재료", "소재", "나노소재", "나노물성", "공정공학", "Materials", "Material", "Nanomaterial", "Electron Microscopy", "세라믹공정", "전자소재", "분자전자현미경", "기능성혁신소재", "트라이볼로지", "Tribology", "이차전지", "배터리", "Battery"],
  },
  {
    id: "mechanical.biomechanics",
    parentId: "mechanical",
    labelKo: "바이오역학/의공학",
    aliases: ["생체역학", "바이오역학", "의공학", "바이오메디컬", "Biomechanics", "Biomedical", "생체인공근육", "생체모방", "자가구동인공근육"],
  },
  {
    id: "mechanical.design_cae",
    parentId: "mechanical",
    labelKo: "전산설계/CAE",
    aliases: ["CAE", "전산설계", "구조최적설계", "차량구조최적설계", "내진 및 최적설계", "내진 최적설계", "멀티피직스", "모델기반 시뮬레이션", "모델기반시뮬레이션", "전산실험계획", "대체모델기반최적설계", "다분야통합최적설계", "Cyber-Physical 모델기반"],
  },
  {
    id: "chemical_engineering",
    labelKo: "화공생명공학",
    aliases: ["화공", "화공생명", "Chemical Engineering", "유기전자", "태양전지", "Perovskite", "Photovoltaic", "촉매", "고분자", "Catalysis"],
  },
  {
    id: "civil_environmental",
    labelKo: "건설/환경공학",
    aliases: ["건설", "건축시공", "건설관리", "구조및지반공학", "지반공학", "교량공학", "콘크리트공학", "내진공학", "수자원", "환경공학", "환경학", "수질환경", "수질분석", "수질오염", "환경위해성", "환경 위해성", "유해물질관리", "유해물질 관리", "수생생태계", "수생 생태계", "환경 미생물", "기후변화", "해안환경", "건축환경", "스마트건설", "연안해양공학", "연안 재해", "연안탐사공학", "해안침식", "해양에너지", "Geotechnical", "Construction Management"],
  },
  {
    id: "civil_environmental.transportation_logistics",
    parentId: "civil_environmental",
    labelKo: "교통/물류 시스템",
    aliases: ["교통", "교통공학", "교통시스템", "교통 시스템", "도로교통", "교통시설", "교통운영", "교통운영관리", "교통영향평가", "교통안전", "교통정보", "교통정책", "교통경제", "화물교통", "철도", "궤도교통", "철도수요", "대중교통", "지능형 교통시스템", "교통류", "물류"],
  },
  {
    id: "architecture.environment_acoustics",
    parentId: "architecture",
    labelKo: "건축환경/건축음향",
    aliases: ["건축음향", "실내음향", "건축물 소음진동", "소음진동", "사운드스케이프", "입체음향", "빛환경", "자연채광", "인공조명", "일조환경", "Radiance"],
  },
  {
    id: "architecture",
    labelKo: "건축학",
    aliases: ["건축학", "건축설계", "건축디자인", "건축이론", "근대건축", "Architectural Design"],
  },
  {
    id: "industrial_engineering",
    labelKo: "산업공학",
    aliases: ["산업공학", "시스템경영공학", "제조/인간공학", "인간공학", "품질/생산성", "통계적 공정관리", "품질개선", "프로젝트 매니지먼트", "공급망관리", "생산운영", "SCM", "Supply Chain", "정보통신경영", "서비스공학", "e-manufacturing", "Technometrics", "Industrial Engineering", "Ergonomics"],
  },
  {
    id: "chemistry",
    labelKo: "화학",
    aliases: ["화학", "Chemistry"],
  },
  {
    id: "chemistry.physical",
    parentId: "chemistry",
    labelKo: "물리/계산화학",
    aliases: [
      "물리화학",
      "물리화 학",
      "Physical Chemistry",
      "양자화학",
      "Quantum Chemistry",
      "계산화학",
      "Computational Chemistry",
      "이론화학",
      "Theoretical Chemistry",
      "분자동역학",
      "Molecular Dynamics",
      "전자구조",
      "Electronic Structure",
      "DFT",
    ],
  },
  {
    id: "chemistry.organic",
    parentId: "chemistry",
    labelKo: "유기화학",
    aliases: ["유기화학", "Organic Chemistry", "유기합성", "Organic Synthesis", "천연물합성", "Natural Product Synthesis"],
  },
  {
    id: "chemistry.inorganic_materials",
    parentId: "chemistry",
    labelKo: "무기/재료화학",
    aliases: ["무기화학", "Inorganic Chemistry", "재료화학", "Materials Chemistry", "고체화학", "나노소재화학"],
  },
  {
    id: "chemistry.analytical",
    parentId: "chemistry",
    labelKo: "분석화학",
    aliases: ["분석화학", "Analytical Chemistry", "질량분석", "Mass Spectrometry", "분광분석", "센서", "Sensor"],
  },
  {
    id: "chemistry.polymer_nano",
    parentId: "chemistry",
    labelKo: "고분자/나노화학",
    aliases: ["고분자화학", "고분자", "Polymer Chemistry", "Polymer", "나노화학", "Nanochemistry", "나노구조", "Nanostructure", "Nanomaterial"],
  },
  {
    id: "chemistry.chemical_biology",
    parentId: "chemistry",
    labelKo: "화학생물학",
    aliases: ["화학생물학", "Chemical Biology", "생화학", "Biochemistry", "단백질화학", "Protein Chemistry"],
  },
  {
    id: "chemistry.ai_for_science",
    parentId: "chemistry",
    labelKo: "AI for Science",
    aliases: ["AI for Science", "AI4Science", "인공지능 활용", "AI 활용", "Machine Learning for Chemistry", "AI Chemistry", "Computational Materials"],
  },
  {
    id: "physics",
    labelKo: "물리학",
    aliases: ["물리", "Physics", "양자", "Quantum", "광학", "Optics", "분광", "Spectroscopy", "물성", "입자물리", "플라즈마", "핵융합", "홀로그래피", "천체입자", "Spin Dynamics", "초전도", "Superconductivity", "Magnetism", "Heavy Electron", "High Tc"],
  },
  {
    id: "mathematics",
    labelKo: "수학",
    aliases: ["수학", "Mathematics", "해석학", "Mathematical Analysis", "확률", "Probability", "통계수학", "편미분방정식", "Partial Differential Equation", "PDE", "조화해석", "조화해석학", "위상수학", "위상기하학", "대수적위상수학", "대수기하학", "표현론", "대수적 조합론", "금융수학"],
  },
  {
    id: "statistics",
    labelKo: "통계학",
    aliases: ["통계학", "Statistics", "통계", "표본조사론", "표본조사", "시계열", "다변량자료분석", "다변량 자료분석", "보험통계", "응용통계", "확률과정"],
  },
  {
    id: "education.math",
    labelKo: "수학교육",
    aliases: ["수학교육", "수학교육학", "Mathematics Education"],
  },
  {
    id: "bio",
    labelKo: "생명과학",
    aliases: ["생명과학", "생명공학", "Biology", "Biotechnology", "생물다양성", "생물 다양성", "생태독성", "생태 군집", "Biodiversity", "Ecology", "Ecotoxicology", "분자생물학", "세포생물학", "미생물학", "면역학", "유전", "RNA", "단백질", "식물분자", "대사염증", "Structural Biology", "분자구조생물학", "구조생물학", "Cell Biology", "Bacteriophage", "Phage", "biosensor", "biosenser", "Aeromonas", "bacteria", "균주"],
  },
  {
    id: "bio.nanoscience",
    parentId: "bio",
    labelKo: "나노바이오/나노과학",
    aliases: ["나노과학", "나노융합", "나노바이오", "NanoBio", "Nanoscience", "Nanoscale", "나노 소재 및 신개념 응용 소자"],
  },
  {
    id: "medicine",
    labelKo: "의학/의생명",
    aliases: ["의학", "Medicine", "Biomedical", "의생명", "질환", "disease", "diseases", "Clinical"],
  },
  {
    id: "medicine.neuroscience",
    parentId: "medicine",
    labelKo: "신경과학",
    aliases: ["Neuroscience", "Neurological", "Neuropharmacology", "Neurophysiology", "NeuroRegeneration", "Neuron", "신경", "도파민", "알츠하이머", "Parkinson", "Alzheimer"],
  },
  {
    id: "medicine.cancer",
    parentId: "medicine",
    labelKo: "암/종양",
    aliases: ["Cancer", "Tumor", "Tumour", "Oncology", "Metastasis", "종양", "암전이", "암 치료", "암의", "Cancer Metabolism"],
  },
  {
    id: "medicine.pharmacology",
    parentId: "medicine",
    labelKo: "약리/약학",
    aliases: ["Pharmacology", "Pharmacokinetics", "Drug Delivery", "Toxicology", "약리학", "약동", "약력학", "약물학", "약물전달", "독성학", "제제학", "약제학", "생리학", "생약학", "임상약학", "사회약학", "임상실무실습", "의약품분석학", "생물약제학", "분자독성학", "바이오의약", "독성단백체학", "병태생리학"],
  },
  {
    id: "food_safety_science",
    labelKo: "식품안전/식품과학",
    aliases: ["식품안전", "식품 안전", "식품과학", "식품영양", "식품위생", "위해성평가", "미생물 위해성평가", "위해물질", "식품 독성", "식품독성", "기능성 물질", "잔류성유기오염물질", "인체 위해도", "생태계 위해도", "Food Safety", "Food Science"],
  },
  {
    id: "medicine.regenerative",
    parentId: "medicine",
    labelKo: "재생의학/줄기세포",
    aliases: ["Regenerative Medicine", "Stem Cell", "Stem Cells", "Cell Therapy", "Tissue Engineering", "줄기세포", "세포치료", "조직공학", "조직재생", "재생의학"],
  },
  {
    id: "medicine.infectious_immunity",
    parentId: "medicine",
    labelKo: "감염/면역",
    aliases: ["Infection", "Infectious", "Immunity", "Immunology", "Immunopathology", "Virology", "Bacteriology", "Pathogen", "Antimicrobial", "감염", "면역", "바이러스", "세균", "항생제", "병원체"],
  },
  {
    id: "medicine.genomics",
    parentId: "medicine",
    labelKo: "유전체/정밀의학",
    aliases: ["Genomics", "Genome", "Genome Editing", "CRISPR", "Precision Medicine", "유전체", "유전자교정", "정밀의학", "Digital Health", "디지털헬스"],
  },
  {
    id: "medicine.public_health",
    parentId: "medicine",
    labelKo: "보건/역학",
    aliases: ["Public Health", "Health Policy", "Epidemiology", "Preventive Medicine", "보건정책", "예방의학", "질병통계", "감염 및 환경역학", "약물역학", "유방암 역학"],
  },
  {
    id: "medicine.nursing",
    parentId: "medicine",
    labelKo: "간호학",
    aliases: ["Nursing", "간호학", "간호", "노인간호", "성인간호", "중환자간호", "급성기환자간호", "지역사회간호", "간호교육"],
  },
  {
    id: "medicine.forensic",
    parentId: "medicine",
    labelKo: "법의학/과학수사",
    aliases: ["Forensic Medicine", "Forensic Science", "Digital Forensic", "Forensic Pathology", "법의학", "법과학", "과학수사", "디지털포렌식"],
  },
  {
    id: "sports_science",
    labelKo: "스포츠과학",
    aliases: ["스포츠과학", "체육학", "운동영양학", "스포츠사회학", "체육측정평가", "운동생리", "스포츠마케팅", "Sports Science", "Exercise Physiology"],
  },
  {
    id: "business.finance_ai",
    labelKo: "금융 AI",
    aliases: ["금융머신러닝", "AI 금융", "Finance AI", "Financial Machine Learning", "FinTech"],
  },
  {
    id: "humanities.media_communication",
    labelKo: "미디어/커뮤니케이션",
    aliases: ["미디어", "커뮤니케이션", "신문방송", "언론정보", "공공외교", "저널리즘", "Journalism", "PR", "Public Relations", "Public Communication"],
  },
  {
    id: "humanities.korean_studies",
    labelKo: "한국학",
    aliases: ["한국학", "한국정치사", "한국발전", "한류", "Hallyu", "Korean Studies", "Culture-Shifting AI", "문화번역"],
  },
  {
    id: "humanities.korean_language_literature",
    labelKo: "국어국문학",
    aliases: ["국어국문학", "국어학", "국문학", "국어음운론", "국어문법", "국어문법론", "국어문법사", "국어형태론", "방언학", "구비문학", "고전문학", "고전서사학", "고전산문", "현대소설", "현대소설론", "현대시", "문장론", "국어교육"],
  },
  {
    id: "humanities.linguistics",
    labelKo: "언어학",
    aliases: ["언어학", "일반언어학", "Linguistics", "Applied Linguistics", "Second Language Acquisition", "TESOL", "통사론", "형태론", "음운론", "음운사", "문법화", "언어유형론", "비교문법", "불어학", "독어학", "스페인어학", "스페인어사", "일본어학", "중국문자학", "중국현대어법", "중국음운학", "남슬라브어학", "슬라브어", "심리언어학", "인지과학", "기호학", "Semiotique", "Psycholinguistics", "Translanguaging"],
  },
  {
    id: "humanities.literature",
    labelKo: "문학",
    aliases: ["문학", "문학비평", "문학이론", "영문학", "영미소설", "영국소설", "미국문학", "미국 문학", "영국문학", "British and American Drama", "프랑스문학", "프랑스어권 문학", "프랑스 소설", "불문학", "독일문학", "독일문학사", "독문학", "여성문학", "낭만주의", "희곡", "연극학", "루마니아시", "British Fiction", "Drama", "Fiction", "World Literature", "Life Writing", "African American Literature", "Lit. & Film", "영국소설", "미국소설"],
  },
  {
    id: "humanities.history",
    labelKo: "역사학",
    aliases: ["역사학", "역사", "한국현대사", "한국고중세사", "한국근현대사", "한국고대사", "한국근대사", "중국근현대사", "중국고중세사", "중국고대사", "중국중세사", "중국 송대사", "동양사", "동양중세사", "미국사", "프랑스사", "유럽통합사", "독일현대사", "폴란드 역사", "이민사", "사상사", "기록학", "과학기술사", "환경사", "사회과학사", "발전과 근대화의 역사"],
  },
  {
    id: "humanities.philosophy",
    labelKo: "철학",
    aliases: ["철학", "Philosophy", "분석철학", "인식론", "Kant", "German Idealism", "Korean Philosophy", "서양중세 철학", "서양고대철학", "서양철학", "중국고대철학", "중국철학", "도가철학", "사회철학", "미학"],
  },
  {
    id: "humanities.religion",
    labelKo: "종교학",
    aliases: ["종교학", "종교", "종교교육학", "종교인류사회학", "종교 인류학", "한국종교", "샤머니즘", "신학", "조직신학", "그리스도교", "불교", "선불교", "유교", "신유학", "Islamic Studies", "Qur’anic Studies", "Popular Religion", "비교신비주의", "종교간 대화"],
  },
  {
    id: "humanities.cultural_studies",
    labelKo: "문화연구",
    aliases: ["문화연구", "문화이론", "문화유산학", "문화콘텐츠", "문화기술", "기억정치", "유네스코", "미국문화", "독일문화", "영화이론", "영화학", "Film Studies", "매체미학", "문화사회학", "문화", "Ethnic Studies", "cultural citizenship", "Sociocultural constructions of identity"],
  },
  {
    id: "humanities.translation_interpreting",
    labelKo: "번역·통역학",
    aliases: ["번역학", "통역학", "통역번역학", "통역번역", "번역/통역", "번역 연구", "번역비평", "번역윤리", "동시통역", "통역윤리", "Translation Studies", "Interpreting Studies", "Translation", "Interpreting", "KFLT"],
  },
  {
    id: "area_studies.global",
    labelKo: "글로벌/지역학",
    aliases: ["비판적글로벌스터디즈", "Global Studies", "지역학", "동남아시아학", "동남아시아", "중앙아시아", "몽골학", "튀르키예", "아세안", "ASEAN", "중국정치", "동양미술사"],
  },
  {
    id: "education.history",
    labelKo: "역사교육",
    aliases: ["역사교육", "역사적 사고", "역사적사고", "역사탐구", "문화유산교육", "역사문해력"],
  },
  {
    id: "education",
    labelKo: "교육학",
    aliases: ["교육학", "교육사회학", "청소년사회학", "교육대학원", "교육정책", "교육 행정", "교육정책 및 행정", "교육공학", "교육심리", "교육과정", "교재", "교과서", "비교교육", "외국어로서의", "Second/Foreign Language Education", "Language Education", "Second Language Writing"],
  },
  {
    id: "creative.ai_art",
    labelKo: "AI 예술/콘텐츠",
    aliases: ["AI 음악", "AI Arts", "AI Art", "AI 콘텐츠", "가상융합", "VR", "XR", "메타버스"],
  },
  {
    id: "creative.design_fashion_craft",
    labelKo: "디자인/패션/공예",
    aliases: ["서비스디자인", "디자인 씽킹", "금속디자인", "금속조형디자인", "테이블웨어", "리빙디자인", "패션디자인", "에코패션디자인", "니트패션디자인", "소셜패션디자인", "Fashion Design", "Service Design"],
  },
  {
    id: "management.technology",
    labelKo: "기술경영",
    aliases: ["기술경영", "MOT", "Technology Management", "R&D Management", "Technology Intelligence", "Technological change", "innovation", "Patent mining", "Product-service system", "Design-by-analogy"],
  },
  {
    id: "real_estate",
    labelKo: "부동산/도시",
    aliases: ["부동산", "Real Estate", "PROPTECH", "PropTech", "Urban Economics", "도시경제", "도시", "프롭테크"],
  },
  {
    id: "business.management",
    labelKo: "경영학",
    aliases: ["경영학", "경영", "Management", "경영전략", "마케팅", "회계", "재무", "국제경영", "조직관리", "조직행동", "인사조직", "생산관리", "생산운영", "공급망관리", "서비스 매니지먼트", "경영과학", "의사결정", "지능형의사결정시스템", "Decision Science", "Decision Support"],
  },
  {
    id: "business.tourism_hospitality",
    labelKo: "관광/호스피탈리티",
    aliases: ["관광", "관광학", "관광경영", "호텔", "호텔경영", "Hospitality", "Tourism", "Leisure", "레져", "레저", "컨벤션", "전시경영", "조리외식", "외식경영", "와인", "소믈리에"],
  },
  {
    id: "economics",
    labelKo: "경제학",
    aliases: ["경제학", "Economics", "계량경제", "거시경제", "미시경제", "국제경제", "국제금융", "국제금융론", "개발경제", "산업조직", "이슬람 경제"],
  },
  {
    id: "political_science",
    labelKo: "정치외교학",
    aliases: ["정치외교학", "정치학", "국제관계", "국제기구", "국제개발협력", "정치사상", "정치경제", "비교정치", "지역정치", "유럽 정치", "민주주의", "군사안보", "국제안보", "외교정책", "한국정치", "민족주의", "정치심리", "미국정치", "복지정치", "권위주의", "재분배"],
  },
  {
    id: "public_policy_administration",
    labelKo: "공공정책/행정",
    aliases: ["정책학", "정책수단", "공공정책", "공공평가", "증거기반", "정책 개선", "정책평가", "행정학", "공공행정", "재정학", "재정관리", "성과관리", "인사행정", "조직행태", "정부규제", "Public Policy", "Public Administration", "거버넌스", "공공거버넌스", "Global Governance"],
  },
  {
    id: "sociology",
    labelKo: "사회학",
    aliases: ["사회학", "Sociology", "사회 통계학", "발전론", "조직사회학", "국제이주", "시민사회", "사회운동", "세대사회학", "교육사회학", "청소년사회학", "질적연구방법론", "탈/분단 사회", "이주", "citizenship"],
  },
  {
    id: "social_welfare",
    labelKo: "사회복지",
    aliases: ["사회복지", "사회복지행정", "아동복지", "노인복지", "복지정책", "복지", "Social Welfare"],
  },
  {
    id: "gender_studies",
    labelKo: "여성학/젠더",
    aliases: ["여성학", "젠더", "Gender Studies", "Women’s Studies", "Women's Studies"],
  },
  {
    id: "law",
    labelKo: "법학",
    aliases: ["법학", "Law", "민법", "형법", "형사법", "헌법", "상법", "행정법", "노동법", "지적재산권법", "경제법", "법사회학"],
  },
  {
    id: "psychology",
    labelKo: "심리학",
    aliases: ["심리학", "Psychology", "인지심리", "발달심리", "사회심리", "상담심리", "임상심리", "조직심리", "지각심리"],
  },
  {
    id: "creative.art_technology",
    labelKo: "아트&테크놀로지",
    aliases: ["Art & Technology", "아트&테크놀로지", "아트앤테크놀로지", "인터랙션", "미디어아트", "Immersive", "Holography", "Human Computer Interaction", "Human-computer interaction", "HCI", "User eXperience", "UI/UX"],
  },
];

function normalize(input: string): string {
  return input
    .toLowerCase()
    .replace(/([가-힣])\s+([가-힣])/g, "$1$2")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function classifyResearchText(
  text: string,
  options: { minConfidence?: number } = {},
): ResearchClassification {
  const threshold = options.minConfidence ?? DEFAULT_RESEARCH_MATCH_THRESHOLD;
  const normalizedText = normalize(stripNonResearchText(text));
  const matches = RESEARCH_FIELDS.flatMap((field) => {
    const evidence = field.aliases.filter((alias) => {
      const normalizedAlias = normalize(alias);
      if (!normalizedAlias) {
        return false;
      }
      const pattern = /[a-z0-9]/i.test(normalizedAlias)
        ? new RegExp(`(^|[^a-z0-9])${escapeRegExp(normalizedAlias)}([^a-z0-9]|$)`, "i")
        : new RegExp(escapeRegExp(normalizedAlias), "i");
      return pattern.test(normalizedText);
    });

    if (evidence.length === 0) {
      return [];
    }
    if (shouldSuppressMatch(field, evidence, normalizedText)) {
      return [];
    }

    const hasSpecificEvidence = evidence.some((alias) => normalize(alias).length >= 5);
    const confidence = Math.min(0.95, 0.45 + evidence.length * 0.18 + (field.parentId ? 0.08 : 0) + (hasSpecificEvidence ? 0.08 : 0));

    return [
      {
        fieldId: field.id,
        labelKo: field.labelKo,
        evidence,
        confidence,
      },
    ];
  }).sort((a, b) => b.confidence - a.confidence || b.evidence.length - a.evidence.length);

  const collapsedMatches = collapseBroadParentMatches(matches);
  const acceptedMatches = collapsedMatches.filter((match) => match.confidence >= threshold).slice(0, 5);
  const rejectedMatches = collapsedMatches.filter((match) => match.confidence < threshold).slice(0, 5);
  const suggestions = buildSuggestions(text, acceptedMatches);
  const status: ResearchClassificationStatus = acceptedMatches.length > 0
    ? "matched"
    : suggestions.length > 0
      ? "new_category_candidate"
      : "needs_review";

  return {
    matches: acceptedMatches,
    suggestions,
    rejectedMatches,
    status,
    threshold,
  };
}

function collapseBroadParentMatches(matches: ResearchFieldMatch[]): ResearchFieldMatch[] {
  return matches.filter((match) => {
    if (!COLLAPSE_PARENT_FIELD_IDS.has(match.fieldId)) {
      return true;
    }
    return !matches.some((otherMatch) => isDescendantField(otherMatch.fieldId, match.fieldId));
  });
}

function isDescendantField(fieldId: string, possibleAncestorId: string): boolean {
  let field = RESEARCH_FIELDS.find((candidate) => candidate.id === fieldId);
  while (field?.parentId) {
    if (field.parentId === possibleAncestorId) {
      return true;
    }
    field = RESEARCH_FIELDS.find((candidate) => candidate.id === field?.parentId);
  }
  return false;
}

function stripNonResearchText(text: string): string {
  return text
    .replace(/\s*(?:담당과목|담당 과목|교과목|강의과목|Teaching|Courses?)\s*[:：][\s\S]*$/i, "")
    .replace(/\s*(?:Education|학\s*력|경\s*력|약\s*력|TEL|E-?mail)\s*[:：][\s\S]*$/i, "")
    .trim();
}

function shouldSuppressMatch(field: ResearchFieldDefinition, evidence: string[], normalizedText: string): boolean {
  if (field.id === "ai" && evidence.every((alias) => normalize(alias) === "ai")) {
    const humanitiesContext = /한국학|한류|문화번역|문화정치|정치학|지역학|담론|문학|철학|종교|역사|사회학|법학|korean studies|hallyu|culture-shifting/.test(normalizedText);
    const technicalAiContext = /인공지능|artificial intelligence|머신러닝|기계학습|딥러닝|신경망|자연어|언어모델|llm|컴퓨터\s*비전|비전|데이터\s*과학|알고리즘|로보틱스|생성형|ai\s*(model|system|agent|safety|robot|vision)|ai[- ]?(based|powered)|의료\s*ai|금융\s*ai/.test(normalizedText);
    return humanitiesContext && !technicalAiContext;
  }
  if (field.id === "ai" && evidence.every((alias) => ["ai", "인공지능", "artificial intelligence"].includes(normalize(alias)))) {
    return /인공지능활용|ai 활용|ai for science|ai4science|machine learning for chemistry|ai chemistry/.test(normalizedText);
  }
  if (field.id === "physics" && evidence.every((alias) => ["물리", "양자", "quantum"].includes(normalize(alias)))) {
    return /물리화학|양자화학|physical chemistry|quantum chemistry/.test(normalizedText);
  }
  if (field.id === "chemistry" && evidence.every((alias) => normalize(alias) === "화학")) {
    return hasOnlyIncidentalChemistryContext(normalizedText);
  }
  if (field.id === "chemistry.analytical" && evidence.every((alias) => ["센서", "sensor"].includes(normalize(alias)))) {
    const analyticalContext = /분석화학|analytical chemistry|질량분석|mass spectrometry|분광분석|chromatography|spectrometry/.test(normalizedText);
    const engineeringSensorContext = /전자|전기|로봇|제어|계측|통신|신호|시스템|semiconductor|circuit|robot|control|wireless|rf|iot|device/.test(normalizedText);
    return engineeringSensorContext && !analyticalContext;
  }
  if (field.id === "humanities.linguistics" && evidence.every((alias) => normalize(alias) === "인지과학")) {
    const linguisticsContext = /언어학|linguistics|자연어|natural language|nlp|언어처리|언어이해|음성|speech/.test(normalizedText);
    const technicalContext = /그래픽스|컴퓨터비전|비전|hci|human computer interaction|인공지능|ai|머신러닝|기계학습|로봇/.test(normalizedText);
    return technicalContext && !linguisticsContext;
  }
  if (field.id === "humanities.literature" && evidence.every((alias) => normalize(alias) === "시")) {
    return !/문학|현대시|시문학|poetry|poem|literature|fiction|drama|희곡|소설|비평/.test(normalizedText);
  }
  if (field.id === "business.tourism_hospitality" && evidence.every((alias) => normalize(alias) === "와인")) {
    return !/관광|호텔|외식|조리|소믈리에|hospitality|tourism|leisure|restaurant|culinary/.test(normalizedText);
  }
  if (field.id === "sociology" && evidence.every((alias) => normalize(alias) === "이주")) {
    return !/국제이주|이주민|난민|migration|migrant|diaspora|citizenship|시민권/.test(normalizedText);
  }
  if (field.id === "business.management" && evidence.every((alias) => ["management", "의사결정", "decision support"].includes(normalize(alias)))) {
    const businessContext = /경영|마케팅|회계|재무|조직관리|생산관리|공급망|business|market|finance|accounting|organization/.test(normalizedText);
    const technicalContext = /thermal management|storage management|database|시스템|데이터|열관리|에너지|컴퓨터|정보검색|빅데이터|의사결정지원시스템/.test(normalizedText);
    return technicalContext && !businessContext;
  }
  if (field.id === "systems.distributed" && evidence.every((alias) => ["distributed", "분산", "클라우드", "cloud"].includes(normalize(alias)))) {
    const explicitDistributedSystemsContext = /분산\s*시스템|분산\s*컴퓨팅|클라우드\s*컴퓨팅|엣지\s*컴퓨팅|distributed\s*systems?|distributed\s*computing|cloud\s*computing|edge\s*computing|fog\s*computing/.test(normalizedText);
    if (explicitDistributedSystemsContext) {
      return false;
    }
    const humanitiesContext = /국어국문|문학|언어학|고전|현대시|소설|비평|철학|역사|문화|korean language|korean literature|literature|linguistics/.test(normalizedText);
    if (humanitiesContext) {
      return true;
    }
    const weakDistributedSystemsContext = /소프트웨어|네트워크|서버|데이터\s*센터|운영체제|데이터베이스|serverless|container|kubernetes|storage\s*systems?|operating\s*systems?|database|network/.test(normalizedText);
    return !weakDistributedSystemsContext;
  }
  if (field.id === "electronics.control" && evidence.every((alias) => ["최적화", "optimization"].includes(normalize(alias)))) {
    const engineeringContext = /제어|계측|시스템\s*모델링|control systems?|robot|로봇|전력|회로|공정|기계|차량|구조|설계|알고리즘|최적제어|operations research/.test(normalizedText);
    const businessStrategyContext = /전략\s*최적화|시장|기업|비즈니스|경영|공급망|거버넌스|business|strategy|market|firm|organization/.test(normalizedText);
    return businessStrategyContext && !engineeringContext;
  }
  if (field.id === "electronics.rf" && evidence.every((alias) => normalize(alias) === "통신")) {
    const rfContext = /무선|rf|안테나|마이크로파|전파|wireless|communication systems?|network|네트워크|이동통신/.test(normalizedText);
    const chipContext = /반도체|칩|메모리|dram|hbm|ssd|ic|soc|processor|프로세서|집적회로/.test(normalizedText);
    return chipContext && !rfContext;
  }
  if (field.id === "creative.design_fashion_craft" && evidence.every((alias) => normalize(alias) === "디자인")) {
    const creativeDesignContext = /패션|공예|서비스디자인|디자인씽킹|ux|ui\/ux|user experience|product design|industrial design/.test(normalizedText);
    const technicalContext = /cad|cam|cae|구조|기계|시스템|컴퓨터|공정|반도체|hci|human-computer|ui\s*디자인|인터랙션/.test(normalizedText);
    return technicalContext && !creativeDesignContext;
  }
  return false;
}

function hasOnlyIncidentalChemistryContext(normalizedText: string): boolean {
  const explicitChemistryContext = /물리화학|유기화학|무기화학|분석화학|고분자화학|화학생물학|재료화학|생화학|화학공학|화공|chemistry|chemical|molecule|molecular|분자|합성|촉매|전해질|배터리|battery|소재|재료/.test(normalizedText);
  if (explicitChemistryContext) {
    return false;
  }
  return /문화학|강화학습/.test(normalizedText);
}

function buildSuggestions(text: string, matches: ResearchFieldMatch[]): ResearchFieldSuggestion[] {
  if (matches.length > 0) {
    return [];
  }

  const candidates = text
    .split(/[,/|·;，、\n]+/)
    .map((item) => item.replace(/[()[\]{}]/g, " ").replace(/\s+/g, " ").trim())
    .filter((item) => item.length >= 2 && item.length <= 40)
    .filter((item) => !/학과|대학교|대학원|http|www|@/.test(item));

  return candidates.slice(0, 3).map((candidate) => ({
    suggestedLabel: candidate,
    reason: "중앙 taxonomy에서 충분히 높은 신뢰도로 매칭되지 않았습니다.",
    evidence: [candidate],
  }));
}
