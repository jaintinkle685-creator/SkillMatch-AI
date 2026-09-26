// SkillMatch AI — Deep Local Project Intelligence Engine
// No external API/key is required. The engine performs multi-signal analysis
// over the project name, domain, description and optional metadata. It is
// deliberately deterministic so the same project produces repeatable results.
//
// Analysis layers:
// 1) phrase/technology evidence
// 2) domain and intent signals
// 3) functional capability extraction
// 4) implementation/data/security/testing signals
// 5) skill relevance + target proficiency
// 6) role composition + responsibilities
//
// IMPORTANT: This module does not generate an "inferred architecture" block.
// The UI consumes the structured analysis fields below.

export const MASTER_SKILL_LIBRARY = [
  {skill:"AI/ML",domain:"Artificial Intelligence",defaultRole:"AI/ML Developer",baseThreshold:75,keywords:["artificial intelligence","machine learning","deep learning","neural network","neural networks","pytorch","tensorflow","classifier","classification","prediction","predictive","forecast","reinforcement learning","supervised learning","unsupervised learning","model training","training model","model inference","inference","transformers","llm","large language model","generative ai","recommendation system","recommender","anomaly detection","computer intelligence"]},
  {skill:"Python",domain:"Programming & Data",defaultRole:"Python/ML Engineer",baseThreshold:70,keywords:["python","pytorch","numpy","pandas","scipy","scikit-learn","fastapi","flask","django","jupyter","data processing","data pipeline","scripting","automation"]},
  {skill:"Computer Vision",domain:"Artificial Intelligence",defaultRole:"Computer Vision Engineer",baseThreshold:75,keywords:["computer vision","image processing","opencv","cnn","yolo","object detection","segmentation","facial recognition","face recognition","medical imaging","retinal","pulmonary","dicom","video analysis","image classification","ocr","optical character recognition","camera","image"]},
  {skill:"NLP",domain:"Artificial Intelligence",defaultRole:"NLP Engineer",baseThreshold:75,keywords:["nlp","natural language processing","text analysis","sentiment analysis","spacy","nltk","tokenization","bert","gpt","rag","retrieval augmented","summarization","chatbot","translation","language model","speech recognition","text classification","question answering"]},
  {skill:"Data Analysis",domain:"Data Science",defaultRole:"Data Analyst",baseThreshold:70,keywords:["data analysis","data science","statistics","statistical","analytics","eda","exploratory data","visualization","tableau","power bi","aggregation","insights","metrics","reporting","data exploration","trend analysis","kpi","dashboard"]},
  {skill:"Database",domain:"Data & Persistence",defaultRole:"Database Engineer",baseThreshold:70,keywords:["database","sql","postgresql","mysql","mongodb","nosql","redis","schema","query","queries","transactions","acid","relational","orm","data warehouse","data storage","persistence","sqlite","firebase","supabase"]},
  {skill:"Backend",domain:"Software Engineering",defaultRole:"Backend Engineer",baseThreshold:75,keywords:["backend","back end","api","rest","rest api","graphql","microservice","microservices","server","endpoint","latency","concurrency","distributed","node.js","nodejs","express","fastapi","django","spring boot","authentication","business logic","server-side"]},
  {skill:"Web Development",domain:"Web Engineering",defaultRole:"Frontend Developer",baseThreshold:70,keywords:["web","website","frontend","front end","html","css","javascript","react","vue","angular","responsive","portal","dashboard","client-side","single page app","browser","web application","web app"]},
  {skill:"UI/UX",domain:"Design & Usability",defaultRole:"UI/UX Designer",baseThreshold:70,keywords:["ui","ux","ui/ux","user interface","user experience","design","figma","wireframe","prototype","usability","interaction","visual design","accessibility","user journey","user experience design"]},
  {skill:"Cloud/DevOps",domain:"Cloud & Infrastructure",defaultRole:"Cloud/DevOps Engineer",baseThreshold:65,keywords:["cloud","aws","azure","gcp","docker","kubernetes","k8s","container","containers","devops","ci/cd","deployment","deploy","linux","infrastructure","cluster","monitoring","hosting","serverless","pipeline"]},
  {skill:"Optimization Algorithms",domain:"Algorithms & Optimization",defaultRole:"Optimization Specialist",baseThreshold:75,keywords:["optimization","algorithm","algorithms","heuristics","genetic algorithm","hungarian","graph theory","dynamic programming","linear programming","operations research","routing","pathfinding","scheduling","allocation","matching","shortest path","constraint","resource allocation"]},
  {skill:"IoT",domain:"IoT & Embedded Systems",defaultRole:"IoT/Embedded Engineer",baseThreshold:70,keywords:["iot","internet of things","sensor","sensors","arduino","raspberry pi","esp32","embedded","mqtt","telemetry","hardware","firmware","edge computing","drone","robotics","actuator","microcontroller"]},
  {skill:"Cybersecurity",domain:"Security",defaultRole:"Security Engineer",baseThreshold:70,keywords:["security","cybersecurity","encryption","cryptography","authentication","authorization","jwt","oauth","penetration","vulnerability","audit","ssl","tls","hipaa","secure","privacy","access control","threat","security testing"]},
  {skill:"Research",domain:"Research & Methodology",defaultRole:"Research & Validation Lead",baseThreshold:65,keywords:["research","paper","literature","clinical","scientific","study","evaluation","benchmark","validation","academic","theory","ethics","publication","experimental","evidence","methodology","hypothesis","survey"]},
  {skill:"Mobile Development",domain:"Mobile Systems",defaultRole:"Mobile App Developer",baseThreshold:70,keywords:["mobile","android","ios","react native","flutter","swift","kotlin","smartphone","mobile app","mobile application","apk"]},
  {skill:"Java",domain:"Programming Languages",defaultRole:"Java Developer",baseThreshold:65,keywords:["java","spring","spring boot","maven","gradle","jdk"]},
  {skill:"C/C++",domain:"Systems Programming",defaultRole:"Systems/Embedded Developer",baseThreshold:65,keywords:["c++","cpp","c/c++","embedded c","gcc","mingw","visual c++","systems programming"]},
  {skill:"Version Control",domain:"Software Engineering",defaultRole:"Software Engineer",baseThreshold:55,keywords:["git","github","gitlab","version control","repository","branch","merge","pull request"]},
  {skill:"Testing & QA",domain:"Software Quality",defaultRole:"QA/Test Engineer",baseThreshold:60,keywords:["testing","test cases","unit test","unit testing","integration test","qa","quality assurance","validation","verification","debugging","performance testing","load testing"]},
  {skill:"APIs & Integration",domain:"Software Engineering",defaultRole:"Integration Engineer",baseThreshold:60,keywords:["api integration","third party api","external api","webhook","integration","payment gateway","google maps","maps api","email service","sms","oauth"]},
  {skill:"Data Engineering",domain:"Data Engineering",defaultRole:"Data Engineer",baseThreshold:65,keywords:["etl","elt","data pipeline","data engineering","data ingestion","data preprocessing","batch processing","stream processing","spark","airflow","data lake"]},
  {skill:"Visualization",domain:"Data & Visualization",defaultRole:"Visualization Analyst",baseThreshold:60,keywords:["visualization","charts","graphs","plotly","matplotlib","power bi","tableau","interactive dashboard","heatmap","graphical"]},
  {skill:"Natural Language / LLM Apps",domain:"Generative AI",defaultRole:"LLM Application Engineer",baseThreshold:75,keywords:["llm","generative ai","prompt engineering","prompt","rag","retrieval augmented generation","vector database","embedding","embeddings","semantic search","agent","ai assistant"]},
  {skill:"Computer Networks",domain:"Networking",defaultRole:"Network Engineer",baseThreshold:60,keywords:["network","networking","tcp","udp","http","dns","socket","routing","firewall","lan","wan","protocol"]},
  {skill:"Blockchain",domain:"Blockchain & Web3",defaultRole:"Blockchain Developer",baseThreshold:70,keywords:["blockchain","ethereum","smart contract","solidity","web3","distributed ledger","cryptocurrency","wallet"]},
  {skill:"GIS / Mapping",domain:"Geospatial Systems",defaultRole:"GIS Developer",baseThreshold:65,keywords:["gis","geospatial","mapping","map","maps","location","gps","latitude","longitude","route map","geographic"]},
  {skill:"Robotics",domain:"Robotics",defaultRole:"Robotics Engineer",baseThreshold:70,keywords:["robotics","robot","ros","autonomous","actuator","motion planning","navigation","manipulator"]},
  {skill:"Embedded Systems",domain:"Embedded Systems",defaultRole:"Embedded Engineer",baseThreshold:70,keywords:["embedded","microcontroller","microprocessor","firmware","rtos","arduino","esp32","stm32","8051","8085"]},
  {skill:"Mathematics & Modeling",domain:"Mathematical Modeling",defaultRole:"Modeling Specialist",baseThreshold:55,keywords:["mathematical model","modeling","linear algebra","probability","calculus","optimization model","simulation","numerical"]},
  {skill:"Project Management",domain:"Project Management",defaultRole:"Project Coordinator",baseThreshold:50,keywords:["project management","milestone","planning","agile","scrum","sprint","requirements management","risk management"]},
  {skill:"Documentation",domain:"Documentation",defaultRole:"Technical Documentation Lead",baseThreshold:45,keywords:["documentation","technical report","report","user manual","documentation system","readme","specification"]},
  {skill:"Accessibility",domain:"Design & Usability",defaultRole:"Accessibility Specialist",baseThreshold:55,keywords:["accessibility","wcag","screen reader","inclusive design","accessible"]},
  {skill:"Healthcare Informatics",domain:"Healthcare Technology",defaultRole:"Healthcare Systems Specialist",baseThreshold:65,keywords:["healthcare","health","medical","hospital","patient","clinical","diagnostic","electronic health","ehr","emr","medical record"]},
  {skill:"Finance Technology",domain:"Finance Technology",defaultRole:"FinTech Developer",baseThreshold:65,keywords:["fintech","finance","banking","transaction","payment","fraud detection","stock","trading","investment","loan","credit"]},
  {skill:"Education Technology",domain:"Education Technology",defaultRole:"EdTech Developer",baseThreshold:55,keywords:["education","learning","student","teacher","course","quiz","assessment","e-learning","edtech","lms"]},
  {skill:"Agriculture Technology",domain:"AgriTech",defaultRole:"AgriTech Specialist",baseThreshold:55,keywords:["agriculture","agri","crop","soil","farm","irrigation","yield","precision farming"]},
  {skill:"Sustainability / Environment",domain:"Environmental Technology",defaultRole:"Sustainability Analyst",baseThreshold:55,keywords:["environment","environmental","sustainability","waste","recycling","pollution","carbon","energy consumption","renewable"]},
];

