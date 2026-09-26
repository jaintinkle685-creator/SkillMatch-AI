// Curated academic project presets for quick one-click analysis
export const PROJECT_PRESETS = [
  {
    id: "preset-1",
    name: "AI Healthcare Diagnostic System",
    type: "AI/ML & Healthcare",
    teamSize: 5,
    numTeams: 4,
    description: `Develop an intelligent AI-powered healthcare diagnostic system for early detection of pulmonary and retinal conditions.
The platform requires deep neural networks for medical image analysis using PyTorch and Python, an explainable AI layer, and rigorous clinical literature research.
A high-performance asynchronous backend microservice is required for medical imaging pipelines, alongside HIPAA-compliant relational and DICOM image databases.
A clean, intuitive medical clinician portal (UI/UX) is required for doctors to review diagnosis confidence, heatmaps, and patient electronic medical records.`,
    requiredSkills: [
      { skill: "AI/ML", importance: "Very High", targetPercent: 90 },
      { skill: "Python", importance: "High", targetPercent: 85 },
      { skill: "Database", importance: "High", targetPercent: 70 },
      { skill: "UI/UX", importance: "High", targetPercent: 70 },
      { skill: "Backend", importance: "High", targetPercent: 75 },
      { skill: "Research", importance: "Medium", targetPercent: 65 },
      { skill: "Cloud/DevOps", importance: "Medium", targetPercent: 60 },
      { skill: "Web", importance: "Medium", targetPercent: 60 }
    ],
    expectedSkills: [
      { skill: "AI/ML", importance: "Very High", targetPercent: 90 },
      { skill: "Python", importance: "High", targetPercent: 85 },
      { skill: "Database", importance: "High", targetPercent: 70 },
      { skill: "UI/UX", importance: "High", targetPercent: 70 },
      { skill: "Backend", importance: "High", targetPercent: 75 },
      { skill: "Research", importance: "Medium", targetPercent: 65 },
      { skill: "Cloud/DevOps", importance: "Medium", targetPercent: 60 },
      { skill: "Web", importance: "Medium", targetPercent: 60 }
    ],
    requiredRoles: [
      "AI Developer",
      "UI/UX Designer",
      "Backend Architect",
      "Database Engineer",
      "Research Lead"
    ],
    expectedRoles: [
      "AI Developer",
      "UI/UX Designer",
      "Backend Architect",
      "Database Engineer",
      "Research Lead"
    ]
  },
  {
    id: "preset-2",
    name: "Autonomous Campus Drone Delivery System",
    type: "Robotics & Embedded AI",
    teamSize: 5,
    numTeams: 4,
    description: `Build a distributed autonomous drone control and delivery coordination platform for university campuses.
Requires real-time computer vision and obstacle avoidance algorithms in Python and C++, telemetry database synchronization, high-speed WebSocket backend communication, and a cloud telemetry dashboard for fleet dispatchers.`,
    requiredSkills: [
      { skill: "AI/ML", importance: "Very High", targetPercent: 88 },
      { skill: "Python", importance: "High", targetPercent: 85 },
      { skill: "Cloud/DevOps", importance: "High", targetPercent: 80 },
      { skill: "Backend", importance: "High", targetPercent: 82 },
      { skill: "Database", importance: "Medium", targetPercent: 68 },
      { skill: "UI/UX", importance: "Medium", targetPercent: 60 },
      { skill: "Web", importance: "Medium", targetPercent: 65 },
      { skill: "Research", importance: "Medium", targetPercent: 55 }
    ],
    expectedSkills: [
      { skill: "AI/ML", importance: "Very High", targetPercent: 88 },
      { skill: "Python", importance: "High", targetPercent: 85 },
      { skill: "Cloud/DevOps", importance: "High", targetPercent: 80 },
      { skill: "Backend", importance: "High", targetPercent: 82 },
      { skill: "Database", importance: "Medium", targetPercent: 68 },
      { skill: "UI/UX", importance: "Medium", targetPercent: 60 },
      { skill: "Web", importance: "Medium", targetPercent: 65 },
      { skill: "Research", importance: "Medium", targetPercent: 55 }
    ],
    requiredRoles: [
      "AI Developer",
      "Cloud/DevOps Engineer",
      "Backend Architect",
      "Database Engineer",
      "Frontend Developer"
    ],
    expectedRoles: [
      "AI Developer",
      "Cloud/DevOps Engineer",
      "Backend Architect",
      "Database Engineer",
      "Frontend Developer"
    ]
  },
  {
    id: "preset-3",
    name: "FinTech Algorithmic Trading & Risk Engine",
    type: "Financial Technology",
    teamSize: 4,
    numTeams: 5,
    description: `Design a low-latency high-frequency algorithmic risk management and quantitative analytics engine for market surveillance.
Heavy computational requirements in statistical modeling, time-series anomaly detection, distributed transactional databases (PostgreSQL/TimescaleDB), robust security audits, and financial chart visualizations.`,
    requiredSkills: [
      { skill: "Database", importance: "Very High", targetPercent: 92 },
      { skill: "Backend", importance: "Very High", targetPercent: 90 },
      { skill: "Python", importance: "High", targetPercent: 85 },
      { skill: "AI/ML", importance: "High", targetPercent: 78 },
      { skill: "Research", importance: "High", targetPercent: 75 },
      { skill: "Cloud/DevOps", importance: "Medium", targetPercent: 65 },
      { skill: "Web", importance: "Medium", targetPercent: 60 },
      { skill: "UI/UX", importance: "Low", targetPercent: 45 }
    ],
    expectedSkills: [
      { skill: "Database", importance: "Very High", targetPercent: 92 },
      { skill: "Backend", importance: "Very High", targetPercent: 90 },
      { skill: "Python", importance: "High", targetPercent: 85 },
      { skill: "AI/ML", importance: "High", targetPercent: 78 },
      { skill: "Research", importance: "High", targetPercent: 75 },
      { skill: "Cloud/DevOps", importance: "Medium", targetPercent: 65 },
      { skill: "Web", importance: "Medium", targetPercent: 60 },
      { skill: "UI/UX", importance: "Low", targetPercent: 45 }
    ],
    requiredRoles: [
      "Backend Architect",
      "Database Engineer",
      "AI Developer",
      "Research Lead"
    ],
    expectedRoles: [
      "Backend Architect",
      "Database Engineer",
      "AI Developer",
      "Research Lead"
    ]
  },
  {
    id: "preset-4",
    name: "Smart City IoT Environmental Monitor",
    type: "IoT & Cloud Analytics",
    teamSize: 4,
    numTeams: 5,
    description: `Deploy an end-to-end urban sensor network for real-time air quality index monitoring, acoustic noise mapping, and weather forecasting.
Requires edge device firmware integration, Kafka stream processing, containerized cloud infrastructure, geospatial spatial databases, and an interactive public citizen dashboard.`,
    requiredSkills: [
      { skill: "Cloud/DevOps", importance: "Very High", targetPercent: 90 },
      { skill: "Backend", importance: "High", targetPercent: 85 },
      { skill: "Database", importance: "High", targetPercent: 80 },
      { skill: "Web", importance: "High", targetPercent: 75 },
      { skill: "UI/UX", importance: "Medium", targetPercent: 65 },
      { skill: "Python", importance: "Medium", targetPercent: 65 },
      { skill: "Research", importance: "Medium", targetPercent: 50 },
      { skill: "AI/ML", importance: "Low", targetPercent: 45 }
    ],
    expectedSkills: [
      { skill: "Cloud/DevOps", importance: "Very High", targetPercent: 90 },
      { skill: "Backend", importance: "High", targetPercent: 85 },
      { skill: "Database", importance: "High", targetPercent: 80 },
      { skill: "Web", importance: "High", targetPercent: 75 },
      { skill: "UI/UX", importance: "Medium", targetPercent: 65 },
      { skill: "Python", importance: "Medium", targetPercent: 65 },
      { skill: "Research", importance: "Medium", targetPercent: 50 },
      { skill: "AI/ML", importance: "Low", targetPercent: 45 }
    ],
    requiredRoles: [
      "Cloud/DevOps Engineer",
      "Backend Architect",
      "Database Engineer",
      "Frontend Developer"
    ],
    expectedRoles: [
      "Cloud/DevOps Engineer",
      "Backend Architect",
      "Database Engineer",
      "Frontend Developer"
    ]
  }
];
