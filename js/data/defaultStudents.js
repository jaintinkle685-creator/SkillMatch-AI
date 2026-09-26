// Pre-seeded database of 20 realistic engineering students
export const DEFAULT_STUDENTS = [
  {
    id: "std-001",
    name: "Aarav Sharma",
    rollNo: "DEMO-CS-001",
    section: "D-1",
    branch: "CSE-AI",
    cgpa: 9.4,
    experience: "Advanced",
    preferredRole: "AI Developer",
    interests: ["Deep Learning", "Medical AI", "Computer Vision", "Neural Networks"],
    skills: {
      "Python": 10,
      "AI/ML": 10,
      "Database": 8,
      "Backend": 8,
      "Research": 9,
      "Cloud/DevOps": 8,
      "Web": 7,
      "UI/UX": 7
    }
  },
  {
    id: "std-002",
    name: "Tanishq Garg",
    rollNo: "24EJCCA618",
    section: "D-1",
    branch: "CSE-AI",
    cgpa: 9.2,
    experience: "Advanced",
    preferredRole: "Backend Architect",
    interests: ["Distributed Systems", "FastAPI", "Microservices", "PostgreSQL", "Docker"],
    skills: {
      "Backend": 10,
      "Database": 10,
      "Python": 9,
      "Cloud/DevOps": 9,
      "AI/ML": 8,
      "Web": 8,
      "Research": 7,
      "UI/UX": 6
    }
  },
  {
    id: "std-003",
    name: "Tanisha Gupta",
    rollNo: "24EJCCA617",
    section: "D-1",
    branch: "CSE-AI",
    cgpa: 9.3,
    experience: "Advanced",
    preferredRole: "UI/UX Designer",
    interests: ["Design Systems", "Figma", "User Research", "Frontend Architecture", "Prototyping"],
    skills: {
      "UI/UX": 10,
      "Web": 10,
      "Research": 9,
      "Python": 8,
      "AI/ML": 8,
      "Database": 7,
      "Backend": 7,
      "Cloud/DevOps": 6
    }
  },
  {
    id: "std-004",
    name: "Karan Mehta",
    rollNo: "CS2026-004",
    section: "D-1",
    branch: "CSE-AI",
    cgpa: 8.3,
    experience: "Intermediate",
    preferredRole: "Database Engineer",
    interests: ["PostgreSQL", "Data Pipelines", "Query Optimization", "NoSQL"],
    skills: {
      "Python": 7,
      "AI/ML": 5,
      "Database": 9,
      "Backend": 8,
      "UI/UX": 3,
      "Cloud/DevOps": 7,
      "Research": 6,
      "Web": 6
    }
  },
  {
    id: "std-005",
    name: "Riya Sen",
    rollNo: "CS2026-005",
    section: "D-1",
    branch: "CSE-AI",
    cgpa: 9.4,
    experience: "Advanced",
    preferredRole: "Research Lead",
    interests: ["Literature Review", "Statistical Modeling", "NLP", "Bioinformatics"],
    skills: {
      "Python": 8,
      "AI/ML": 8,
      "Database": 6,
      "Backend": 5,
      "UI/UX": 4,
      "Cloud/DevOps": 4,
      "Research": 10,
      "Web": 5
    }
  },
  {
    id: "std-006",
    name: "Sneha Rao",
    rollNo: "CS2026-006",
    section: "D-1",
    branch: "CSE-AI",
    cgpa: 8.1,
    experience: "Intermediate",
    preferredRole: "Frontend Developer",
    interests: ["React", "CSS Animations", "Tailwind", "Responsive Design"],
    skills: {
      "Python": 5,
      "AI/ML": 4,
      "Database": 5,
      "Backend": 5,
      "UI/UX": 8,
      "Cloud/DevOps": 4,
      "Research": 4,
      "Web": 9
    }
  },
  {
    id: "std-007",
    name: "Vikram Malhotra",
    rollNo: "CS2026-007",
    section: "D-1",
    branch: "CSE-AI",
    cgpa: 8.7,
    experience: "Advanced",
    preferredRole: "AI Developer",
    interests: ["PyTorch", "Reinforcement Learning", "Edge AI", "Robotics"],
    skills: {
      "Python": 9,
      "AI/ML": 9,
      "Database": 7,
      "Backend": 7,
      "UI/UX": 2,
      "Cloud/DevOps": 6,
      "Research": 7,
      "Web": 5
    }
  },
  {
    id: "std-008",
    name: "Ananya Iyer",
    rollNo: "CS2026-008",
    section: "D-1",
    branch: "CSE-AI",
    cgpa: 8.8,
    experience: "Intermediate",
    preferredRole: "Cloud/DevOps Engineer",
    interests: ["Kubernetes", "AWS Architecture", "CI/CD", "Linux Admin"],
    skills: {
      "Python": 6,
      "AI/ML": 4,
      "Database": 7,
      "Backend": 8,
      "UI/UX": 3,
      "Cloud/DevOps": 9,
      "Research": 5,
      "Web": 6
    }
  },
  {
    id: "std-009",
    name: "Rohan Gupta",
    rollNo: "CS2026-009",
    section: "D-1",
    branch: "CSE-AI",
    cgpa: 7.9,
    experience: "Intermediate",
    preferredRole: "Backend Architect",
    interests: ["REST APIs", "Node.js", "Redis Cache", "Authentication"],
    skills: {
      "Python": 7,
      "AI/ML": 4,
      "Database": 8,
      "Backend": 9,
      "UI/UX": 4,
      "Cloud/DevOps": 7,
      "Research": 4,
      "Web": 8
    }
  },
  {
    id: "std-010",
    name: "Neha Nair",
    rollNo: "CS2026-010",
    section: "D-1",
    branch: "CSE-AI",
    cgpa: 8.6,
    experience: "Intermediate",
    preferredRole: "Research Lead",
    interests: ["Healthcare Tech", "Data Privacy", "Ethical AI", "Benchmarking"],
    skills: {
      "Python": 7,
      "AI/ML": 7,
      "Database": 6,
      "Backend": 5,
      "UI/UX": 5,
      "Cloud/DevOps": 4,
      "Research": 9,
      "Web": 6
    }
  },
  {
    id: "std-011",
    name: "Arjun Singhania",
    rollNo: "CS2026-011",
    section: "D-1",
    branch: "CSE-AI",
    cgpa: 8.4,
    experience: "Advanced",
    preferredRole: "AI Developer",
    interests: ["Transformers", "LLMs", "Generative AI", "CUDA"],
    skills: {
      "Python": 9,
      "AI/ML": 9,
      "Database": 6,
      "Backend": 6,
      "UI/UX": 2,
      "Cloud/DevOps": 5,
      "Research": 8,
      "Web": 4
    }
  },
  {
    id: "std-012",
    name: "Divya Joshi",
    rollNo: "CS2026-012",
    section: "D-1",
    branch: "CSE-AI",
    cgpa: 8.2,
    experience: "Beginner",
    preferredRole: "UI/UX Designer",
    interests: ["Wireframing", "Interaction Design", "Prototyping", "Design Thinking"],
    skills: {
      "Python": 3,
      "AI/ML": 2,
      "Database": 4,
      "Backend": 3,
      "UI/UX": 7,
      "Cloud/DevOps": 2,
      "Research": 6,
      "Web": 7
    }
  },
  {
    id: "std-013",
    name: "Aditya Kulkarni",
    rollNo: "CS2026-013",
    section: "D-1",
    branch: "CSE-AI",
    cgpa: 8.0,
    experience: "Intermediate",
    preferredRole: "Database Engineer",
    interests: ["MongoDB", "Elasticsearch", "ETL Pipelines", "Data Warehousing"],
    skills: {
      "Python": 6,
      "AI/ML": 5,
      "Database": 9,
      "Backend": 7,
      "UI/UX": 2,
      "Cloud/DevOps": 6,
      "Research": 5,
      "Web": 5
    }
  },
  {
    id: "std-014",
    name: "Pooja Hegde",
    rollNo: "CS2026-014",
    section: "D-1",
    branch: "CSE-AI",
    cgpa: 9.1,
    experience: "Advanced",
    preferredRole: "Full Stack Engineer",
    interests: ["Vue.js", "Django", "GraphQL", "Cloud Deployment"],
    skills: {
      "Python": 8,
      "AI/ML": 6,
      "Database": 7,
      "Backend": 8,
      "UI/UX": 7,
      "Cloud/DevOps": 7,
      "Research": 6,
      "Web": 9
    }
  },
  {
    id: "std-015",
    name: "Karthik Nambiar",
    rollNo: "CS2026-015",
    section: "D-1",
    branch: "CSE-AI",
    cgpa: 7.8,
    experience: "Beginner",
    preferredRole: "Cloud/DevOps Engineer",
    interests: ["Docker", "Terraform", "GitHub Actions", "Monitoring"],
    skills: {
      "Python": 5,
      "AI/ML": 3,
      "Database": 5,
      "Backend": 6,
      "UI/UX": 2,
      "Cloud/DevOps": 8,
      "Research": 4,
      "Web": 6
    }
  },
  {
    id: "std-016",
    name: "Meera Deshmukh",
    rollNo: "CS2026-016",
    section: "D-1",
    branch: "CSE-AI",
    cgpa: 8.7,
    experience: "Intermediate",
    preferredRole: "Research Lead",
    interests: ["Clinical Trials", "Epidemiology ML", "Scientific Writing"],
    skills: {
      "Python": 7,
      "AI/ML": 7,
      "Database": 6,
      "Backend": 4,
      "UI/UX": 4,
      "Cloud/DevOps": 3,
      "Research": 9,
      "Web": 5
    }
  },
  {
    id: "std-017",
    name: "Siddharth Bose",
    rollNo: "CS2026-017",
    section: "D-1",
    branch: "CSE-AI",
    cgpa: 8.5,
    experience: "Intermediate",
    preferredRole: "Backend Architect",
    interests: ["Go Lang", "Concurrency", "High Throughput Systems", "Kafka"],
    skills: {
      "Python": 7,
      "AI/ML": 5,
      "Database": 8,
      "Backend": 9,
      "UI/UX": 2,
      "Cloud/DevOps": 7,
      "Research": 4,
      "Web": 7
    }
  },
  {
    id: "std-018",
    name: "Tanvi Saxena",
    rollNo: "CS2026-018",
    section: "D-1",
    branch: "CSE-AI",
    cgpa: 8.9,
    experience: "Advanced",
    preferredRole: "AI Developer",
    interests: ["Bio-NLP", "Speech Recognition", "PyTorch", "Model Compression"],
    skills: {
      "Python": 9,
      "AI/ML": 9,
      "Database": 6,
      "Backend": 6,
      "UI/UX": 3,
      "Cloud/DevOps": 5,
      "Research": 8,
      "Web": 5
    }
  },
  {
    id: "std-019",
    name: "Kunal Goswami",
    rollNo: "CS2026-019",
    section: "D-1",
    branch: "CSE-AI",
    cgpa: 7.7,
    experience: "Beginner",
    preferredRole: "Database Engineer",
    interests: ["SQL Indexing", "Firebase", "Database Security", "MySQL"],
    skills: {
      "Python": 6,
      "AI/ML": 4,
      "Database": 8,
      "Backend": 6,
      "UI/UX": 3,
      "Cloud/DevOps": 5,
      "Research": 4,
      "Web": 6
    }
  },
  {
    id: "std-020",
    name: "Ishaan Choudhury",
    rollNo: "CS2026-020",
    section: "D-1",
    branch: "CSE-AI",
    cgpa: 8.3,
    experience: "Intermediate",
    preferredRole: "Frontend Developer",
    interests: ["Interactive Web", "Three.js", "Accessibility", "Design Systems"],
    skills: {
      "Python": 4,
      "AI/ML": 3,
      "Database": 5,
      "Backend": 5,
      "UI/UX": 8,
      "Cloud/DevOps": 3,
      "Research": 4,
      "Web": 8
    }
  }
];

export const AVAILABLE_SKILL_DOMAINS = [
  "Python", "AI/ML", "Database", "Backend", "UI/UX", "Cloud/DevOps", "Research", "Web"
];

export const AVAILABLE_ROLES = [
  "AI Developer", "UI/UX Designer", "Backend Architect", "Database Engineer", "Research Lead", "Frontend Developer", "Cloud/DevOps Engineer", "Full Stack Engineer"
];