const ROLE_BLUEPRINTS = [
  {role:"AI/ML Developer",signals:["AI/ML","Python","Data Analysis"],aliases:["machine learning","deep learning","prediction","model"]},
  {role:"Computer Vision Engineer",signals:["Computer Vision","AI/ML","Python"],aliases:["image","vision","detection","camera"]},
  {role:"NLP Engineer",signals:["NLP","AI/ML","Python"],aliases:["text","language","chatbot","sentiment"]},
  {role:"LLM Application Engineer",signals:["Natural Language / LLM Apps","Python","Backend"],aliases:["llm","rag","generative ai","ai assistant"]},
  {role:"Data Analyst",signals:["Data Analysis","Python","Database"],aliases:["analytics","statistics","dashboard","insights"]},
  {role:"Data Engineer",signals:["Data Engineering","Python","Database"],aliases:["etl","pipeline","ingestion","data engineering"]},
  {role:"Database Engineer",signals:["Database","Backend","Python"],aliases:["schema","sql","storage","database"]},
  {role:"Backend Engineer",signals:["Backend","Database","APIs & Integration"],aliases:["api","server","service","endpoint"]},
  {role:"Frontend Developer",signals:["Web Development","UI/UX"],aliases:["web","frontend","portal","website"]},
  {role:"UI/UX Designer",signals:["UI/UX","Web Development","Accessibility"],aliases:["design","user","interface","usability"]},
  {role:"Cloud/DevOps Engineer",signals:["Cloud/DevOps","Backend","Version Control"],aliases:["deployment","cloud","infrastructure","devops"]},
  {role:"Security Engineer",signals:["Cybersecurity","Backend","Computer Networks"],aliases:["security","secure","privacy","threat"]},
  {role:"Optimization Specialist",signals:["Optimization Algorithms","Python","Mathematics & Modeling"],aliases:["optimization","allocation","routing","scheduling"]},
  {role:"Research & Validation Lead",signals:["Research","Data Analysis","Testing & QA"],aliases:["research","validation","study","benchmark"]},
  {role:"IoT/Embedded Engineer",signals:["IoT","Embedded Systems","Cloud/DevOps"],aliases:["sensor","embedded","telemetry","device"]},
  {role:"Mobile App Developer",signals:["Mobile Development","APIs & Integration","UI/UX"],aliases:["mobile","android","ios","smartphone"]},
  {role:"Java Developer",signals:["Java","Backend","Database"],aliases:["java","spring","jdk"]},
  {role:"Systems/Cpp Developer",signals:["C/C++","Embedded Systems","Testing & QA"],aliases:["c++","cpp","systems","firmware"]},
  {role:"GIS Developer",signals:["GIS / Mapping","Web Development","Database"],aliases:["gis","map","mapping","location"]},
  {role:"Robotics Engineer",signals:["Robotics","Embedded Systems","Computer Vision"],aliases:["robot","robotics","autonomous","ros"]},
  {role:"Network Engineer",signals:["Computer Networks","Cybersecurity","Backend"],aliases:["network","tcp","udp","socket"]},
  {role:"Blockchain Developer",signals:["Blockchain","Backend","Cybersecurity"],aliases:["blockchain","smart contract","solidity","web3"]},
  {role:"Healthcare Systems Specialist",signals:["Healthcare Informatics","Database","Research"],aliases:["healthcare","medical","patient","clinical"]},
  {role:"FinTech Developer",signals:["Finance Technology","Backend","Database"],aliases:["fintech","banking","payment","finance"]},
  {role:"EdTech Developer",signals:["Education Technology","Web Development","Database"],aliases:["education","student","learning","course"]},
  {role:"QA/Test Engineer",signals:["Testing & QA","Backend","Web Development"],aliases:["testing","test","qa","quality"]},
  {role:"Project Coordinator",signals:["Project Management","Documentation","Research"],aliases:["planning","milestone","agile","scrum"]},
];

