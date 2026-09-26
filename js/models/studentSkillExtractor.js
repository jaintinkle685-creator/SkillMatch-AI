// SkillMatch AI — Intelligent Student Skill Extraction Engine
// Automatically derives structured 1–10 skill proficiencies, experience tier,
// and best-fit roles from natural student profile descriptions.
// Eliminates the need for manual skill sliders.

export const MASTER_EXTRACTION_TAXONOMY = [
  {
    skill: "Python",
    domain: "Artificial Intelligence",
    keywords: ["python", "pytorch", "numpy", "pandas", "scipy", "scikit", "fastapi", "flask", "django", "jupyter", "scripting", "asyncio", "python3", "pytest"],
    roleAffinity: "AI Developer"
  },
  {
    skill: "AI/ML",
    domain: "Artificial Intelligence",
    keywords: ["ai", "machine learning", "deep learning", "neural network", "neural networks", "pytorch", "tensorflow", "keras", "scikit-learn", "llm", "transformers", "huggingface", "cnn", "rnn", "lstm", "xgboost", "random forest", "model training", "inference", "reinforcement learning"],
    roleAffinity: "AI Developer"
  },
  {
    skill: "Computer Vision",
    domain: "Computer Vision",
    keywords: ["computer vision", "opencv", "yolo", "yolov8", "object detection", "image processing", "segmentation", "medical imaging", "retinal", "pulmonary", "dicom", "video analysis", "face recognition", "grad-cam"],
    roleAffinity: "AI Developer"
  },
  {
    skill: "NLP",
    domain: "Natural Language Processing",
    keywords: ["nlp", "natural language processing", "bert", "gpt", "rag", "langchain", "tokenization", "spacy", "nltk", "sentiment analysis", "summarization", "text classification", "speech recognition"],
    roleAffinity: "AI Developer"
  },
  {
    skill: "Database",
    domain: "Database Systems",
    keywords: ["database", "sql", "postgresql", "mysql", "mongodb", "nosql", "redis", "timescale", "schema", "queries", "indexing", "acid", "query optimization", "etl", "data warehouse", "elasticsearch", "sqlite"],
    roleAffinity: "Database Engineer"
  },
  {
    skill: "Backend",
    domain: "Backend Systems",
    keywords: ["backend", "api", "rest", "restful", "fastapi", "flask", "django", "node.js", "nodejs", "express", "spring boot", "go lang", "golang", "microservice", "microservices", "websocket", "kafka", "grpc", "distributed systems", "concurrency"],
    roleAffinity: "Backend Architect"
  },
  {
    skill: "Web",
    domain: "Web Development",
    keywords: ["web", "frontend", "html", "html5", "css", "css3", "javascript", "typescript", "react", "vue", "angular", "tailwind", "vite", "portal", "single page app", "next.js", "redux"],
    roleAffinity: "Frontend Developer"
  },
  {
    skill: "UI/UX",
    domain: "Web Development",
    keywords: ["ui", "ux", "ui/ux", "figma", "wireframe", "wireframing", "prototype", "prototyping", "user research", "design system", "design thinking", "usability", "interaction design", "accessibility", "wcag"],
    roleAffinity: "UI/UX Designer"
  },
  {
    skill: "Cloud/DevOps",
    domain: "Cloud & Distributed Systems",
    keywords: ["cloud", "aws", "azure", "gcp", "docker", "kubernetes", "k8s", "devops", "ci/cd", "terraform", "linux", "bash", "shell scripting", "deployment", "github actions", "monitoring", "ansible"],
    roleAffinity: "Cloud/DevOps Engineer"
  },
  {
    skill: "Research",
    domain: "Research & Methodology",
    keywords: ["research", "paper", "literature review", "academic", "scientific", "study", "evaluation", "benchmark", "benchmarking", "ieee", "latex", "ethics", "publication", "meta-analysis", "hypothesis testing"],
    roleAffinity: "Research Lead"
  },
  {
    skill: "IoT",
    domain: "IoT & Embedded Systems",
    keywords: ["iot", "internet of things", "sensor", "sensors", "arduino", "raspberry pi", "esp32", "embedded", "firmware", "telemetry", "ros", "robotics", "mqtt", "hardware"],
    roleAffinity: "IoT & Embedded Engineer"
  },
  {
    skill: "Cybersecurity",
    domain: "Cybersecurity",
    keywords: ["security", "cybersecurity", "encryption", "authentication", "jwt", "oauth", "hipaa", "cryptography", "vulnerability", "audit", "penetration", "ssl", "tls", "security audit"],
    roleAffinity: "Security Engineer"
  },
  {
    skill: "Data Structures & Algorithms",
    domain: "Algorithms & Optimization",
    keywords: ["dsa", "data structures", "algorithms", "binary tree", "graph", "dynamic programming", "sorting", "searching", "hash table", "recursion", "complexity", "big-o", "leetcode"],
    roleAffinity: "AI Developer"
  },
  {
    skill: "Git & Version Control",
    domain: "Software Engineering & Collaboration",
    keywords: ["git", "github", "gitlab", "version control", "branching", "pull request", "merge", "code review", "commits", "repo", "repository"],
    roleAffinity: "Frontend Developer"
  },
  {
    skill: "Software Testing & QA",
    domain: "Software Quality & Testing",
    keywords: ["testing", "unit test", "pytest", "jest", "integration testing", "qa", "test automation", "tdd", "cypress", "selenium", "mocking"],
    roleAffinity: "Backend Architect"
  }
];

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Derives structured skill proficiencies (1-10) and evidence from natural student text.
 */