const RESPONSIBILITIES = {
  "AI/ML Developer":"Prepare data, select and train models, evaluate performance, and integrate inference into the application.",
  "Computer Vision Engineer":"Build image/video pipelines, implement vision models, and validate detection, classification, or segmentation results.",
  "NLP Engineer":"Prepare text data, implement language-processing components, evaluate outputs, and integrate NLP features.",
  "LLM Application Engineer":"Design prompts/retrieval flows, connect model services, manage context/embeddings, and evaluate generated responses.",
  "Data Analyst":"Clean data, define metrics, perform analysis, create visual insights, and validate findings.",
  "Data Engineer":"Design ingestion and transformation pipelines, manage data quality, and prepare reliable datasets for downstream use.",
  "Database Engineer":"Design schemas, queries and persistence flows while maintaining integrity, performance and reliable access.",
  "Backend Engineer":"Implement APIs and business logic, integrate services/databases, and handle validation and reliability.",
  "Frontend Developer":"Build responsive interfaces, connect user flows to application services, and present outputs clearly.",
  "UI/UX Designer":"Design user journeys, information hierarchy and interactions while improving usability and accessibility.",
  "Cloud/DevOps Engineer":"Configure environments, deployment, monitoring and operational workflows for reliable execution.",
  "Security Engineer":"Apply authentication, authorization, secure data handling and security validation.",
  "Optimization Specialist":"Model constraints, select optimization methods, evaluate solutions, and produce efficient assignments, routes or schedules.",
  "Research & Validation Lead":"Define evaluation methods, benchmark results, document limitations, and validate conclusions.",
  "IoT/Embedded Engineer":"Integrate sensors, edge devices and communication protocols and validate hardware-software behavior.",
  "Mobile App Developer":"Implement mobile workflows, integrate APIs/data services, and test expected device conditions.",
  "Java Developer":"Implement Java application logic, services and persistence integration and maintain testable code.",
  "Systems/Cpp Developer":"Implement efficient native/system components, memory-aware logic, hardware interfaces and low-level testing.",
  "GIS Developer":"Implement spatial data workflows, maps, geolocation features and location-aware queries or visualization.",
  "Robotics Engineer":"Integrate perception, control, navigation and hardware interfaces and validate autonomous behavior.",
  "Network Engineer":"Design communication flows, configure protocols, validate connectivity and monitor network behavior.",
  "Blockchain Developer":"Design smart-contract or ledger workflows, integrate wallets/services and validate transaction integrity.",
  "Healthcare Systems Specialist":"Translate clinical workflows into reliable software requirements while protecting patient-related data and validating outputs.",
  "FinTech Developer":"Implement transaction-oriented workflows, integrate financial services and validate correctness and security.",
  "EdTech Developer":"Implement learner/teacher workflows, learning content or assessment features and reliable progress tracking.",
  "QA/Test Engineer":"Create test scenarios, validate functional/non-functional requirements, reproduce defects and report quality findings.",
  "Project Coordinator":"Translate requirements into milestones, coordinate dependencies, document decisions and track project risks."
};

const DOMAIN_RULES = [
  [["ai/ml","ai / machine learning","machine learning","deep learning","artificial intelligence"],["AI/ML","Python"]],
  [["healthcare","medical","health","clinical","hospital"],["Healthcare Informatics","Research","Database"]],
  [["web","software","portal","website","web application"],["Web Development","Backend","Database"]],
  [["data science","analytics","analytics"],["Data Analysis","Python","Database"]],
  [["iot","embedded","robotics","drone"],["IoT","Embedded Systems"]],
  [["cybersecurity","security"],["Cybersecurity","Computer Networks"]],
  [["mobile","android","ios"],["Mobile Development","UI/UX","APIs & Integration"]],
  [["cloud","devops"],["Cloud/DevOps","Backend","Version Control"]],
  [["fintech","banking","finance","payment"],["Finance Technology","Backend","Database"]],
  [["education","edtech","student learning","e-learning"],["Education Technology","Web Development","Database"]],
  [["agriculture","crop","farm"],["Agriculture Technology","Data Analysis","IoT"]],
  [["environment","sustainability","waste","pollution"],["Sustainability / Environment","Data Analysis","IoT"]],
  [["blockchain","web3","smart contract"],["Blockchain","Backend","Cybersecurity"]],
  [["gis","mapping","map","location","gps"],["GIS / Mapping","Database","Web Development"]],
];