export function extractSkillsFromProfile(studentProfile = {}) {
  const {
    name = "",
    cgpa = 8.0,
    academicInfo = "",
    certifications = "",
    projectsText = "",
    internshipsText = "",
    technicalExperience = "",
    languagesTools = "",
    achievements = "",
    interests = []
  } = studentProfile;

  const interestsText = Array.isArray(interests) ? interests.join(" ") : String(interests || "");
  const corpus = `${academicInfo} ${certifications} ${projectsText} ${internshipsText} ${technicalExperience} ${languagesTools} ${achievements} ${interestsText}`.toLowerCase();

  const extractedSkills = {};
  const evidenceDetails = {};
  const roleScores = {};

  MASTER_EXTRACTION_TAXONOMY.forEach(entry => {
    let matchCount = 0;
    const matchedKeywords = [];

    entry.keywords.forEach(kw => {
      const regex = new RegExp(`\\b${escapeRegex(kw)}\\b`, "gi");
      const matches = corpus.match(regex);
      if (matches) {
        matchCount += matches.length;
        if (!matchedKeywords.includes(kw)) {
          matchedKeywords.push(kw);
        }
      }
    });

    if (matchCount > 0) {
      let score = 5.0;

      // Depth of matches
      score += Math.min(2.5, matchedKeywords.length * 0.7);

      // Internship contextual boost
      const internLower = (internshipsText || "").toLowerCase();
      if (matchedKeywords.some(kw => internLower.includes(kw))) {
        score += 1.8;
      }

      // Major project contextual boost
      const projLower = (projectsText || "").toLowerCase();
      if (matchedKeywords.some(kw => projLower.includes(kw))) {
        score += 1.2;
      }

      // Certification contextual boost
      const certLower = (certifications || "").toLowerCase();
      if (matchedKeywords.some(kw => certLower.includes(kw))) {
        score += 1.0;
      }

      // Academic GPA factor
      const gpaNum = parseFloat(cgpa) || 8.0;
      if (gpaNum >= 9.0) score += 0.5;
      else if (gpaNum < 7.0) score -= 0.5;

      const finalScore = Math.min(10, Math.max(3, Math.round(score)));
      extractedSkills[entry.skill] = finalScore;

      // Evidence summary string
      const sources = [];
      if (matchedKeywords.some(kw => internLower.includes(kw))) sources.push("Internship");
      if (matchedKeywords.some(kw => projLower.includes(kw))) sources.push("Project");
      if (matchedKeywords.some(kw => certLower.includes(kw))) sources.push("Cert");
      if (sources.length === 0) sources.push("Coursework & Skills");

      evidenceDetails[entry.skill] = {
        score: finalScore,
        keywords: matchedKeywords.slice(0, 4),
        source: sources.join(", ")
      };

      // Role score tally
      roleScores[entry.roleAffinity] = (roleScores[entry.roleAffinity] || 0) + finalScore;
    }
  });

  // Ensure baseline fundamental skills if student profile is sparse
  if (!extractedSkills["Python"]) {
    extractedSkills["Python"] = 6;
    evidenceDetails["Python"] = { score: 6, keywords: ["core programming"], source: "Curriculum Baseline" };
  }
  if (!extractedSkills["Database"]) {
    extractedSkills["Database"] = 5;
    evidenceDetails["Database"] = { score: 5, keywords: ["data storage"], source: "Curriculum Baseline" };
  }

  // Derive Inferred Experience Tier
  const scoresArray = Object.values(extractedSkills);
  const avgScore = scoresArray.length > 0 ? scoresArray.reduce((a, b) => a + b, 0) / scoresArray.length : 6;
  const hasInternship = (internshipsText || "").trim().length > 15;
  const hasMajorProject = (projectsText || "").trim().length > 25;

  let inferredExperience = "Intermediate";
  if ((avgScore >= 7.8 && hasInternship) || avgScore >= 8.5) {
    inferredExperience = "Advanced";
  } else if (avgScore < 6.0 && !hasInternship && !hasMajorProject) {
    inferredExperience = "Beginner";
  }

  // Derive Best-Fit Preferred Role
  let inferredRole = "Full Stack Engineer";
  let maxRoleScore = -1;
  for (const [role, s] of Object.entries(roleScores)) {
    if (s > maxRoleScore) {
      maxRoleScore = s;
      inferredRole = role;
    }
  }

  return {
    skills: extractedSkills,
    evidence: evidenceDetails,
    inferredExperience,
    inferredRole,
    extractedCount: Object.keys(extractedSkills).length
  };
}