const FUNCTIONAL_SIGNAL_GROUPS = [
  {name:"User & Access Management",patterns:["login","log in","register","signup","sign up","user account","authentication","authorization","role-based","admin","student login","faculty login"]},
  {name:"Data Collection & Input",patterns:["input","form","upload","import","collect data","capture data","sensor data","user data","csv","dataset"]},
  {name:"Data Processing & Validation",patterns:["clean","preprocess","validate","validation","transform","normalization","filter","parse","process data"]},
  {name:"Search, Filtering & Retrieval",patterns:["search","filter","sort","retrieve","lookup","query","semantic search","recommendation","find records"]},
  {name:"Analytics & Visualization",patterns:["analytics","dashboard","chart","graph","visualization","report","metrics","kpi","trend","statistics"]},
  {name:"Prediction / Intelligence",patterns:["predict","prediction","forecast","classify","classification","recommend","detect","recognize","intelligent","model","ai","machine learning"]},
  {name:"Real-Time Monitoring & Alerts",patterns:["real-time","realtime","live monitoring","monitoring","alert","notification","telemetry","tracking","status"]},
  {name:"Transactions & Workflows",patterns:["transaction","booking","payment","checkout","order","approval","workflow","assignment","allocation","scheduling"]},
  {name:"Maps & Location",patterns:["map","maps","gps","location","route","routing","geospatial","latitude","longitude"]},
  {name:"Communication & Integration",patterns:["api","integration","webhook","email","sms","notification","third-party","gateway","service"]},
  {name:"Security & Privacy",patterns:["security","secure","encryption","privacy","authentication","authorization","access control","jwt","oauth"]},
  {name:"Testing & Quality",patterns:["test","testing","qa","quality","validation","benchmark","performance","accuracy","reliability"]},
  {name:"Documentation & Reporting",patterns:["documentation","report","readme","manual","specification","academic report","export report"]},
  {name:"Deployment & Operations",patterns:["deploy","deployment","hosting","cloud","docker","kubernetes","server","production","ci/cd","monitoring"]},
];

function norm(s=""){return String(s).toLowerCase().replace(/[^a-z0-9+#./ -]/g," ").replace(/\s+/g," ").trim();}
function hasPhrase(text,phrase){return norm(text).includes(norm(phrase));}
function uniq(arr){return [...new Set(arr.filter(Boolean))];}
function cap(s){return String(s||"").trim().replace(/\s+/g," ");}
function evidenceText(arr){return uniq(arr).slice(0,6);}

function detectFunctionalCapabilities(text){
  return FUNCTIONAL_SIGNAL_GROUPS
    .map(g=>({name:g.name,evidence:evidenceText(g.patterns.filter(p=>hasPhrase(text,p)))}))
    .filter(x=>x.evidence.length);
}

function buildDeliverables({capabilities, requiredSkills, text}){
  const out=[];
  const add=(x)=>{if(!out.includes(x))out.push(x);};
  add("Working project implementation / functional prototype");
  if(requiredSkills.some(x=>["AI/ML","Computer Vision","NLP","Natural Language / LLM Apps"].includes(x.skill)))
    add("Trained/configured intelligence component with evaluation results");
  if(requiredSkills.some(x=>["Database","Data Engineering","Data Analysis"].includes(x.skill)))
    add("Data model, dataset/data pipeline and validated sample data");
  if(requiredSkills.some(x=>["Web Development","Mobile Development","UI/UX"].includes(x.skill)))
    add("User interface, screens/workflows and responsive/device-ready interaction");
  if(requiredSkills.some(x=>["Backend","APIs & Integration"].includes(x.skill)))
    add("Backend services/API endpoints and integration flow");
  if(requiredSkills.some(x=>["IoT","Embedded Systems","Robotics"].includes(x.skill)))
    add("Device/edge integration or hardware-software demonstration");
  if(requiredSkills.some(x=>["Cybersecurity","Computer Networks"].includes(x.skill)))
    add("Security controls, test evidence and access/communication validation");
  if(capabilities.some(x=>x.name==="Analytics & Visualization"))
    add("Dashboard/visualizations and measurable project metrics");
  if(capabilities.some(x=>x.name==="Testing & Quality"))
    add("Test cases, validation results and defect/performance evidence");
  add("Technical documentation and project demonstration");
  return out.slice(0,8);
}

export function analyzeProjectRequirements({
  name="",description="",type="",teamSize=5,numTeams=4,
  objectives="",technologies="",requirements=""
}={}){
  const fields=[name,type,description,objectives,technologies,requirements].map(cap);
  const text=norm(fields.join(" "));
  const t=norm(type), n=norm(name), d=norm(description);
  const evaluated=[];

  for(const entry of MASTER_SKILL_LIBRARY){
    const evidence=[];
    let directHits=0;
    for(const kw of entry.keywords){
      if(hasPhrase(text,kw)){evidence.push(kw);directHits++;}
    }

    let contextBoost=0;
    for(const [triggers,skills] of DOMAIN_RULES){
      if(triggers.some(x=>t.includes(x)||n.includes(x)||d.includes(x)) && skills.includes(entry.skill))
        contextBoost+=20;
    }

    if((entry.skill==="Database"||entry.skill==="Backend") && /(system|platform|application|portal|website|software|records|store|save|data)/.test(text))
      contextBoost+=10;
    if(entry.skill==="Research" && /(evaluate|accuracy|validation|paper|study|literature|clinical|benchmark|experiment)/.test(text))
      contextBoost+=18;
    if(entry.skill==="Testing & QA" && /(test|testing|quality|validate|verification|reliability|accuracy)/.test(text))
      contextBoost+=20;
    if(entry.skill==="AI/ML" && /(predict|classify|recommend|forecast|detect|recognize|intelligent|model)/.test(text))
      contextBoost+=18;
    if(entry.skill==="Visualization" && /(dashboard|chart|graph|analytics|visualization|report)/.test(text))
      contextBoost+=18;
    if(entry.skill==="APIs & Integration" && /(api|integration|gateway|third.party|webhook)/.test(text))
      contextBoost+=18;
    if(entry.skill==="Version Control" && /(github|gitlab|repository|version control)/.test(text))
      contextBoost+=22;
    if(entry.skill==="Documentation" && /(report|documentation|readme|manual|academic)/.test(text))
      contextBoost+=12;

    // Strong evidence can come from the explicit project fields even when the
    // exact skill keyword is not present. This makes short/unusual project
    // descriptions substantially more useful.
    const score=Math.min(99,Math.round(35+directHits*8+contextBoost));
    const include = directHits>0 || contextBoost>=20;
    if(include){
      const importance=score>=88?"Very High":score>=76?"High":score>=64?"Medium":"Low";
      evaluated.push({
        skill:entry.skill,
        domain:entry.domain,
        importance,
        targetPercent:Math.max(entry.baseThreshold,Math.min(98,score)),
        relevanceScore:score,
        evidence:evidenceText(evidence),
        defaultRole:entry.defaultRole
      });
    }
  }

  // Every project receives a minimum implementation baseline, but only when
  // the signal is genuinely project-oriented.
  const baselineByText=[
    ["Database",/(system|platform|application|portal|website|software|records|data)/],
    ["Backend",/(system|platform|application|portal|website|software|server|service|api)/],
    ["Testing & QA",/(system|platform|application|project|software)/],
    ["Documentation",/(system|platform|application|project|software)/],
  ];
  for(const [skill,re] of baselineByText){
    if(re.test(text)&&!evaluated.some(x=>x.skill===skill)){
      const e=MASTER_SKILL_LIBRARY.find(x=>x.skill===skill);
      evaluated.push({skill:e.skill,domain:e.domain,importance:"Medium",targetPercent:e.baseThreshold,relevanceScore:e.baseThreshold,evidence:["project implementation baseline"],defaultRole:e.defaultRole});
    }
  }

  // If the description is extremely short, use the selected domain and name
  // to ensure a useful analysis rather than returning an empty dashboard.
  if(evaluated.length===0){
    const fallbackSkills = ["Web Development","Backend","Database"];
    if(/ai|ml|intelligent|predict|smart/.test(text)) fallbackSkills.unshift("AI/ML","Python");
    if(/mobile|android|ios/.test(text)) fallbackSkills.unshift("Mobile Development");
    if(/iot|sensor|embedded/.test(text)) fallbackSkills.unshift("IoT","Embedded Systems");
    for(const skill of uniq(fallbackSkills)){
      const e=MASTER_SKILL_LIBRARY.find(x=>x.skill===skill);
      if(e) evaluated.push({skill:e.skill,domain:e.domain,importance:"Core",targetPercent:e.baseThreshold,relevanceScore:e.baseThreshold,evidence:["project name/domain context"],defaultRole:e.defaultRole});
    }
  }

  evaluated.sort((a,b)=>b.relevanceScore-a.relevanceScore || a.skill.localeCompare(b.skill));

  const targetSize=Math.max(2,Math.min(10,parseInt(teamSize,10)||5));
  const roleScores=ROLE_BLUEPRINTS.map(r=>{
    const skillScore=r.signals.reduce((sum,s)=>sum+(evaluated.find(x=>x.skill===s)?.relevanceScore||0),0)/r.signals.length;
    const aliasBoost=r.aliases.filter(a=>text.includes(a)).length*9;
    return {...r,score:Math.min(99,Math.round(skillScore+aliasBoost))};
  }).filter(r=>r.score>=28).sort((a,b)=>b.score-a.score);

  const selected=[];const used=new Set();
  for(const r of roleScores){if(selected.length>=targetSize)break;if(!used.has(r.role)){selected.push(r.role);used.add(r.role);}}
  for(const r of ["AI/ML Developer","Backend Engineer","Database Engineer","Frontend Developer","QA/Test Engineer","Research & Validation Lead","Project Coordinator"]){
    if(selected.length>=targetSize)break;
    if(!used.has(r)){selected.push(r);used.add(r);}
  }

  const domains=uniq(evaluated.map(x=>x.domain));
  const detectedCapabilities=detectFunctionalCapabilities(text);
  const detectedTech=uniq([
    ...fields.flatMap(x=>x.match(/\b(?:python|java|javascript|typescript|c\+\+|cpp|react|angular|vue|node\.?js|django|flask|fastapi|spring boot|tensorflow|pytorch|opencv|sql|mysql|postgresql|mongodb|redis|docker|kubernetes|aws|azure|gcp|flutter|kotlin|swift|arduino|esp32|mqtt|git|github|firebase|solidity)\b/gi)||[])
  ]);
  const deliverables=buildDeliverables({capabilities:detectedCapabilities,requiredSkills:evaluated,text});
  const detailedRoles=selected.map(role=>{
    const rs=roleScores.find(x=>x.role===role);
    const core=(rs?.signals||[]).filter(sk=>evaluated.some(e=>e.skill===sk));
    return {role,score:rs?.score||60,coreSkills:core.length?core:rs?.signals?.slice(0,3)||[],responsibilities:RESPONSIBILITIES[role]||`Own ${role.toLowerCase()} delivery, integration, testing and validation for the detected project requirements.`};
  });

  const selectedDomain=cap(type)||domains[0]||"Computer Science";
  const inferredDomain=domains[0]||selectedDomain;

  return {
    projectName:cap(name),
    projectDescription:cap(description),
    projectType:cap(type),
    selectedDomain,
    inferredDomain,
    teamSize:targetSize,
    numTeams:Math.max(1,parseInt(numTeams,10)||4),
    requiredSkills:evaluated.map(x=>({...x})),
    requiredRoles:selected,
    detailedRoles,
    roleEvidence:roleScores.slice(0,targetSize).map(x=>({role:x.role,score:x.score,signals:x.signals})),
    dynamicDomains:domains,
    functionalCapabilities:detectedCapabilities,
    detectedTechnologies:detectedTech,
    deliverables,
    analysisSignals:{
      inputFields:uniq(["project name",type&&"project domain",description&&"technical description",objectives&&"objectives",technologies&&"technologies",requirements&&"requirements"]),
      evidenceCount:evaluated.reduce((n,x)=>n+(x.evidence?.length||0),0),
      skillCount:evaluated.length,
      roleCount:selected.length,
      capabilityCount:detectedCapabilities.length,
      technologyCount:detectedTech.length
    },
    analysisDepth:100,
    analysisMethod:"Deep multi-signal local analysis: project-context evidence + domain inference + functional capability extraction + technology detection + implementation baseline + skill relevance + role blueprint scoring + deliverable generation",
    analyzedAt:new Date().toISOString()
  };
}
