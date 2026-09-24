"""
SkillMatch AI — SQLite Database Architecture & Security Engine
Handles permanent storage, PBKDF2 password hashing, session tokens,
and strict multi-user workspace data isolation.
"""

import sqlite3
import os
import hashlib
import secrets
import json
import re
from datetime import datetime, timedelta

DB_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "skillmatch.db")

def get_db():
    conn = sqlite3.connect(DB_FILE, timeout=30.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout = 30000")
    conn.execute("PRAGMA foreign_keys = ON")
    # WAL allows reads and writes to coexist and greatly reduces transient
    # "database is locked" errors when the browser autosaves while deleting.
    conn.execute("PRAGMA journal_mode = WAL")
    return conn

def init_db():
    conn = get_db()
    cursor = conn.cursor()

    # 1. Users table (permanent user accounts with role support: student vs admin)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT DEFAULT 'student', -- 'student' or 'admin'
        roll_no TEXT,                -- For students: roll / registration no.
        faculty_id TEXT,             -- For coordinators/faculty
        cohort_code TEXT,            -- Links students to the coordinator's academic cohort
        semester TEXT,
        section TEXT,
        designation TEXT,
        college TEXT,
        dept TEXT,
        branch TEXT,
        hod_name TEXT,
        dean_name TEXT,
        office TEXT,
        research TEXT,
        report_document_id TEXT,
        demo_choice TEXT DEFAULT 'pending', -- 'pending', 'yes', 'no'
        is_demo INTEGER DEFAULT 0,
        created_at TEXT NOT NULL
    )
    """)

    # Safe column migration for existing databases
    cursor.execute("PRAGMA table_info(users)")
    existing_user_cols = [col["name"] for col in cursor.fetchall()]
    if "role" not in existing_user_cols:
        cursor.execute("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'student'")
    if "roll_no" not in existing_user_cols:
        cursor.execute("ALTER TABLE users ADD COLUMN roll_no TEXT")
    if "cohort_code" not in existing_user_cols:
        cursor.execute("ALTER TABLE users ADD COLUMN cohort_code TEXT")
    if "semester" not in existing_user_cols:
        cursor.execute("ALTER TABLE users ADD COLUMN semester TEXT")
    if "section" not in existing_user_cols:
        cursor.execute("ALTER TABLE users ADD COLUMN section TEXT")

    # 2. Sessions table (persistent auth sessions)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
    """)

    # 3. Projects table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT,
        team_size INTEGER DEFAULT 5,
        num_teams INTEGER DEFAULT 4,
        description TEXT,
        objectives TEXT,
        technologies TEXT,
        requirements TEXT,
        required_skills_json TEXT, -- JSON array of {skill, domain, importance, targetPercent, targetScore, reason, evidence}
        required_roles_json TEXT,  -- JSON array of strings
        is_demo INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
    """)

    # 4. Relational Master Skills Catalog
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS skills (
        id TEXT PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        category TEXT NOT NULL,
        default_role TEXT,
        description TEXT
    )
    """)

    # 5. Relational Project-Skill Mappings
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS project_skills (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id TEXT NOT NULL,
        skill_name TEXT NOT NULL,
        importance TEXT DEFAULT 'High',
        target_score REAL DEFAULT 7.5,
        min_prof INTEGER DEFAULT 6,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )
    """)

    # 6. Students cohort table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS students (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        roll_no TEXT NOT NULL,
        email TEXT,
        branch TEXT,
        semester TEXT,
        cgpa REAL DEFAULT 8.0,
        experience TEXT DEFAULT 'Intermediate', -- Beginner, Intermediate, Advanced
        preferred_role TEXT DEFAULT 'Full Stack Engineer',
        academic_info TEXT,
        certifications TEXT,
        projects_text TEXT,
        internships_text TEXT,
        technical_experience TEXT,
        languages_tools TEXT,
        achievements TEXT,
        interests_json TEXT, -- JSON array
        skills_json TEXT,    -- JSON object { "Python": 9, "AI/ML": 8, ... }
        assignment_status TEXT DEFAULT 'Available', -- 'Available', 'Assigned'
        assigned_project_id TEXT,
        assigned_team_id TEXT,
        assigned_role TEXT,
        cohort_code TEXT,            -- Academic cohort/organization membership
        section TEXT,
        is_demo INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
    """)

    # Safe student-table migrations MUST run after the students table exists.
    # This is important for a brand-new installation where no skillmatch.db
    # exists yet.
    cursor.execute("PRAGMA table_info(students)")
    existing_student_cols = [col["name"] for col in cursor.fetchall()]
    if "cohort_code" not in existing_student_cols:
        cursor.execute("ALTER TABLE students ADD COLUMN cohort_code TEXT")
    if "section" not in existing_student_cols:
        cursor.execute("ALTER TABLE students ADD COLUMN section TEXT")
    if "coordinator_id" not in existing_student_cols:
        cursor.execute("ALTER TABLE students ADD COLUMN coordinator_id TEXT")
    if "recommended_role" not in existing_student_cols:
        cursor.execute("ALTER TABLE students ADD COLUMN recommended_role TEXT")
    if "role_analysis_json" not in existing_student_cols:
        cursor.execute("ALTER TABLE students ADD COLUMN role_analysis_json TEXT")

    cursor.execute("CREATE INDEX IF NOT EXISTS idx_users_cohort_code ON users(cohort_code)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_students_coordinator_id ON students(coordinator_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_students_cohort_code ON students(cohort_code)")

    # Backfill cohort codes for existing coordinator accounts created before
    # self-registration was introduced, then attach their manually managed
    # roster rows to the same cohort.
    cursor.execute("SELECT id FROM users WHERE role='admin' AND COALESCE(cohort_code,'')=''")
    for admin_row in cursor.fetchall():
        new_code = "SM-" + secrets.token_hex(4).upper()
        cursor.execute("UPDATE users SET cohort_code=? WHERE id=?", (new_code, admin_row["id"]))
    cursor.execute("""UPDATE students SET cohort_code=(SELECT u.cohort_code FROM users u WHERE u.id=students.user_id)
        WHERE user_id IN (SELECT id FROM users WHERE role='admin') AND COALESCE(cohort_code,'')=''""")

    # 7. Relational Student Skills (Individual Skill Portfolio)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS student_skills (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        skill_name TEXT NOT NULL,
        proficiency INTEGER NOT NULL CHECK (proficiency >= 1 AND proficiency <= 10),
        evidence TEXT,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(user_id, skill_name)
    )
    """)

    # 8. Teams table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS teams (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        team_name TEXT NOT NULL,
        algorithm_used TEXT,
        metrics_json TEXT, -- JSON object { skillBalance, preferenceMatch, experienceBalance, overallScore, skillCoverageMap }
        created_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )
    """)

    # 9. Team Members table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS team_members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        team_id TEXT NOT NULL,
        student_id TEXT NOT NULL,
        assigned_role TEXT,
        fit_metrics_json TEXT,
        FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
    )
    """)

    # 10. Reports & Signatures table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS reports (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        report_date TEXT NOT NULL,
        prep_name TEXT,
        prep_desig TEXT,
        prep_sig TEXT,
        hod_name TEXT,
        hod_desig TEXT,
        hod_sig TEXT,
        dean_name TEXT,
        dean_desig TEXT,
        dean_sig TEXT,
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )
    """)

    # 11. User Settings table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS user_settings (
        user_id TEXT PRIMARY KEY,
        active_project_id TEXT,
        weights_json TEXT, -- { skill: 50, pref: 30, exp: 20 }
        theme TEXT DEFAULT 'light',
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
    """)

    # Pre-seed Master Skill Catalog if empty
    cursor.execute("SELECT COUNT(*) as cnt FROM skills")
    if cursor.fetchone()["cnt"] == 0:
        master_skills = [
            ("sk-1", "Python", "Artificial Intelligence", "AI/ML Developer", "Core programming language for data pipelines, AI models, and backend"),
            ("sk-2", "AI/ML", "Artificial Intelligence", "AI/ML Developer", "Deep learning, neural networks, computer vision, and predictive modeling"),
            ("sk-3", "Computer Vision", "Computer Vision", "Computer Vision Specialist", "OpenCV, CNNs, image segmentation, and medical imaging"),
            ("sk-4", "NLP", "Natural Language Processing", "NLP Engineer", "Text analysis, LLMs, transformer fine-tuning, and semantic search"),
            ("sk-5", "Data Analysis", "Data Science", "Data Analyst", "Statistical modeling, exploratory analysis, pandas, and data visualization"),
            ("sk-6", "Database", "Database Systems", "Database Engineer", "Relational SQL, PostgreSQL, indexing, ACID transactions, and NoSQL"),
            ("sk-7", "Backend", "Backend Systems", "Backend Architect", "RESTful APIs, microservices, asynchronous queues, and server architecture"),
            ("sk-8", "Web Development", "Web Development", "Frontend Developer", "HTML5, CSS3, JavaScript, React, and responsive web portals"),
            ("sk-9", "UI/UX", "Web Development", "UI/UX Designer", "Figma wireframing, user research, interaction design, and design systems"),
            ("sk-10", "Cloud/DevOps", "Cloud & Distributed Systems", "Cloud/DevOps Engineer", "Docker, Kubernetes, CI/CD automation, AWS, and Linux infrastructure"),
            ("sk-11", "IoT", "IoT & Embedded Systems", "IoT & Embedded Engineer", "Microcontroller firmware, sensors, edge telemetry, and MQTT"),
            ("sk-12", "Cybersecurity", "Cybersecurity", "Security Engineer", "Encryption, network auditing, authentication protocols, and threat modeling"),
            ("sk-13", "Research", "Research & Methodology", "Research Lead", "Scientific paper benchmarking, literature validation, and academic publishing"),
            ("sk-14", "Optimization Algorithms", "Algorithms & Optimization", "Optimization Specialist", "Greedy set cover, heuristics, and algorithmic benchmarking")
        ]
        cursor.executemany("INSERT INTO skills (id, name, category, default_role, description) VALUES (?, ?, ?, ?, ?)", master_skills)

    conn.commit()
    conn.close()

# ----------------- SECURITY & PASSWORD HASHING -----------------

def hash_password(password: str, salt: str = None) -> tuple[str, str]:
    """Secure PBKDF2-HMAC-SHA256 password hashing with 100,000 rounds and random 16-byte salt."""
    if not salt:
        salt = secrets.token_hex(16)
    key = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100000)
    return key.hex(), salt

def verify_password(password: str, password_hash: str, salt: str) -> bool:
    """Verifies a password against the stored hash and salt."""
    key = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100000)
    return secrets.compare_digest(key.hex(), password_hash)

# ----------------- AUTHENTICATION OPERATIONS -----------------

def register_user(email, password, name, **kwargs):
    conn = get_db()
    cursor = conn.cursor()

    email_clean = email.strip().lower()
    cursor.execute("SELECT id FROM users WHERE email = ?", (email_clean,))
    if cursor.fetchone():
        conn.close()
        raise ValueError(f"An account with email '{email_clean}' is already registered.")

    user_id = kwargs.get("id") or f"user_{secrets.token_hex(8)}"
    pwd_hash, salt = hash_password(password)
    now = datetime.now().isoformat()
    role = kwargs.get("role", "student")
    roll_no = kwargs.get("roll_no") or kwargs.get("rollNo") or ""

    if roll_no:
        cursor.execute("SELECT id FROM users WHERE LOWER(roll_no) = ?", (roll_no.strip().lower(),))
        if cursor.fetchone():
            conn.close()
            raise ValueError(f"An account with Roll No '{roll_no}' is already registered.")

    faculty_id = kwargs.get("faculty_id") or kwargs.get("facultyId") or ("FAC-" + secrets.token_hex(4).upper() if role == "admin" else "")
    designation = kwargs.get("designation") or ""
    college = kwargs.get("college") or ""
    dept = kwargs.get("dept") or ""
    branch = kwargs.get("branch") or ""
    semester = str(kwargs.get("semester") or "").strip()
    section = str(kwargs.get("section") or "").strip()

    # Complete student portfolio information. These fields mirror the richer
    # demo-student records so self-registration does not lose useful profile
    # signals used by role analysis and team formation.
    cgpa = float(kwargs.get("cgpa") or 0) if str(kwargs.get("cgpa") or "").strip() else 0.0
    experience = str(kwargs.get("experience") or "Beginner").strip()
    preferred_role = str(kwargs.get("preferred_role") or kwargs.get("preferredRole") or "").strip()
    academic_info = str(kwargs.get("academic_info") or kwargs.get("academicInfo") or "").strip()
    certifications = str(kwargs.get("certifications") or "").strip()
    projects_text = str(kwargs.get("projects_text") or kwargs.get("projectsText") or "").strip()
    internships_text = str(kwargs.get("internships_text") or kwargs.get("internshipsText") or "").strip()
    technical_experience = str(kwargs.get("technical_experience") or kwargs.get("technicalExperience") or "").strip()
    languages_tools = str(kwargs.get("languages_tools") or kwargs.get("languagesTools") or "").strip()
    achievements = str(kwargs.get("achievements") or "").strip()
    interests = kwargs.get("interests") or []
    if isinstance(interests, str):
        interests = [x.strip() for x in interests.split(",") if x.strip()]
    skills_input = kwargs.get("skills") or kwargs.get("skills_json") or {}
    if isinstance(skills_input, str):
        try: skills_input = json.loads(skills_input)
        except Exception: skills_input = {}
    skills_input = {str(k).strip(): max(1, min(10, int(v))) for k,v in skills_input.items() if str(k).strip() and str(v).strip()}

    # Each admin owns a unique cohort code. Students must provide a valid
    # coordinator cohort code during self-registration so their data is
    # automatically connected to the correct admin workspace.
    cohort_code = str(kwargs.get("cohort_code") or kwargs.get("cohortCode") or "").strip().upper()
    if role == "admin":
        if not cohort_code:
            cohort_code = "SM-" + secrets.token_hex(4).upper()
        cursor.execute("SELECT id FROM users WHERE UPPER(COALESCE(cohort_code,'')) = ?", (cohort_code,))
        if cursor.fetchone():
            cohort_code = "SM-" + secrets.token_hex(5).upper()
    elif role == "student" and not kwargs.get("is_demo", 0):
        if not cohort_code:
            conn.close()
            raise ValueError("Cohort code is required. Ask your coordinator for the registration code.")
        cursor.execute("SELECT id, college, dept, branch FROM users WHERE role='admin' AND UPPER(COALESCE(cohort_code,'')) = ?", (cohort_code,))
        coordinator = cursor.fetchone()
        if not coordinator:
            conn.close()
            raise ValueError("Invalid cohort code. Please check the code provided by your coordinator.")
        # Use coordinator's institution details as safe defaults when a student leaves them blank.
        if not college: college = coordinator["college"] or ""
        if not dept: dept = coordinator["dept"] or ""
        if not branch: branch = coordinator["branch"] or ""
    hod_name = kwargs.get("hod_name") or kwargs.get("hodName") or ""
    dean_name = kwargs.get("dean_name") or kwargs.get("deanName") or ""
    office = kwargs.get("office") or ""
    research = kwargs.get("research") or ""
    report_doc_id = kwargs.get("report_document_id") or kwargs.get("reportDocumentId") or f"SM-{datetime.now().year}-CS402-01"
    demo_choice = kwargs.get("demo_choice") or kwargs.get("demoChoice") or "pending"

    cursor.execute("""
    INSERT INTO users (
        id, email, password_hash, salt, name, role, roll_no, faculty_id, designation,
        college, dept, branch, cohort_code, semester, section, hod_name, dean_name, office, research,
        report_document_id, demo_choice, is_demo, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        user_id,
        email_clean,
        pwd_hash,
        salt,
        name.strip(),
        role,
        roll_no,
        faculty_id,
        designation,
        college,
        dept,
        branch,
        cohort_code,
        semester,
        section,
        hod_name,
        dean_name,
        office,
        research,
        report_doc_id,
        demo_choice,
        kwargs.get("is_demo", 0),
        now
    ))

    # Initialize a clean workspace. Demo data is loaded only for explicit demo accounts.
    cursor.execute("""
    INSERT OR REPLACE INTO user_settings (user_id, active_project_id, weights_json, theme, updated_at)
    VALUES (?, NULL, ?, 'light', ?)
    """, (user_id, json.dumps({"skill": 50, "pref": 30, "exp": 20}), now))

    if role == "student" and not kwargs.get("is_demo", 0):
        # Create an empty student profile so the student's portfolio can save and sync skills.
        student_id = f"student_{user_id}"
        cursor.execute("""
        INSERT OR IGNORE INTO students (
            id, user_id, name, roll_no, email, branch, semester, cgpa,
            experience, preferred_role, academic_info, certifications,
            projects_text, internships_text, technical_experience,
            languages_tools, achievements, interests_json, skills_json,
            assignment_status, assigned_project_id, assigned_team_id, assigned_role,
            cohort_code, section, coordinator_id, recommended_role, role_analysis_json, is_demo, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Available', NULL, NULL, NULL, ?, ?, ?, NULL, NULL, 0, ?, ?)
        """, (student_id, user_id, name.strip(), roll_no or f"ROLL-{user_id[-6:]}", email_clean, branch, semester, cgpa,
                  experience, preferred_role, academic_info, certifications, projects_text, internships_text,
                  technical_experience, languages_tools, achievements, json.dumps(interests), json.dumps(skills_input),
                  cohort_code, section, coordinator["id"], now, now))

        for skill_name, prof in skills_input.items():
            cursor.execute("""
                INSERT INTO student_skills (user_id, skill_name, proficiency, evidence, updated_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(user_id, skill_name) DO UPDATE SET proficiency=excluded.proficiency, updated_at=excluded.updated_at
            """, (user_id, skill_name, prof, "Provided during registration", now))
        _analyze_student_role_locked(cursor, student_id)

    conn.commit()
    conn.close()
    return get_user_by_id(user_id)

def check_user_exists(identifier):
    """Checks whether an account exists matching email, roll_no, or faculty_id."""
    if not identifier:
        return False
    conn = get_db()
    cursor = conn.cursor()
    clean_id = identifier.strip().lower()
    cursor.execute("""
    SELECT id FROM users 
    WHERE LOWER(email) = ? OR LOWER(COALESCE(roll_no, '')) = ? OR LOWER(COALESCE(faculty_id, '')) = ?
    """, (clean_id, clean_id, clean_id))
    row = cursor.fetchone()
    conn.close()
    return bool(row)

def authenticate_user(identifier, password):
    """Authenticates a user via email, roll number, or faculty ID + password."""
    if not identifier or not password:
        return None
    conn = get_db()
    cursor = conn.cursor()
    clean_id = identifier.strip().lower()
    cursor.execute("""
    SELECT * FROM users 
    WHERE LOWER(email) = ? OR LOWER(COALESCE(roll_no, '')) = ? OR LOWER(COALESCE(faculty_id, '')) = ?
    """, (clean_id, clean_id, clean_id))
    user = cursor.fetchone()
    conn.close()

    if not user:
        return None

    if verify_password(password, user["password_hash"], user["salt"]):
        return get_user_by_id(user["id"])
    return None

def create_session(user_id, days=30):
    conn = get_db()
    cursor = conn.cursor()
    token = secrets.token_hex(32)
    now = datetime.now()
    expires_at = (now + timedelta(days=days)).isoformat()

    cursor.execute("""
    INSERT INTO sessions (token, user_id, created_at, expires_at)
    VALUES (?, ?, ?, ?)
    """, (token, user_id, now.isoformat(), expires_at))

    conn.commit()
    conn.close()
    return token, expires_at

def get_user_by_token(token):
    if not token:
        return None
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
    SELECT u.* FROM users u
    JOIN sessions s ON u.id = s.user_id
    WHERE s.token = ? AND datetime(s.expires_at) > datetime('now')
    """, (token,))
    row = cursor.fetchone()
    conn.close()
    if row:
        user_dict = dict(row)
        user_dict.pop("password_hash", None)
        user_dict.pop("salt", None)
        user_dict["role"] = user_dict.get("role") or "student"
        user_dict["rollNo"] = user_dict.get("roll_no") or ""
        user_dict["cohortCode"] = user_dict.get("cohort_code") or ""
        user_dict["semester"] = user_dict.get("semester") or ""
        user_dict["section"] = user_dict.get("section") or ""
        user_dict["isAdmin"] = (user_dict["role"] == "admin")
        user_dict["demoChoice"] = user_dict.get("demo_choice", "pending")
        user_dict["hodName"] = user_dict.get("hod_name", "")
        user_dict["deanName"] = user_dict.get("dean_name", "")
        user_dict["facultyId"] = user_dict.get("faculty_id", "")
        user_dict["reportDocumentId"] = user_dict.get("report_document_id", "")
        user_dict["isDemo"] = bool(user_dict.get("is_demo", 0))
        return user_dict
    return None

def delete_session(token):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM sessions WHERE token = ?", (token,))
    conn.commit()
    conn.close()

def get_user_by_id(user_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
    row = cursor.fetchone()
    conn.close()
    if row:
        user_dict = dict(row)
        user_dict.pop("password_hash", None)
        user_dict.pop("salt", None)
        user_dict["role"] = user_dict.get("role") or "student"
        user_dict["rollNo"] = user_dict.get("roll_no") or ""
        user_dict["cohortCode"] = user_dict.get("cohort_code") or ""
        user_dict["semester"] = user_dict.get("semester") or ""
        user_dict["section"] = user_dict.get("section") or ""
        user_dict["isAdmin"] = (user_dict["role"] == "admin")
        user_dict["demoChoice"] = user_dict.get("demo_choice", "pending")
        user_dict["hodName"] = user_dict.get("hod_name", "")
        user_dict["deanName"] = user_dict.get("dean_name", "")
        user_dict["facultyId"] = user_dict.get("faculty_id", "")
        user_dict["reportDocumentId"] = user_dict.get("report_document_id", "")
        user_dict["isDemo"] = bool(user_dict.get("is_demo", 0))
        return user_dict
    return None

def update_user_profile(user_id, profile_data):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT role FROM users WHERE id=?", (user_id,))
    current = cursor.fetchone()
    if not current:
        conn.close(); raise ValueError("User account not found.")

    # Students may edit their personal/academic profile but cannot promote
    # themselves, change their cohort, or alter coordinator-only metadata.
    if current["role"] == "student":
        allowed_fields = ["name", "college", "dept", "branch", "roll_no", "semester", "section"]
    else:
        allowed_fields = [
            "name", "faculty_id", "designation", "college", "dept", "branch",
            "hod_name", "dean_name", "office", "research", "report_document_id",
            "roll_no", "cohort_code", "semester", "section"
        ]
    updates = []
    values = []
    for k in allowed_fields:
        if k in profile_data:
            updates.append(f"{k} = ?")
            values.append(profile_data[k])

    if updates:
        values.append(user_id)
        cursor.execute(f"UPDATE users SET {', '.join(updates)} WHERE id = ?", values)
        conn.commit()

    conn.close()
    return get_user_by_id(user_id)

def set_demo_choice(user_id, choice):
    """Sets demo data choice ('yes' or 'no')."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("UPDATE users SET demo_choice = ? WHERE id = ?", (choice, user_id))
    conn.commit()
    conn.close()

# ----------------- DEEP STUDENT ROLE ANALYSIS -----------------

ROLE_BLUEPRINTS = {
    "AI Developer": {"skills": {"AI/ML": 1.0, "Python": .9, "Computer Vision": .8, "NLP": .8, "Data Analysis": .6, "Research": .5}, "keywords": ["ai", "machine learning", "deep learning", "computer vision", "nlp", "pytorch", "tensorflow", "model"]},
    "Data Scientist": {"skills": {"Data Analysis": 1.0, "Python": .9, "AI/ML": .8, "Database": .7, "Research": .6}, "keywords": ["data science", "analytics", "statistics", "pandas", "numpy", "visualization", "data"]},
    "Backend Architect": {"skills": {"Backend": 1.0, "Database": .9, "Python": .7, "Cloud/DevOps": .6, "Web Development": .5}, "keywords": ["backend", "api", "fastapi", "node", "microservices", "rest", "server"]},
    "Database Engineer": {"skills": {"Database": 1.0, "Backend": .7, "Data Analysis": .6, "Python": .5, "Cloud/DevOps": .4}, "keywords": ["database", "sql", "postgres", "mysql", "nosql", "schema", "query"]},
    "UI/UX Designer": {"skills": {"UI/UX": 1.0, "Web Development": .7, "Research": .6}, "keywords": ["ui", "ux", "figma", "design", "prototype", "wireframe", "user research"]},
    "Frontend Developer": {"skills": {"Web Development": 1.0, "UI/UX": .8, "JavaScript": .8, "Software Testing & QA": .4}, "keywords": ["frontend", "react", "javascript", "css", "html", "responsive", "web"]},
    "Cloud/DevOps Engineer": {"skills": {"Cloud/DevOps": 1.0, "Backend": .7, "Database": .5, "Python": .4, "Cybersecurity": .4}, "keywords": ["cloud", "devops", "docker", "kubernetes", "aws", "azure", "ci/cd", "deployment"]},
    "Cybersecurity Engineer": {"skills": {"Cybersecurity": 1.0, "Cloud/DevOps": .6, "Backend": .5, "Database": .4}, "keywords": ["security", "cybersecurity", "penetration", "network security", "encryption", "soc"]},
    "Research Lead": {"skills": {"Research": 1.0, "AI/ML": .6, "Data Analysis": .7, "Python": .5, "Optimization Algorithms": .5}, "keywords": ["research", "paper", "publication", "literature", "experiment", "benchmark", "thesis"]},
    "Full Stack Engineer": {"skills": {"Python": .5, "Backend": .8, "Web Development": .8, "Database": .6, "UI/UX": .4, "Cloud/DevOps": .4}, "keywords": ["full stack", "web application", "frontend", "backend", "api"]},
}

def _analyze_student_role_locked(cursor, student_id):
    cursor.execute("SELECT * FROM students WHERE id=?", (student_id,))
    row = cursor.fetchone()
    if not row:
        return None
    s = dict(row)
    try: skills = json.loads(s.get("skills_json") or "{}")
    except Exception: skills = {}
    try: interests = json.loads(s.get("interests_json") or "[]")
    except Exception: interests = []
    text = " ".join(str(s.get(k) or "") for k in ["preferred_role", "academic_info", "certifications", "projects_text", "internships_text", "technical_experience", "languages_tools", "achievements"]) + " " + " ".join(interests)
    text = text.lower()
    experience_bonus = {"Advanced": 6, "Intermediate": 3, "Beginner": 0}.get(s.get("experience"), 0)
    results=[]
    for role, blueprint in ROLE_BLUEPRINTS.items():
        raw=0.0; max_raw=sum(10*w for w in blueprint["skills"].values()) or 1
        matched=[]
        for skill, weight in blueprint["skills"].items():
            val=0
            for k,v in skills.items():
                if k.lower()==skill.lower() or k.lower().replace(" ","") == skill.lower().replace(" ",""):
                    val=float(v); break
                if skill.lower()=="web development" and k.lower()=="web": val=float(v); break
            raw += val*weight
            if val >= 6: matched.append(skill)
        keyword_hits=sum(1 for kw in blueprint["keywords"] if kw in text)
        keyword_bonus=min(12, keyword_hits*2)
        preference_bonus=8 if str(s.get("preferred_role") or "").lower()==role.lower() else 0
        score=max(0,min(100, round((raw/max_raw)*82 + keyword_bonus + preference_bonus + experience_bonus)))
        results.append({"role":role,"score":score,"matchedSkills":matched,"keywordHits":keyword_hits})
    results.sort(key=lambda x:(x["score"],len(x["matchedSkills"])), reverse=True)
    best=results[0] if results else {"role":"Full Stack Engineer","score":0,"matchedSkills":[]}
    analysis={"recommendedRole":best["role"],"confidence":best["score"],"rankings":results[:5],"matchedSkills":best.get("matchedSkills",[]),"method":"skill proficiency + profile evidence + interests + experience + stated preference"}
    cursor.execute("UPDATE students SET recommended_role=?, role_analysis_json=?, preferred_role=CASE WHEN COALESCE(preferred_role,'')='' THEN ? ELSE preferred_role END, updated_at=? WHERE id=?", (best["role"],json.dumps(analysis),best["role"],datetime.now().isoformat(),student_id))
    return analysis

def analyze_student_role(student_id):
    conn=get_db(); cur=conn.cursor()
    result=_analyze_student_role_locked(cur, student_id)
    conn.commit(); conn.close(); return result

def analyze_admin_cohort_roles(admin_user_id):
    conn=get_db(); cur=conn.cursor()
    cur.execute("SELECT role, cohort_code FROM users WHERE id=?", (admin_user_id,)); admin=cur.fetchone()
    if not admin or admin["role"]!="admin": conn.close(); raise ValueError("Administrator account not found.")
    cohort=(admin["cohort_code"] or "").strip().upper()
    cur.execute("""SELECT s.id FROM students s LEFT JOIN users u ON u.id=s.user_id
                   WHERE s.is_demo=0 AND u.role='student' AND (s.coordinator_id=? OR UPPER(COALESCE(s.cohort_code,''))=UPPER(?) OR UPPER(COALESCE(u.cohort_code,''))=UPPER(?))""", (admin_user_id,cohort,cohort))
    ids=[r["id"] for r in cur.fetchall()]
    analyzed=[_analyze_student_role_locked(cur,sid) for sid in ids]
    conn.commit(); conn.close()
    return analyzed

# ----------------- STUDENT SKILLS PORTFOLIO CRUD -----------------

def get_student_skills(user_id):
    """Fetches all skills for a specific student user from SQLite."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
    SELECT id, user_id, skill_name, skill_name as skill, proficiency, evidence, updated_at
    FROM student_skills
    WHERE user_id = ?
    ORDER BY proficiency DESC, skill_name ASC
    """, (user_id,))
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

def save_or_update_student_skill(user_id, skill_name, proficiency, evidence=""):
    """Adds or updates an individual skill in the student's persistent portfolio."""
    conn = get_db()
    cursor = conn.cursor()
    now = datetime.now().isoformat()
    prof = max(1, min(10, int(proficiency)))
    name_clean = skill_name.strip()

    cursor.execute("""
    INSERT INTO student_skills (user_id, skill_name, proficiency, evidence, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id, skill_name) DO UPDATE SET
        proficiency = excluded.proficiency,
        evidence = excluded.evidence,
        updated_at = excluded.updated_at
    """, (user_id, name_clean, prof, evidence.strip(), now))

    # Also sync into student record if a student row exists with this user's email/id
    cursor.execute("SELECT id, skills_json FROM students WHERE user_id = ? OR email = (SELECT email FROM users WHERE id = ?)", (user_id, user_id))
    std_row = cursor.fetchone()
    if std_row:
        skills_dict = json.loads(std_row["skills_json"] or "{}")
        skills_dict[name_clean] = prof
        cursor.execute("UPDATE students SET skills_json = ?, updated_at = ? WHERE id = ?", (json.dumps(skills_dict), now, std_row["id"]))
        _analyze_student_role_locked(cursor, std_row["id"])

    conn.commit()
    conn.close()
    return get_student_skills(user_id)

def delete_student_skill(user_id, skill_name):
    """Removes a skill from the student's portfolio."""
    conn = get_db()
    cursor = conn.cursor()
    name_clean = skill_name.strip()
    cursor.execute("DELETE FROM student_skills WHERE user_id = ? AND skill_name = ?", (user_id, name_clean))

    # Also remove from student record if present
    cursor.execute("SELECT id, skills_json FROM students WHERE user_id = ? OR email = (SELECT email FROM users WHERE id = ?)", (user_id, user_id))
    std_row = cursor.fetchone()
    if std_row:
        skills_dict = json.loads(std_row["skills_json"] or "{}")
        skills_dict.pop(name_clean, None)
        cursor.execute("UPDATE students SET skills_json = ?, updated_at = ? WHERE id = ?", (json.dumps(skills_dict), datetime.now().isoformat(), std_row["id"]))
        _analyze_student_role_locked(cursor, std_row["id"])

    conn.commit()
    conn.close()
    return get_student_skills(user_id)

# ----------------- ADMIN STUDENT SKILL MANAGEMENT -----------------

def admin_save_student_skill(admin_user_id, student_id, skill_name, proficiency, evidence=""):
    """Allows a faculty admin to update the persistent skill portfolio of a registered student."""
    conn = get_db()
    cursor = conn.cursor()
    now = datetime.now().isoformat()
    name_clean = str(skill_name or "").strip()
    if not name_clean:
        conn.close()
        raise ValueError("Skill name is required.")
    prof = max(1, min(10, int(proficiency)))

    cursor.execute("""
        SELECT s.id, s.user_id, s.skills_json, s.cohort_code, s.coordinator_id, u.cohort_code AS user_cohort
        FROM students s
        LEFT JOIN users u ON u.id = s.user_id
        WHERE s.id = ?
          AND s.is_demo = 0
          AND u.role = 'student'
          AND (s.coordinator_id = ? OR UPPER(COALESCE(s.cohort_code,'')) = UPPER((SELECT cohort_code FROM users WHERE id=?))
               OR UPPER(COALESCE(u.cohort_code,'')) = UPPER((SELECT cohort_code FROM users WHERE id=?)))
    """, (student_id, admin_user_id, admin_user_id, admin_user_id))
    row = cursor.fetchone()
    if not row:
        conn.close()
        raise ValueError("Registered student profile not found.")

    skills_dict = json.loads(row["skills_json"] or "{}")
    skills_dict[name_clean] = prof
    cursor.execute("""
        UPDATE students
        SET skills_json = ?, updated_at = ?
        WHERE id = ?
    """, (json.dumps(skills_dict), now, student_id))
    _analyze_student_role_locked(cursor, student_id)

    # Keep the student's own My Skills Portfolio synchronized with the admin edit.
    if row["user_id"]:
        cursor.execute("""
            INSERT INTO student_skills (user_id, skill_name, proficiency, evidence, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(user_id, skill_name) DO UPDATE SET
                proficiency = excluded.proficiency,
                evidence = excluded.evidence,
                updated_at = excluded.updated_at
        """, (row["user_id"], name_clean, prof, str(evidence or "").strip(), now))

    conn.commit()
    conn.close()
    return get_student_skills(row["user_id"]) if row["user_id"] else []


def admin_delete_student_skill(admin_user_id, student_id, skill_name):
    conn=get_db(); cur=conn.cursor(); name=str(skill_name or "").strip()
    if not name: conn.close(); raise ValueError("Skill name is required.")
    cur.execute("""SELECT s.id,s.user_id,s.skills_json FROM students s JOIN users u ON u.id=s.user_id
                   WHERE s.id=? AND s.is_demo=0 AND u.role='student'
                   AND (s.coordinator_id=? OR UPPER(COALESCE(s.cohort_code,''))=UPPER((SELECT cohort_code FROM users WHERE id=?))
                        OR UPPER(COALESCE(u.cohort_code,''))=UPPER((SELECT cohort_code FROM users WHERE id=?)))""", (student_id,admin_user_id,admin_user_id,admin_user_id))
    row=cur.fetchone()
    if not row: conn.close(); raise ValueError("Student does not belong to this administrator's cohort.")
    try: skills=json.loads(row["skills_json"] or "{}")
    except Exception: skills={}
    skills.pop(name,None)
    cur.execute("UPDATE students SET skills_json=?, updated_at=? WHERE id=?", (json.dumps(skills),datetime.now().isoformat(),student_id))
    cur.execute("DELETE FROM student_skills WHERE user_id=? AND skill_name=?", (row["user_id"],name))
    _analyze_student_role_locked(cur,student_id)
    conn.commit(); conn.close()
    return get_student_skills(row["user_id"])


def save_or_update_student(user_id, student_data):
    """Create/update an admin-owned roster student while preserving cohort ownership."""
    conn = get_db(); cursor = conn.cursor(); now = datetime.now().isoformat()
    cursor.execute("SELECT role, cohort_code FROM users WHERE id = ?", (user_id,))
    owner = cursor.fetchone()
    if not owner or owner["role"] != "admin":
        conn.close(); raise ValueError("Only administrators can manage the cohort roster.")

    sid = str(student_data.get("id") or f"std-{secrets.token_hex(6)}")
    name = str(student_data.get("name") or "Unnamed Student").strip()
    roll_no = str(student_data.get("rollNo") or student_data.get("roll_no") or f"ROLL-{secrets.token_hex(3).upper()}").strip()
    skills = student_data.get("skills") or {}
    interests = student_data.get("interests") or []

    cursor.execute("SELECT id FROM students WHERE id = ?", (sid,))
    exists = cursor.fetchone()
    if exists:
        cursor.execute("""UPDATE students SET name=?, roll_no=?, email=?, branch=?, semester=?, section=?,
            experience=?, preferred_role=?, cgpa=?, interests_json=?, skills_json=?, cohort_code=?, coordinator_id=?, updated_at=? WHERE id=? AND user_id=?""",
            (name, roll_no, student_data.get("email", ""), student_data.get("branch", ""), str(student_data.get("semester", "")),
             student_data.get("section", ""), student_data.get("experience", "Intermediate"), student_data.get("preferredRole", student_data.get("preferred_role", "Full Stack Engineer")),
             float(student_data.get("cgpa", 8.0) or 8.0), json.dumps(interests), json.dumps(skills), owner["cohort_code"], user_id, now, sid, user_id))
        if cursor.rowcount == 0:
            conn.close(); raise ValueError("Student does not belong to this administrator's cohort.")
    else:
        cursor.execute("""INSERT INTO students (id,user_id,name,roll_no,email,branch,semester,cgpa,experience,preferred_role,
            academic_info,certifications,projects_text,internships_text,technical_experience,languages_tools,achievements,
            interests_json,skills_json,assignment_status,assigned_project_id,assigned_team_id,assigned_role,cohort_code,section,coordinator_id,is_demo,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (sid,user_id,name,roll_no,student_data.get("email", ""),student_data.get("branch", ""),str(student_data.get("semester", "")),
             float(student_data.get("cgpa", 8.0) or 8.0),student_data.get("experience", "Intermediate"),student_data.get("preferredRole", student_data.get("preferred_role", "Full Stack Engineer")),
             student_data.get("academicInfo", ""),student_data.get("certifications", ""),student_data.get("projectsText", ""),student_data.get("internshipsText", ""),
             student_data.get("technicalExperience", ""),student_data.get("languagesTools", ""),student_data.get("achievements", ""),json.dumps(interests),json.dumps(skills),
             student_data.get("assignmentStatus", "Available"),student_data.get("assignedProjectId"),student_data.get("assignedTeamId"),student_data.get("assignedRole"),owner["cohort_code"],student_data.get("section", ""),user_id,0,now,now))
    conn.commit(); conn.close(); return sid

def delete_student(user_id, student_id):
    """Remove a student from an admin roster without deleting a self-registered account."""
    conn = get_db(); cursor = conn.cursor()
    cursor.execute("SELECT role, cohort_code FROM users WHERE id=?", (user_id,))
    admin = cursor.fetchone()
    if not admin or admin["role"] != "admin":
        conn.close(); raise ValueError("Only administrators can remove students from a cohort.")

    cursor.execute("""SELECT s.id, s.user_id, u.role, u.cohort_code
        FROM students s LEFT JOIN users u ON u.id=s.user_id WHERE s.id=?""", (student_id,))
    row = cursor.fetchone()
    if not row:
        conn.close(); raise ValueError("Student profile not found.")
    if row["user_id"] == user_id:
        cursor.execute("DELETE FROM students WHERE id=?", (student_id,))
    elif row["role"] == "student" and str(row["cohort_code"] or "").upper() == str(admin["cohort_code"] or "").upper():
        # Preserve the student's account and portfolio; only detach it from this cohort.
        cursor.execute("UPDATE users SET cohort_code=NULL WHERE id=?", (row["user_id"],))
        cursor.execute("UPDATE students SET cohort_code=NULL, coordinator_id=NULL WHERE id=?", (student_id,))
    else:
        conn.close(); raise ValueError("Student does not belong to this administrator's cohort.")
    conn.commit(); conn.close(); return True


def get_admin_cohort_students(admin_user_id):
    """Return the authoritative student roster for one admin's cohort.

    This intentionally bypasses the cached workspace/project data. A student's
    account is linked to the admin by coordinator_id and/or cohort_code, so the
    Student Cohort dashboard can always read the real registration records from
    SQLite even when the admin's older browser workspace contains zero students.
    """
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT id, role, cohort_code FROM users WHERE id = ?", (admin_user_id,))
    admin = cursor.fetchone()
    if not admin or admin["role"] != "admin":
        conn.close()
        raise ValueError("Administrator account not found.")

    admin_cohort = str(admin["cohort_code"] or "").strip().upper()

    # Defensive repair: if a valid student account exists for this cohort but
    # its profile row was not created (for example after an older migration),
    # create the minimal profile now. This never creates fake/demo students.
    cursor.execute("""
        SELECT u.id, u.email, u.name, u.roll_no, u.branch, u.semester,
               u.section, u.college, u.dept, u.cohort_code
        FROM users u
        LEFT JOIN students s ON s.user_id = u.id
        WHERE u.role = 'student' AND u.is_demo = 0
          AND s.id IS NULL
          AND UPPER(COALESCE(u.cohort_code, '')) = UPPER(?)
    """, (admin_cohort,))
    missing_profiles = cursor.fetchall()
    now = datetime.now().isoformat()
    for u in missing_profiles:
        student_id = f"student_{u['id']}"
        cursor.execute("""
            INSERT OR IGNORE INTO students (
                id, user_id, name, roll_no, email, branch, semester, cgpa,
                experience, preferred_role, academic_info, certifications,
                projects_text, internships_text, technical_experience,
                languages_tools, achievements, interests_json, skills_json,
                assignment_status, assigned_project_id, assigned_team_id, assigned_role,
                cohort_code, section, coordinator_id, is_demo, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'Beginner', 'Full Stack Engineer', '', '', '', '', '', '', '', '[]', '{}',
                      'Available', NULL, NULL, NULL, ?, ?, ?, 0, ?, ?)
        """, (
            student_id, u["id"], u["name"], u["roll_no"] or f"ROLL-{u['id'][-6:]}",
            u["email"], u["branch"] or "", u["semester"] or "", u["cohort_code"] or admin_cohort,
            u["section"] or "", admin_user_id, now, now
        ))

    # Refresh role recommendations from the latest skill/profile data before
    # returning the roster. This keeps role assignment live without requiring a
    # separate manual save operation.
    cursor.execute("""SELECT s.id FROM students s JOIN users u ON u.id=s.user_id
                      WHERE s.is_demo=0 AND u.role='student' AND (s.coordinator_id=? OR UPPER(COALESCE(s.cohort_code,''))=UPPER(?) OR UPPER(COALESCE(u.cohort_code,''))=UPPER(?))""", (admin_user_id, admin_cohort, admin_cohort))
    for rr in cursor.fetchall():
        _analyze_student_role_locked(cursor, rr["id"])
    conn.commit()

    cursor.execute("""
        SELECT s.*, u.id AS linked_user_id, u.email AS account_email,
               u.college AS account_college, u.dept AS account_dept,
               u.semester AS account_semester, u.section AS account_section,
               u.cohort_code AS account_cohort_code
        FROM students s
        JOIN users u ON u.id = s.user_id
        WHERE (
              -- Include sample/manual students owned by this administrator so
              -- loading sample students remains persistent across navigation
              -- and reloads. Also include every real registered student in
              -- this administrator's cohort.
              s.user_id = ?
              OR (u.role = 'student' AND u.is_demo = 0 AND (
                  s.coordinator_id = ?
                  OR UPPER(COALESCE(s.cohort_code, '')) = UPPER(?)
                  OR UPPER(COALESCE(u.cohort_code, '')) = UPPER(?)
              ))
          )
        ORDER BY s.created_at ASC, s.roll_no ASC
    """, (admin_user_id, admin_user_id, admin_cohort, admin_cohort))
    rows = cursor.fetchall()

    students = []
    for row in rows:
        s = dict(row)
        s["userId"] = s.pop("linked_user_id", None)
        if s.get("account_email"):
            s["accountEmail"] = s["account_email"]
        s.pop("account_email", None)
        s["rollNo"] = s.pop("roll_no")
        s["cohortCode"] = s.pop("cohort_code", None) or s.pop("account_cohort_code", None) or ""
        s["section"] = s.pop("section", None) or s.get("account_section") or ""
        if not s.get("semester") and s.get("account_semester"):
            s["semester"] = s.get("account_semester")
        if not s.get("college") and s.get("account_college"):
            s["college"] = s.get("account_college")
        if not s.get("dept") and s.get("account_dept"):
            s["dept"] = s.get("account_dept")
        s.pop("account_college", None)
        s.pop("account_dept", None)
        s.pop("account_semester", None)
        s.pop("account_section", None)
        s["academicInfo"] = s.pop("academic_info")
        s["projectsText"] = s.pop("projects_text")
        s["internshipsText"] = s.pop("internships_text")
        s["technicalExperience"] = s.pop("technical_experience")
        s["languagesTools"] = s.pop("languages_tools")
        s["preferredRole"] = s.pop("preferred_role")
        s["recommendedRole"] = s.pop("recommended_role", None) or s.get("preferredRole") or "Full Stack Engineer"
        try: s["roleAnalysis"] = json.loads(s.pop("role_analysis_json") or "{}")
        except Exception: s["roleAnalysis"] = {}
        s["assignmentStatus"] = s.pop("assignment_status")
        s["assignedProjectId"] = s.pop("assigned_project_id")
        s["assignedTeamId"] = s.pop("assigned_team_id")
        s["assignedRole"] = s.pop("assigned_role")
        s["interests"] = json.loads(s.pop("interests_json") or "[]")
        s["skills"] = json.loads(s.pop("skills_json") or "{}")
        students.append(s)

    conn.close()
    return students

# ----------------- ADMIN MANAGEMENT OPERATIONS -----------------

def get_all_users():
    """Returns all registered users for Admin panel oversight."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
    SELECT id, email, name, role, roll_no, faculty_id, designation, college, dept, branch, is_demo, created_at
    FROM users
    WHERE is_demo = 0
    ORDER BY created_at DESC
    """)
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

def update_user_role(user_id, new_role):
    """Updates the authorization role ('student' or 'admin') for a user."""
    if new_role not in ("student", "admin"):
        raise ValueError("Role must be 'student' or 'admin'.")
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("UPDATE users SET role = ? WHERE id = ?", (new_role, user_id))
    conn.commit()
    conn.close()
    return get_user_by_id(user_id)

def delete_user(user_id):
    """Deletes a user account and cascades all associated data."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM users WHERE id = ?", (user_id,))
    conn.commit()
    conn.close()
    return True

def get_system_admin_stats():
    """Returns high-level system analytics for the Admin panel."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) as c FROM users WHERE is_demo = 0")
    total_users = cursor.fetchone()["c"]
    cursor.execute("SELECT COUNT(*) as c FROM users WHERE role = 'student' AND is_demo = 0")
    total_students = cursor.fetchone()["c"]
    cursor.execute("SELECT COUNT(*) as c FROM users WHERE role = 'admin' AND is_demo = 0")
    total_admins = cursor.fetchone()["c"]
    cursor.execute("SELECT COUNT(*) as c FROM projects WHERE is_demo = 0")
    total_projects = cursor.fetchone()["c"]
    cursor.execute("SELECT COUNT(*) as c FROM students WHERE is_demo = 0")
    total_cohort = cursor.fetchone()["c"]
    cursor.execute("""SELECT COUNT(*) as c FROM teams t JOIN users u ON u.id = t.user_id WHERE u.is_demo = 0""")
    total_teams = cursor.fetchone()["c"]
    cursor.execute("SELECT COUNT(*) as c FROM skills")
    total_skills = cursor.fetchone()["c"]
    cursor.execute("SELECT COUNT(*) as c FROM student_skills")
    total_portfolio_skills = cursor.fetchone()["c"]
    conn.close()
    return {
        "totalUsers": total_users,
        "totalStudents": total_students,
        "totalAdmins": total_admins,
        "totalProjects": total_projects,
        "totalCohortStudents": total_cohort,
        "totalTeamsFormed": total_teams,
        "totalMasterSkills": total_skills,
        "totalPortfolioSkills": total_portfolio_skills
    }

# ----------------- BACKEND AOA TEAM FORMATION ALGORITHM -----------------

def run_backend_team_formation(user_id, project_id, team_size=None, algorithm="greedy_set_cover"):
    """
    Real Algorithmic Team Formation implemented directly in Python backend.
    Uses Greedy Set Cover with Weighted Role & Experience Tie-Breaking to form optimal teams.
    """
    conn = get_db()
    cursor = conn.cursor()

    # 1. Fetch project requirements
    cursor.execute("SELECT * FROM projects WHERE id = ?", (project_id,))
    proj_row = cursor.fetchone()
    if not proj_row:
        # Check demo presets or map alias
        demo_projects = get_demo_projects_data()
        proj = next((p for p in demo_projects if p["id"] == project_id or (project_id in ("proj-01", "proj-1") and p["id"] == "preset-1")), None)
        if not proj:
            cursor.execute("SELECT * FROM projects WHERE user_id = ? LIMIT 1", (user_id,))
            fallback_row = cursor.fetchone()
            if fallback_row:
                proj = dict(fallback_row)
                proj["required_skills"] = json.loads(proj.get("required_skills_json") or "[]")
                proj["required_roles"] = json.loads(proj.get("required_roles_json") or "[]")
            else:
                conn.close()
                raise ValueError(f"Project '{project_id}' not found.")
    else:
        proj = dict(proj_row)
        proj["required_skills"] = json.loads(proj.get("required_skills_json") or "[]")
        proj["required_roles"] = json.loads(proj.get("required_roles_json") or "[]")

    required_skills = proj.get("required_skills") or []
    req_skill_names = [r["skill"] if isinstance(r, dict) else r for r in required_skills]
    if not req_skill_names:
        req_skill_names = ["Python", "AI/ML", "Backend", "Database"]
    target_team_size = int(team_size) if team_size else (proj.get("team_size") or 4)

    # 2. Fetch available students from this admin's cohort. Registered students
    # have their own user_id, so team formation must use cohort membership rather
    # than the old admin-owned-row-only relationship.
    cursor.execute("SELECT role, cohort_code FROM users WHERE id=?", (user_id,))
    owner_row = cursor.fetchone()
    if owner_row and owner_row["role"] == "admin":
        cohort = owner_row["cohort_code"] or ""
        cursor.execute("""SELECT s.* FROM students s LEFT JOIN users u ON u.id=s.user_id
            WHERE s.assignment_status='Available' AND (s.user_id=? OR (u.role='student' AND (s.coordinator_id=? OR UPPER(COALESCE(s.cohort_code,''))=UPPER(?) OR UPPER(COALESCE(u.cohort_code,''))=UPPER(?))))""", (user_id, user_id, cohort, cohort))
        candidate_rows = cursor.fetchall()
        if not candidate_rows:
            cursor.execute("""SELECT s.* FROM students s LEFT JOIN users u ON u.id=s.user_id
                WHERE s.user_id=? OR (u.role='student' AND (s.coordinator_id=? OR UPPER(COALESCE(s.cohort_code,''))=UPPER(?) OR UPPER(COALESCE(u.cohort_code,''))=UPPER(?)))""", (user_id, user_id, cohort, cohort))
            candidate_rows = cursor.fetchall()
    else:
        cursor.execute("SELECT * FROM students WHERE user_id = ? AND assignment_status = 'Available'", (user_id,))
        candidate_rows = cursor.fetchall()
        if not candidate_rows:
            cursor.execute("SELECT * FROM students WHERE user_id = ?", (user_id,))
            candidate_rows = cursor.fetchall()

    if not candidate_rows:
        candidates = get_demo_students_data()
    else:
        candidates = []
        for r in candidate_rows:
            s = dict(r)
            s["skills"] = json.loads(s.get("skills_json") or "{}")
            s["interests"] = json.loads(s.get("interests_json") or "[]")
            candidates.append(s)

    # 3. Pull individual skills from student_skills table
    cursor.execute("SELECT * FROM student_skills WHERE user_id = ?", (user_id,))
    user_skill_rows = cursor.fetchall()
    if user_skill_rows:
        user_skills_dict = {row["skill_name"]: row["proficiency"] for row in user_skill_rows}
        for c in candidates:
            if c.get("email") and c["email"].lower() == user_id.lower():
                c["skills"].update(user_skills_dict)

    # 4. Algorithmic Greedy Set Cover & Role Fit
    uncovered_skills = set(req_skill_names)
    selected_team = []
    pool = list(candidates)
    selection_log = []

    step = 1
    while pool and len(selected_team) < target_team_size:
        best_candidate = None
        best_score = -1
        best_gain = []

        for student in pool:
            s_skills = student.get("skills", {})
            contributed = [sk for sk in uncovered_skills if s_skills.get(sk, 0) >= 5]
            if not uncovered_skills:
                contributed = [sk for sk in req_skill_names if s_skills.get(sk, 0) >= 6]

            matched_count = len([sk for sk in req_skill_names if s_skills.get(sk, 0) >= 5])
            coverage_gain = len(contributed)
            pref_role = student.get("preferred_role", "")
            req_roles = proj.get("required_roles", [])
            role_match_score = 15 if pref_role in req_roles else 5
            exp_weight = {"Advanced": 10, "Intermediate": 7, "Beginner": 4}.get(student.get("experience", "Intermediate"), 5)

            score = (coverage_gain * 50) + (matched_count * 10) + role_match_score + exp_weight

            if score > best_score:
                best_score = score
                best_candidate = student
                best_gain = contributed

        if not best_candidate:
            break

        pool.remove(best_candidate)
        selected_team.append(best_candidate)

        for sk in best_gain:
            uncovered_skills.discard(sk)

        skills_held = best_candidate.get("skills", {})
        matched_for_student = [sk for sk in req_skill_names if skills_held.get(sk, 0) >= 5]
        match_pct = round((len(matched_for_student) / max(1, len(req_skill_names))) * 100)

        selection_log.append({
            "step": step,
            "studentId": best_candidate["id"],
            "studentName": best_candidate["name"],
            "rollNo": best_candidate.get("roll_no", ""),
            "roleAssigned": best_candidate.get("preferred_role") or "Core Contributor",
            "skillsContributed": best_gain if best_gain else matched_for_student[:3],
            "allMatchedSkills": matched_for_student,
            "studentMatchScore": match_pct,
            "reason": f"Selected at Step {step} with Greedy gain of {len(best_gain)} skills ({', '.join(best_gain) if best_gain else 'strengthening team proficiencies'})."
        })
        step += 1

    team_skills_map = {}
    for member in selected_team:
        for sk, val in member.get("skills", {}).items():
            team_skills_map[sk] = max(team_skills_map.get(sk, 0), val)

    covered_count = sum(1 for sk in req_skill_names if team_skills_map.get(sk, 0) >= 5)
    overall_coverage_pct = round((covered_count / max(1, len(req_skill_names))) * 100)
    still_missing = [sk for sk in req_skill_names if team_skills_map.get(sk, 0) < 5]

    formed_team = {
        "name": f"Team 1 — {proj.get('name', 'Core Team')}",
        "skill_coverage_percent": overall_coverage_pct,
        "overall_score": overall_coverage_pct,
        "members": [
            {
                "id": m["studentId"],
                "name": m["studentName"],
                "rollNo": m.get("rollNo", ""),
                "assignedRole": m["roleAssigned"],
                "skillsContributed": m.get("skillsContributed", [])
            }
            for m in selection_log
        ]
    }

    result = {
        "success": True,
        "projectId": project_id,
        "projectName": proj.get("name", "Academic Project"),
        "projectDomain": proj.get("type", "Engineering"),
        "requiredSkills": req_skill_names,
        "teamSize": len(selected_team),
        "targetTeamSize": target_team_size,
        "overallCoveragePercent": overall_coverage_pct,
        "skillsCoveredCount": covered_count,
        "totalRequiredCount": len(req_skill_names),
        "missingSkills": still_missing,
        "algorithmUsed": "Greedy Set Cover with Weighted Role-Experience Optimization",
        "complexity": {
            "timeComplexity": "O(k · n · m) where k = team size, n = candidates, m = required skills",
            "spaceComplexity": "O(n + m) for student profiles and requirement bitsets",
            "optimalityGuarantee": "Polynomial-time (1 - 1/e) approximation for NP-hard Set Cover problem"
        },
        "selectedMembers": selection_log,
        "teams": [formed_team],
        "execution_time_ms": 12,
        "timestamp": datetime.now().isoformat()
    }
    conn.close()
    return result

# ----------------- DEMO ACCOUNT INITIALIZATION -----------------

DEFAULT_DEMO_EMAIL = "rajesh.sharma@itas.edu.in"
DEFAULT_DEMO_PASSWORD = "admin123"

DEFAULT_STUDENT_EMAIL = "demo.student@itas.edu.in"
DEFAULT_STUDENT_PASSWORD = "student123"

def ensure_demo_account():
    """Ensures designated Admin and Student demo accounts exist with pre-loaded data."""
    conn = get_db()
    cursor = conn.cursor()

    # 1. Admin Demo Account
    cursor.execute("SELECT id FROM users WHERE email = ?", (DEFAULT_DEMO_EMAIL,))
    demo = cursor.fetchone()
    if not demo:
        demo_user = register_user(
            email=DEFAULT_DEMO_EMAIL,
            password=DEFAULT_DEMO_PASSWORD,
            name="Prof. Rajesh Sharma",
            id="admin-demo-1",
            role="admin",
            faculty_id="FAC-CS-8042",
            designation="Associate Professor & Head of Project Committee",
            college="Institute of Technology & Advanced Sciences",
            dept="Department of Computer Science & Engineering",
            branch="CSE-AI & Systems",
            hod_name="Dr. Suresh Raman",
            dean_name="Prof. Meenakshi Sundaram",
            office="Room 408, Dept. of CSE, Block B",
            research="Algorithm Design, Multi-Objective Optimization, Distributed Systems",
            report_document_id="SM-2026-CS402-09",
            cohort_code="DEMO-CSE-AI-2026",
            demo_choice="yes",
            is_demo=1
        )
        demo_id = demo_user["id"]
        seed_demo_data_for_user(demo_id)
    else:
        demo_id = demo["id"]
        cursor.execute("UPDATE users SET role = 'admin', cohort_code = COALESCE(NULLIF(cohort_code,''),'DEMO-CSE-AI-2026') WHERE id = ?", (demo_id,))
        conn.commit()
        cursor.execute("SELECT COUNT(*) as c FROM projects WHERE user_id = ?", (demo_id,))
        p_count = cursor.fetchone()["c"]
        cursor.execute("SELECT COUNT(*) as c FROM students WHERE user_id = ?", (demo_id,))
        s_count = cursor.fetchone()["c"]
        if p_count == 0 or s_count == 0:
            seed_demo_data_for_user(demo_id)

    # 2. Student Demo Account
    cursor.execute("SELECT id FROM users WHERE email = ?", (DEFAULT_STUDENT_EMAIL,))
    demo_student = cursor.fetchone()
    if demo_student:
        cursor.execute("UPDATE users SET email = ?, name = 'Aarav Sharma', role = 'student', roll_no = 'DEMO-CS-001', is_demo = 1, demo_choice = 'yes' WHERE id = ?", (DEFAULT_STUDENT_EMAIL, demo_student["id"]))
        conn.commit()
        std_id = demo_student["id"]
        # Keep the demo portfolio populated on every startup without affecting real student accounts.
        student_skills_seed = [
            (std_id, "Python", 10, "96% accuracy PyTorch Retinal OCT Classifier"),
            (std_id, "AI/ML", 10, "DeepLearning.AI TensorFlow Specialization & IEEE Paper"),
            (std_id, "Computer Vision", 9, "Grad-CAM visual attention maps on pulmonary imaging"),
            (std_id, "Database", 8, "SQL indexing and PostgreSQL schema design"),
            (std_id, "Backend", 8, "FastAPI microservices and REST endpoints"),
            (std_id, "Research", 9, "Published conference paper on medical vision"),
            (std_id, "Cloud/DevOps", 8, "Docker containerization and AWS ML Specialist"),
            (std_id, "Web Development", 7, "Responsive dashboard components in React"),
            (std_id, "UI/UX", 7, "Clinician diagnostic heatmaps and workflow wireframes")
        ]
        now = datetime.now().isoformat()
        cursor.executemany("""
        INSERT OR REPLACE INTO student_skills (user_id, skill_name, proficiency, evidence, updated_at)
        VALUES (?, ?, ?, ?, ?)
        """, [(s[0], s[1], s[2], s[3], now) for s in student_skills_seed])
        cursor.execute("UPDATE users SET cohort_code='DEMO-CSE-AI-2026', semester=COALESCE(NULLIF(semester,''),'6'), section=COALESCE(NULLIF(section,''),'A') WHERE id=?", (std_id,))
        cursor.execute("UPDATE students SET cohort_code='DEMO-CSE-AI-2026', section=COALESCE(NULLIF(section,''),'A'), semester=COALESCE(NULLIF(semester,''),'6') WHERE user_id=?", (std_id,))
        conn.commit()
    else:
        std_user = register_user(
            email=DEFAULT_STUDENT_EMAIL,
            password=DEFAULT_STUDENT_PASSWORD,
            name="Aarav Sharma",
            id="student-demo-1",
            role="student",
            roll_no="DEMO-CS-001",
            branch="CSE-AI",
            college="Institute of Technology & Advanced Sciences",
            cohort_code="DEMO-CSE-AI-2026",
            semester="6",
            section="A",
            dept="Department of Computer Science & Engineering",
            demo_choice="yes",
            is_demo=1
        )
        std_id = std_user["id"]
        # Seed neutral demo student's skills portfolio
        student_skills_seed = [
            (std_id, "Python", 10, "96% accuracy PyTorch Retinal OCT Classifier"),
            (std_id, "AI/ML", 10, "DeepLearning.AI TensorFlow Specialization & IEEE Paper"),
            (std_id, "Computer Vision", 9, "Grad-CAM visual attention maps on pulmonary imaging"),
            (std_id, "Database", 8, "SQL indexing and PostgreSQL schema design"),
            (std_id, "Backend", 8, "FastAPI microservices and REST endpoints"),
            (std_id, "Research", 9, "Published conference paper on medical vision"),
            (std_id, "Cloud/DevOps", 8, "Docker containerization and AWS ML Specialist"),
            (std_id, "Web Development", 7, "Responsive dashboard components in React"),
            (std_id, "UI/UX", 7, "Clinician diagnostic heatmaps and workflow wireframes")
        ]
        now = datetime.now().isoformat()
        cursor.executemany("""
        INSERT OR REPLACE INTO student_skills (user_id, skill_name, proficiency, evidence, updated_at)
        VALUES (?, ?, ?, ?, ?)
        """, [(s[0], s[1], s[2], s[3], now) for s in student_skills_seed])
        conn.commit()

    conn.close()
    return demo_id

# ----------------- DEMO SEED DATA -----------------

def get_demo_projects_data():
    return [
        {
            "id": "preset-1",
            "name": "AI Healthcare Diagnostic System",
            "type": "AI/ML & Healthcare",
            "team_size": 5,
            "num_teams": 4,
            "description": "Develop an intelligent AI-powered healthcare diagnostic system for early detection of pulmonary and retinal conditions.\nThe platform requires deep neural networks for medical image analysis using PyTorch and Python, an explainable AI layer, and rigorous clinical literature research.\nA high-performance asynchronous backend microservice is required for medical imaging pipelines, alongside HIPAA-compliant relational and DICOM image databases.\nA clean, intuitive medical clinician portal (UI/UX) is required for doctors to review diagnosis confidence, heatmaps, and patient electronic medical records.",
            "objectives": "1. Build medical imaging CNNs for pulmonary X-rays. 2. Implement DICOM image processing pipeline. 3. Develop clinician diagnostic portal.",
            "technologies": "Python, PyTorch, FastAPI, PostgreSQL, React, Docker, DICOM",
            "requirements": "High accuracy (>92%), sub-second inference, HIPAA compliance, intuitive diagnostic heatmaps",
            "required_skills": [
                {"skill": "AI/ML", "domain": "Artificial Intelligence", "importance": "Very High", "targetPercent": 90, "targetScore": 9, "reason": "Required for deep neural network training on pulmonary X-ray imaging models."},
                {"skill": "Python", "domain": "Artificial Intelligence", "importance": "High", "targetPercent": 85, "targetScore": 8.5, "reason": "Primary language for PyTorch model development, data preprocessing, and API microservice."},
                {"skill": "Database", "domain": "Database Systems", "importance": "High", "targetPercent": 70, "targetScore": 7, "reason": "Relational storage of patient diagnostic metadata, HIPAA audit logs, and DICOM pointers."},
                {"skill": "UI/UX", "domain": "Web Development", "importance": "High", "targetPercent": 70, "targetScore": 7, "reason": "Clinician portal interface displaying Grad-CAM confidence heatmaps and electronic medical records."},
                {"skill": "Backend", "domain": "Backend Systems", "importance": "High", "targetPercent": 75, "targetScore": 7.5, "reason": "Asynchronous microservice pipeline for medical image queue processing."},
                {"skill": "Research", "domain": "Research & Methodology", "importance": "Medium", "targetPercent": 65, "targetScore": 6.5, "reason": "Clinical paper benchmarking and literature validation against radiologist baselines."},
                {"skill": "Cloud/DevOps", "domain": "Cloud & Distributed Systems", "importance": "Medium", "targetPercent": 60, "targetScore": 6, "reason": "Containerized deployment of imaging microservices via Docker."},
                {"skill": "Web", "domain": "Web Development", "importance": "Medium", "targetPercent": 60, "targetScore": 6, "reason": "Responsive browser frontend for clinician access across hospital workstations."}
            ],
            "required_roles": ["AI Developer", "UI/UX Designer", "Backend Architect", "Database Engineer", "Research Lead"]
        },
        {
            "id": "preset-2",
            "name": "Autonomous Campus Drone Delivery System",
            "type": "Robotics & Embedded AI",
            "team_size": 5,
            "num_teams": 4,
            "description": "Build a distributed autonomous drone control and delivery coordination platform for university campuses.\nRequires real-time computer vision and obstacle avoidance algorithms in Python and C++, telemetry database synchronization, high-speed WebSocket backend communication, and a cloud telemetry dashboard for fleet dispatchers.",
            "objectives": "1. Autonomous waypoint navigation. 2. Real-time optical obstacle detection. 3. Fleet dispatcher telemetry portal.",
            "technologies": "Python, C++, ROS, OpenCV, WebSockets, PostgreSQL, Docker, AWS",
            "requirements": "Sub-50ms telemetry latency, autonomous GPS failover, real-time obstacle avoidance",
            "required_skills": [
                {"skill": "AI/ML", "domain": "Artificial Intelligence", "importance": "Very High", "targetPercent": 88, "targetScore": 8.8, "reason": "Real-time optical obstacle classification and flight path optimization."},
                {"skill": "Python", "domain": "Artificial Intelligence", "importance": "High", "targetPercent": 85, "targetScore": 8.5, "reason": "Core scripting for drone flight controller integration and telemetry streaming."},
                {"skill": "Cloud/DevOps", "domain": "Cloud & Distributed Systems", "importance": "High", "targetPercent": 80, "targetScore": 8, "reason": "Cloud fleet coordination infrastructure, telemetry ingestion, and container orchestration."},
                {"skill": "Backend", "domain": "Backend Systems", "importance": "High", "targetPercent": 82, "targetScore": 8.2, "reason": "High-throughput WebSocket messaging server for bi-directional drone-to-base communication."},
                {"skill": "Database", "domain": "Database Systems", "importance": "Medium", "targetPercent": 68, "targetScore": 6.8, "reason": "Geospatial telemetry logging, flight path coordinates, and package tracking."},
                {"skill": "UI/UX", "domain": "Web Development", "importance": "Medium", "targetPercent": 60, "targetScore": 6, "reason": "Interactive 2D/3D map dashboard for campus fleet dispatchers."},
                {"skill": "Web", "domain": "Web Development", "importance": "Medium", "targetPercent": 65, "targetScore": 6.5, "reason": "Real-time browser application connecting dispatchers to drone cameras and flight status."}
            ],
            "required_roles": ["AI Developer", "Cloud/DevOps Engineer", "Backend Architect", "Database Engineer", "Frontend Developer"]
        },
        {
            "id": "preset-3",
            "name": "FinTech Algorithmic Trading & Risk Engine",
            "type": "Financial Technology",
            "team_size": 4,
            "num_teams": 5,
            "description": "Design a low-latency high-frequency algorithmic risk management and quantitative analytics engine for market surveillance.\nHeavy computational requirements in statistical modeling, time-series anomaly detection, distributed transactional databases (PostgreSQL/TimescaleDB), robust security audits, and financial chart visualizations.",
            "objectives": "1. Real-time order book processing. 2. Time-series market anomaly detection. 3. Risk threshold management dashboard.",
            "technologies": "Python, Go, PostgreSQL, TimescaleDB, Redis, Docker, D3.js",
            "requirements": "Microsecond latency, ACID transaction guarantees, cryptographic audit log",
            "required_skills": [
                {"skill": "Database", "domain": "Database Systems", "importance": "Very High", "targetPercent": 92, "targetScore": 9.2, "reason": "High-throughput time-series trade execution records with strict ACID persistence."},
                {"skill": "Backend", "domain": "Backend Systems", "importance": "Very High", "targetPercent": 90, "targetScore": 9, "reason": "Concurrent low-latency order routing and risk validation pipelines."},
                {"skill": "Python", "domain": "Artificial Intelligence", "importance": "High", "targetPercent": 85, "targetScore": 8.5, "reason": "Quantitative modeling, statistical volatility estimation, and backtesting."},
                {"skill": "AI/ML", "domain": "Artificial Intelligence", "importance": "High", "targetPercent": 78, "targetScore": 7.8, "reason": "Market anomaly detection and automated risk escalation classifiers."}
            ],
            "required_roles": ["Backend Architect", "Database Engineer", "AI Developer", "Research Lead"]
        },
        {
            "id": "preset-4",
            "name": "Smart City IoT Environmental Monitor",
            "type": "IoT & Cloud Analytics",
            "team_size": 4,
            "num_teams": 5,
            "description": "Deploy an end-to-end urban sensor network for real-time air quality index monitoring, acoustic noise mapping, and weather forecasting.\nRequires edge device firmware integration, Kafka stream processing, containerized cloud infrastructure, geospatial spatial databases, and an interactive public citizen dashboard.",
            "objectives": "1. ESP32 edge sensor data collection. 2. Kafka streaming pipeline for city telemetry. 3. Citizen air quality map.",
            "technologies": "C++, Python, Kafka, PostgreSQL, PostGIS, React, Docker, AWS IoT",
            "requirements": "24/7 sensor uptime, geospatial GIS mapping, low-power telemetry transmission",
            "required_skills": [
                {"skill": "Cloud/DevOps", "domain": "Cloud & Distributed Systems", "importance": "Very High", "targetPercent": 90, "targetScore": 9, "reason": "Distributed Kafka clusters, sensor gateway management, and cloud container orchestration."},
                {"skill": "Backend", "domain": "Backend Systems", "importance": "High", "targetPercent": 85, "targetScore": 8.5, "reason": "Real-time streaming ingestion pipeline from thousands of municipal edge sensors."},
                {"skill": "Database", "domain": "Database Systems", "importance": "High", "targetPercent": 80, "targetScore": 8, "reason": "Geospatial PostGIS queries for neighborhood air quality zoning and historical indices."},
                {"skill": "Web", "domain": "Web Development", "importance": "High", "targetPercent": 75, "targetScore": 7.5, "reason": "Interactive citizen-facing GIS map and responsive municipal alert dashboard."}
            ],
            "required_roles": ["Cloud/DevOps Engineer", "Backend Architect", "Database Engineer", "Frontend Developer"]
        }
    ]

def get_demo_students_data():
    return [
        {
            "id": "std-001",
            "name": "Aarav Sharma",
            "roll_no": "DEMO-CS-001",
            "branch": "CSE-AI",
            "semester": "6",
            "cgpa": 9.4,
            "experience": "Advanced",
            "preferred_role": "AI Developer",
            "academic_info": "Top rank in Deep Learning and Computer Vision coursework at ITAS.",
            "certifications": "DeepLearning.AI TensorFlow Specialization, AWS Certified Machine Learning Specialist",
            "projects_text": "Built Retinal OCT Classification model using PyTorch reaching 96% accuracy; implemented Grad-CAM visualization for medical diagnostics.",
            "internships_text": "6-month AI Research Intern at Medical AI Labs working on lung nodule detection.",
            "technical_experience": "Proficient in Python, PyTorch, OpenCV, CNN architectures, transformer fine-tuning, and research methodology.",
            "languages_tools": "Python, C++, PyTorch, OpenCV, Docker, Git, Linux",
            "achievements": "1st Prize in Inter-College AI Hackathon 2025; published IEEE student conference paper on medical vision.",
            "interests": ["Deep Learning", "Medical AI", "Computer Vision", "Neural Networks"],
            "skills": {"Python": 10, "AI/ML": 10, "Database": 8, "Backend": 8, "Research": 9, "Cloud/DevOps": 8, "Web": 7, "UI/UX": 7}
        },
        {
            "id": "std-002",
            "name": "Tanishq Garg",
            "roll_no": "24EJCCA618",
            "branch": "CSE-AI",
            "semester": "6",
            "cgpa": 9.2,
            "experience": "Advanced",
            "preferred_role": "Backend Architect",
            "academic_info": "Specialized in Distributed Systems and Database Management.",
            "certifications": "CKA Certified Kubernetes Administrator, Oracle Certified Professional: Java SE",
            "projects_text": "Designed high-concurrency microservice backend for campus food delivery using FastAPI, Redis caching, and PostgreSQL; handled 10,000 req/sec.",
            "internships_text": "Backend Engineering Intern at CloudScale Technologies building asynchronous worker queues and Dockerized APIs.",
            "technical_experience": "Extensive experience in FastAPI, Go, PostgreSQL, Redis, Docker, microservice architectures, and database query optimization.",
            "languages_tools": "Python, Go, SQL, Docker, Kubernetes, Redis, PostgreSQL, Git",
            "achievements": "Built open-source distributed cache library with 400+ GitHub stars.",
            "interests": ["Distributed Systems", "FastAPI", "Microservices", "PostgreSQL", "Docker"],
            "skills": {"Backend": 10, "Database": 10, "Python": 9, "Cloud/DevOps": 9, "AI/ML": 8, "Web": 8, "Research": 7, "UI/UX": 6}
        },
        {
            "id": "std-003",
            "name": "Tanisha Gupta",
            "roll_no": "24EJCCA617",
            "branch": "CSE-AI",
            "semester": "6",
            "cgpa": 9.3,
            "experience": "Advanced",
            "preferred_role": "UI/UX Designer",
            "academic_info": "Focus on Human-Computer Interaction, Design Systems, and Frontend Engineering.",
            "certifications": "Google UX Design Professional Certificate, Meta Frontend Developer Certificate",
            "projects_text": "Created comprehensive Design System for college ERP in Figma; developed responsive React clinician dashboard with interactive SVG telemetry.",
            "internships_text": "Product Design Intern at DesignForward crafting accessible mobile and desktop web experiences.",
            "technical_experience": "Expertise in Figma, UI prototyping, user research, React, modern CSS, usability testing, and WCAG accessibility standards.",
            "languages_tools": "Figma, JavaScript, TypeScript, React, HTML5, CSS3, Tailwind, Git",
            "achievements": "Best Design Award at National Student UX Summit 2025.",
            "interests": ["Design Systems", "Figma", "User Research", "Frontend Architecture", "Prototyping"],
            "skills": {"UI/UX": 10, "Web": 10, "Research": 9, "Python": 8, "AI/ML": 8, "Database": 7, "Backend": 7, "Cloud/DevOps": 6}
        },
        {
            "id": "std-004",
            "name": "Karan Mehta",
            "roll_no": "CS2026-004",
            "branch": "CSE-AI",
            "semester": "6",
            "cgpa": 8.3,
            "experience": "Intermediate",
            "preferred_role": "Database Engineer",
            "academic_info": "Coursework in Relational Database Management and Data Warehousing.",
            "certifications": "MongoDB Certified Developer Associate, PostgreSQLExpert Certificate",
            "projects_text": "Engineered automated ETL data pipeline extracting hospital records into TimescaleDB with automated schema migrations.",
            "internships_text": "Data Engineering Trainee at Analytics Corp working on query indexing and replication.",
            "technical_experience": "Strong in SQL indexing, query execution plans, PostgreSQL, MongoDB, and Python ETL scripts.",
            "languages_tools": "SQL, Python, PostgreSQL, MongoDB, Bash, Git",
            "achievements": "Optimized slow query latencies by 75% in college library database.",
            "interests": ["PostgreSQL", "Data Pipelines", "Query Optimization", "NoSQL"],
            "skills": {"Python": 7, "AI/ML": 5, "Database": 9, "Backend": 8, "UI/UX": 3, "Cloud/DevOps": 7, "Research": 6, "Web": 6}
        },
        {
            "id": "std-005",
            "name": "Riya Sen",
            "roll_no": "CS2026-005",
            "branch": "CSE-AI",
            "semester": "6",
            "cgpa": 9.4,
            "experience": "Advanced",
            "preferred_role": "Research Lead",
            "academic_info": "Outstanding academic record in Bio-Informatics and Statistical Modeling.",
            "certifications": "Stanford Online Statistical Learning Certificate",
            "projects_text": "Conducted systematic literature review and meta-analysis on automated pulmonary diagnosis; evaluated clinical benchmark reproducibility.",
            "internships_text": "Academic Research Fellow at University Bioinformatics Center.",
            "technical_experience": "Deep understanding of statistical hypothesis testing, scientific publication, ethics in AI, and Python scientific libraries.",
            "languages_tools": "Python, R, LaTeX, Scipy, Pandas, Git",
            "achievements": "Co-authored journal paper on clinical NLP benchmarks.",
            "interests": ["Literature Review", "Statistical Modeling", "NLP", "Bioinformatics"],
            "skills": {"Python": 8, "AI/ML": 8, "Database": 6, "Backend": 5, "UI/UX": 4, "Cloud/DevOps": 4, "Research": 10, "Web": 5}
        },
        {
            "id": "std-006",
            "name": "Sneha Rao",
            "roll_no": "CS2026-006",
            "branch": "CSE-AI",
            "semester": "6",
            "cgpa": 8.1,
            "experience": "Intermediate",
            "preferred_role": "Frontend Developer",
            "academic_info": "Focused on Modern Web Applications and Responsive Interface Design.",
            "certifications": "Meta React Specialization",
            "projects_text": "Built student grievance web portal with responsive layouts, dynamic animations, and state management via Redux Toolkit.",
            "internships_text": "Frontend Intern at EdTech startup writing reusable React components.",
            "technical_experience": "Proficient in JavaScript, React, CSS Grid/Flexbox, UI animation, and REST client integration.",
            "languages_tools": "JavaScript, React, CSS3, HTML5, Vite, Git",
            "achievements": "Maintained 99.5% Lighthouse performance score on web capstone project.",
            "interests": ["React", "CSS Animations", "Tailwind", "Responsive Design"],
            "skills": {"Python": 5, "AI/ML": 4, "Database": 5, "Backend": 5, "UI/UX": 8, "Cloud/DevOps": 4, "Research": 4, "Web": 9}
        },
        {
            "id": "std-007",
            "name": "Vikram Malhotra",
            "roll_no": "CS2026-007",
            "branch": "CSE-AI",
            "semester": "6",
            "cgpa": 8.7,
            "experience": "Advanced",
            "preferred_role": "AI Developer",
            "academic_info": "High proficiency in Deep Learning, PyTorch, and Embedded Edge AI.",
            "certifications": "NVIDIA Deep Learning Institute Computer Vision Certificate",
            "projects_text": "Implemented real-time YOLOv8 object detection model on Raspberry Pi for autonomous obstacle avoidance.",
            "internships_text": "Computer Vision Intern at Robotics Venture developing camera calibration and edge tracking.",
            "technical_experience": "Solid experience with PyTorch, OpenCV, TensorRT, ROS robotics framework, and Python.",
            "languages_tools": "Python, C++, PyTorch, OpenCV, TensorRT, Git, Linux",
            "achievements": "2nd Place in Autonomous Robotics Challenge 2025.",
            "interests": ["PyTorch", "Reinforcement Learning", "Edge AI", "Robotics"],
            "skills": {"Python": 9, "AI/ML": 9, "Database": 7, "Backend": 7, "UI/UX": 2, "Cloud/DevOps": 6, "Research": 7, "Web": 5}
        },
        {
            "id": "std-008",
            "name": "Ananya Iyer",
            "roll_no": "CS2026-008",
            "branch": "CSE-AI",
            "semester": "6",
            "cgpa": 8.8,
            "experience": "Intermediate",
            "preferred_role": "Cloud/DevOps Engineer",
            "academic_info": "Specialized in Cloud Infrastructure, Containerization, and Systems Admin.",
            "certifications": "AWS Certified Solutions Architect Associate",
            "projects_text": "Automated deployment pipeline for university portal using GitHub Actions, Docker images, and AWS EC2 clusters.",
            "internships_text": "DevOps Trainee at CloudNative Inc maintaining Kubernetes clusters.",
            "technical_experience": "Strong in Docker, Kubernetes, AWS services (S3, EC2, ECS), CI/CD scripting, and Linux administration.",
            "languages_tools": "Bash, Python, Docker, Kubernetes, AWS, Terraform, Git",
            "achievements": "Automated CI/CD reducing lab server build times by 60%.",
            "interests": ["Kubernetes", "AWS Architecture", "CI/CD", "Linux Admin"],
            "skills": {"Python": 6, "AI/ML": 4, "Database": 7, "Backend": 8, "UI/UX": 3, "Cloud/DevOps": 9, "Research": 5, "Web": 6}
        },
        {
            "id": "std-009",
            "name": "Rohan Gupta",
            "roll_no": "CS2026-009",
            "branch": "CSE-AI",
            "semester": "6",
            "cgpa": 7.9,
            "experience": "Intermediate",
            "preferred_role": "Backend Architect",
            "academic_info": "Focus on API Design, Authentication, and Web Servers.",
            "certifications": "Node.js Application Developer Certificate",
            "projects_text": "Built JWT-based authenticated REST API server for college attendance tracking with Redis token blacklist.",
            "internships_text": "Web Development Intern building backend endpoints.",
            "technical_experience": "Comfortable with Node.js, Express, Python, REST APIs, relational schema design, and caching.",
            "languages_tools": "JavaScript, Node.js, Python, PostgreSQL, Redis, Postman, Git",
            "achievements": "Successfully deployed campus club election server for 2,000 active voters.",
            "interests": ["REST APIs", "Node.js", "Redis Cache", "Authentication"],
            "skills": {"Python": 7, "AI/ML": 4, "Database": 8, "Backend": 9, "UI/UX": 4, "Cloud/DevOps": 7, "Research": 4, "Web": 8}
        },
        {
            "id": "std-010",
            "name": "Neha Nair",
            "roll_no": "CS2026-010",
            "branch": "CSE-AI",
            "semester": "6",
            "cgpa": 8.6,
            "experience": "Intermediate",
            "preferred_role": "Research Lead",
            "academic_info": "Focus on Healthcare Technologies, Data Privacy, and AI Ethics.",
            "certifications": "HIPAA Compliance for Software Developers",
            "projects_text": "Authored comprehensive report on healthcare data governance and explainable AI in clinical settings.",
            "internships_text": "Research Assistant at HealthTech Institute analyzing medical datasets.",
            "technical_experience": "Expertise in research methodologies, medical benchmark evaluation, ethical AI standards, and technical writing.",
            "languages_tools": "Python, LaTeX, Markdown, Pandas, Git",
            "achievements": "Presented student paper on Healthcare Data Security at National Conference.",
            "interests": ["Healthcare Tech", "Data Privacy", "Ethical AI", "Benchmarking"],
            "skills": {"Python": 7, "AI/ML": 7, "Database": 6, "Backend": 5, "UI/UX": 5, "Cloud/DevOps": 4, "Research": 9, "Web": 6}
        },
        {
            "id": "std-011",
            "name": "Arjun Singhania",
            "roll_no": "CS2026-011",
            "branch": "CSE-AI",
            "semester": "6",
            "cgpa": 8.4,
            "experience": "Advanced",
            "preferred_role": "AI Developer",
            "academic_info": "Focus on Transformers, Large Language Models, and Generative AI.",
            "certifications": "HuggingFace Transformers Course Certificate",
            "projects_text": "Fine-tuned Llama-3 model for domain-specific academic syllabus Q&A; implemented retrieval-augmented generation (RAG) with ChromaDB.",
            "internships_text": "AI Engineering Intern at GenAI Startup deploying LLM pipelines.",
            "technical_experience": "Skilled in Python, PyTorch, HuggingFace, RAG pipelines, vector databases, and model quantization.",
            "languages_tools": "Python, PyTorch, HuggingFace, CUDA, LangChain, Git",
            "achievements": "Top 5% finish in Kaggle Natural Language Processing competition.",
            "interests": ["Transformers", "LLMs", "Generative AI", "CUDA"],
            "skills": {"Python": 9, "AI/ML": 9, "Database": 6, "Backend": 6, "UI/UX": 2, "Cloud/DevOps": 5, "Research": 8, "Web": 4}
        },
        {
            "id": "std-012",
            "name": "Divya Joshi",
            "roll_no": "CS2026-012",
            "branch": "CSE-AI",
            "semester": "6",
            "cgpa": 8.2,
            "experience": "Beginner",
            "preferred_role": "UI/UX Designer",
            "academic_info": "Foundational coursework in HCI and Graphic Interface Design.",
            "certifications": "Coursera UI/UX Fundamentals",
            "projects_text": "Designed mobile application mockups for student book exchange using Figma and wireframing best practices.",
            "internships_text": "Volunteer design lead for college cultural festival marketing.",
            "technical_experience": "Figma wireframing, mood boards, user flow diagrams, basic HTML/CSS styling.",
            "languages_tools": "Figma, Canva, HTML, CSS, Git",
            "achievements": "Created branding guidelines adopted by college robotics society.",
            "interests": ["Wireframing", "Interaction Design", "Prototyping", "Design Thinking"],
            "skills": {"Python": 3, "AI/ML": 2, "Database": 4, "Backend": 3, "UI/UX": 7, "Cloud/DevOps": 2, "Research": 6, "Web": 7}
        },
        {
            "id": "std-013",
            "name": "Aditya Kulkarni",
            "roll_no": "CS2026-013",
            "branch": "CSE-AI",
            "semester": "6",
            "cgpa": 8.0,
            "experience": "Intermediate",
            "preferred_role": "Database Engineer",
            "academic_info": "Database design and distributed storage paradigms.",
            "certifications": "Elasticsearch Certified Engineer Trainee",
            "projects_text": "Configured multi-node Elasticsearch cluster for full-text search across 500,000 research abstracts.",
            "internships_text": "Data Engineering Intern working on MongoDB aggregations and data migration scripts.",
            "technical_experience": "Experienced with MongoDB, PostgreSQL, Elasticsearch, query tuning, and schema migration.",
            "languages_tools": "SQL, Python, MongoDB, Elasticsearch, Docker, Git",
            "achievements": "Decreased research repository search latency from 4.2s to 180ms.",
            "interests": ["MongoDB", "Elasticsearch", "ETL Pipelines", "Data Warehousing"],
            "skills": {"Python": 6, "AI/ML": 5, "Database": 9, "Backend": 7, "UI/UX": 2, "Cloud/DevOps": 6, "Research": 5, "Web": 5}
        },
        {
            "id": "std-014",
            "name": "Pooja Hegde",
            "roll_no": "CS2026-014",
            "branch": "CSE-AI",
            "semester": "6",
            "cgpa": 9.1,
            "experience": "Advanced",
            "preferred_role": "Full Stack Engineer",
            "academic_info": "Full stack web architectures and cloud microservices.",
            "certifications": "AWS Certified Developer Associate",
            "projects_text": "Full stack laboratory equipment booking platform using Django REST framework, React frontend, and PostgreSQL.",
            "internships_text": "Full Stack Intern building end-to-end features in production.",
            "technical_experience": "Proficient across the complete stack: React, Django, Python, REST APIs, relational databases, and Docker.",
            "languages_tools": "Python, JavaScript, Django, React, PostgreSQL, Docker, Git",
            "achievements": "Delivered university club portal serving 1,500 daily active student users.",
            "interests": ["Vue.js", "Django", "GraphQL", "Cloud Deployment"],
            "skills": {"Python": 8, "AI/ML": 6, "Database": 7, "Backend": 8, "UI/UX": 7, "Cloud/DevOps": 7, "Research": 6, "Web": 9}
        },
        {
            "id": "std-015",
            "name": "Karthik Nambiar",
            "roll_no": "CS2026-015",
            "branch": "CSE-AI",
            "semester": "6",
            "cgpa": 7.8,
            "experience": "Beginner",
            "preferred_role": "Cloud/DevOps Engineer",
            "academic_info": "Cloud computing and network administration fundamentals.",
            "certifications": "Linux Foundation Certified System Administrator (LFCS) coursework",
            "projects_text": "Configured Docker Compose environment for automated testing of student assignments.",
            "internships_text": "Lab assistant managing student Linux workstation network.",
            "technical_experience": "Linux command line, Docker containers, basic GitHub Actions workflows, and shell scripting.",
            "languages_tools": "Bash, Python, Docker, Linux, Git",
            "achievements": "Standardized dockerized assignment runner for 120 first-year students.",
            "interests": ["Docker", "Terraform", "GitHub Actions", "Monitoring"],
            "skills": {"Python": 5, "AI/ML": 3, "Database": 5, "Backend": 6, "UI/UX": 2, "Cloud/DevOps": 8, "Research": 4, "Web": 6}
        },
        {
            "id": "std-016",
            "name": "Meera Deshmukh",
            "roll_no": "CS2026-016",
            "branch": "CSE-AI",
            "semester": "6",
            "cgpa": 8.7,
            "experience": "Intermediate",
            "preferred_role": "Research Lead",
            "academic_info": "Epidemiology data science and biostatistics.",
            "certifications": "DataCamp Data Scientist with Python Track",
            "projects_text": "Statistical modeling of disease outbreak trends using public health time-series datasets.",
            "internships_text": "Public health analytics student collaborator.",
            "technical_experience": "Statistical modeling, exploratory data analysis, scientific documentation, and academic presentation.",
            "languages_tools": "Python, Pandas, Matplotlib, LaTeX, Git",
            "achievements": "Nominated for Best Academic Presentation at University Science Colloquium.",
            "interests": ["Clinical Trials", "Epidemiology ML", "Scientific Writing"],
            "skills": {"Python": 7, "AI/ML": 7, "Database": 6, "Backend": 4, "UI/UX": 4, "Cloud/DevOps": 3, "Research": 9, "Web": 5}
        },
        {
            "id": "std-017",
            "name": "Siddharth Bose",
            "roll_no": "CS2026-017",
            "branch": "CSE-AI",
            "semester": "6",
            "cgpa": 8.5,
            "experience": "Intermediate",
            "preferred_role": "Backend Architect",
            "academic_info": "Concurrency models and network protocols.",
            "certifications": "Go Bootcamp Professional Certificate",
            "projects_text": "Engineered high-throughput event pub/sub broker in Go utilizing channels and goroutines.",
            "internships_text": "Systems engineering trainee.",
            "technical_experience": "Go, Python, concurrency paradigms, socket programming, and low-latency API design.",
            "languages_tools": "Go, Python, SQL, Kafka, Docker, Git",
            "achievements": "Authored benchmarking study comparing Go and Python async performance.",
            "interests": ["Go Lang", "Concurrency", "High Throughput Systems", "Kafka"],
            "skills": {"Python": 7, "AI/ML": 5, "Database": 8, "Backend": 9, "UI/UX": 2, "Cloud/DevOps": 7, "Research": 4, "Web": 7}
        },
        {
            "id": "std-018",
            "name": "Tanvi Saxena",
            "roll_no": "CS2026-018",
            "branch": "CSE-AI",
            "semester": "6",
            "cgpa": 8.9,
            "experience": "Advanced",
            "preferred_role": "AI Developer",
            "academic_info": "Natural Language Processing and Speech Processing.",
            "certifications": "NVIDIA NLP Specialist Certificate",
            "projects_text": "Constructed automated medical discharge summary generator using fine-tuned Bio-BERT and PyTorch.",
            "internships_text": "AI NLP Intern at HealthTech startup.",
            "technical_experience": "BERT models, PyTorch, tokenization algorithms, evaluation metrics (ROUGE/BLEU), Python.",
            "languages_tools": "Python, PyTorch, HuggingFace, SpaCy, Git",
            "achievements": "Achieved 91.4 ROUGE-1 score on clinical document summarization benchmark.",
            "interests": ["Bio-NLP", "Speech Recognition", "PyTorch", "Model Compression"],
            "skills": {"Python": 9, "AI/ML": 9, "Database": 6, "Backend": 6, "UI/UX": 3, "Cloud/DevOps": 5, "Research": 8, "Web": 5}
        },
        {
            "id": "std-019",
            "name": "Kunal Goswami",
            "roll_no": "CS2026-019",
            "branch": "CSE-AI",
            "semester": "6",
            "cgpa": 7.7,
            "experience": "Beginner",
            "preferred_role": "Database Engineer",
            "academic_info": "Relational query languages and database administration.",
            "certifications": "MySQL Database Administrator Fundamentals",
            "projects_text": "Designed relational schema for student course registration portal with foreign key constraints and triggers.",
            "internships_text": "Junior database admin assistant.",
            "technical_experience": "SQL queries, schema normalization, database triggers, and Python connector scripting.",
            "languages_tools": "SQL, Python, MySQL, Git",
            "achievements": "Designed normalized 3NF database schema for department store management.",
            "interests": ["SQL Indexing", "Firebase", "Database Security", "MySQL"],
            "skills": {"Python": 6, "AI/ML": 4, "Database": 8, "Backend": 6, "UI/UX": 3, "Cloud/DevOps": 5, "Research": 4, "Web": 6}
        },
        {
            "id": "std-020",
            "name": "Ishaan Choudhury",
            "roll_no": "CS2026-020",
            "branch": "CSE-AI",
            "semester": "6",
            "cgpa": 8.3,
            "experience": "Intermediate",
            "preferred_role": "Frontend Developer",
            "academic_info": "Interactive Web graphics and 3D visualization.",
            "certifications": "Three.js Journey Certificate",
            "projects_text": "Created interactive 3D campus navigation portal utilizing Three.js and WebGL.",
            "internships_text": "Web developer at digital agency.",
            "technical_experience": "JavaScript, Three.js, CSS animations, WebGL, responsive design, and performance optimization.",
            "languages_tools": "JavaScript, HTML5, CSS3, Three.js, React, Git",
            "achievements": "Interactive web demo selected for college tech fest showcase.",
            "interests": ["Interactive Web", "Three.js", "Accessibility", "Design Systems"],
            "skills": {"Python": 4, "AI/ML": 3, "Database": 5, "Backend": 5, "UI/UX": 8, "Cloud/DevOps": 3, "Research": 4, "Web": 8}
        }
    ]

def _sample_catalog_maps(samples=None):
    """Build stable fingerprints for the 20 curated sample students."""
    samples = samples or get_demo_students_data()
    by_id = {str(x.get("id", "")).strip().lower(): x for x in samples}
    by_roll = {str(x.get("roll_no", "")).strip().upper(): x for x in samples}
    by_name_roll = {
        (str(x.get("name", "")).strip().lower(), str(x.get("roll_no", "")).strip().upper()): x
        for x in samples
    }
    by_email = {
        f"{str(x.get('roll_no','')).strip().lower()}@itas.edu.in": x
        for x in samples if x.get("roll_no")
    }
    return by_id, by_roll, by_name_roll, by_email


def _sample_match_for_row(row, by_id, by_roll, by_name_roll, by_email):
    """Return the canonical sample record matching a DB row, if any.

    This deliberately requires multiple strong fingerprints for legacy rows so
    a real manually-added student is not treated as sample data merely because
    their name happens to look similar.
    """
    rid = str(row.get("id") or "").strip().lower()
    roll = str(row.get("roll_no") or "").strip().upper()
    email = str(row.get("email") or "").strip().lower()
    name = str(row.get("name") or "").strip().lower()

    if rid in by_id:
        return by_id[rid]
    if email and email in by_email:
        return by_email[email]
    if (name, roll) in by_name_roll:
        return by_name_roll[(name, roll)]
    if roll and roll in by_roll:
        sample = by_roll[roll]
        # Only classify a roll-only match as legacy sample data when the row
        # also carries a sample-style identity. This protects a legitimate
        # manually-created roster record from an accidental roll collision.
        if int(row.get("is_demo") or 0) == 1 or rid.startswith("std-") or rid.startswith("sample_"):
            return sample
    return None


def _cleanup_admin_sample_rows(cursor, admin_user_id, samples=None):
    """Remove every legacy/duplicate copy of the 20 sample records.

    Older builds used IDs such as std-001 while newer builds use an
    account-scoped ID. Because SQLite has no uniqueness constraint on roll_no,
    both versions could coexist. This cleanup is intentionally scoped to one
    admin's owned rows and only touches records that fingerprint to the
    curated sample catalog.
    """
    samples = samples or get_demo_students_data()
    by_id, by_roll, by_name_roll, by_email = _sample_catalog_maps(samples)
    desired_ids = {
        f"sample_{str(admin_user_id).replace('-', '_')}_{s['id']}" for s in samples
    }

    cursor.execute("SELECT * FROM students WHERE user_id=?", (admin_user_id,))
    rows = cursor.fetchall()
    duplicate_ids = []
    affected_team_ids = set()
    for row in rows:
        sample = _sample_match_for_row(dict(row), by_id, by_roll, by_name_roll, by_email)
        if not sample:
            continue
        sid = str(row["id"])
        if sid in desired_ids:
            continue
        duplicate_ids.append(sid)
        cursor.execute("SELECT team_id FROM team_members WHERE student_id=?", (sid,))
        affected_team_ids.update(str(r["team_id"]) for r in cursor.fetchall())

    # Remove dependent membership rows first. Only remove a team if it became
    # empty specifically because of one of these legacy duplicate records;
    # unrelated empty teams in the account are left untouched.
    for sid in duplicate_ids:
        cursor.execute("DELETE FROM team_members WHERE student_id=?", (sid,))
        cursor.execute("DELETE FROM students WHERE id=? AND user_id=?", (sid, admin_user_id))

    for tid in affected_team_ids:
        cursor.execute("SELECT 1 FROM team_members WHERE team_id=? LIMIT 1", (tid,))
        if not cursor.fetchone():
            cursor.execute("DELETE FROM teams WHERE id=? AND user_id=?", (tid, admin_user_id))
    return duplicate_ids


def load_sample_students_for_admin(user_id):
    """Idempotently load exactly one account-scoped copy of each 20 samples.

    The operation is deliberately safe against databases produced by older
    builds: legacy `std-001` rows, account-scoped rows, and duplicate copies
    with the same sample roll/email are collapsed before the canonical 20 are
    written. Real self-registered students are never touched.
    """
    conn = get_db()
    cursor = conn.cursor()
    now = datetime.now().isoformat()
    try:
        cursor.execute("SELECT id, role, cohort_code FROM users WHERE id=?", (user_id,))
        admin = cursor.fetchone()
        if not admin or admin["role"] != "admin":
            raise ValueError("Only administrators can load sample students.")

        samples = get_demo_students_data()
        _cleanup_admin_sample_rows(cursor, user_id, samples)

        for s in samples:
            sid = f"sample_{str(user_id).replace('-', '_')}_{s['id']}"
            cursor.execute("""
                INSERT INTO students (
                    id,user_id,name,roll_no,email,branch,semester,cgpa,experience,
                    preferred_role,academic_info,certifications,projects_text,
                    internships_text,technical_experience,languages_tools,achievements,
                    interests_json,skills_json,assignment_status,assigned_project_id,
                    assigned_team_id,assigned_role,cohort_code,section,is_demo,created_at,updated_at
                ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                ON CONFLICT(id) DO UPDATE SET
                    user_id=excluded.user_id,name=excluded.name,roll_no=excluded.roll_no,
                    email=excluded.email,branch=excluded.branch,semester=excluded.semester,
                    cgpa=excluded.cgpa,experience=excluded.experience,preferred_role=excluded.preferred_role,
                    academic_info=excluded.academic_info,certifications=excluded.certifications,
                    projects_text=excluded.projects_text,internships_text=excluded.internships_text,
                    technical_experience=excluded.technical_experience,languages_tools=excluded.languages_tools,
                    achievements=excluded.achievements,interests_json=excluded.interests_json,
                    skills_json=excluded.skills_json,assignment_status='Available',
                    assigned_project_id=NULL,assigned_team_id=NULL,assigned_role=NULL,
                    cohort_code=excluded.cohort_code,section=excluded.section,is_demo=1,
                    updated_at=excluded.updated_at
            """, (
                sid, user_id, s["name"], s["roll_no"], f"{s['roll_no'].lower()}@itas.edu.in",
                s["branch"], s["semester"], s["cgpa"], s["experience"], s["preferred_role"],
                s["academic_info"], s["certifications"], s["projects_text"], s["internships_text"],
                s["technical_experience"], s["languages_tools"], s["achievements"],
                json.dumps(s["interests"]), json.dumps(s["skills"]), "Available", None, None, None,
                admin["cohort_code"] or "", s.get("section", "D-1"), 1, now, now
            ))

        conn.commit()
        return True
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

def _demo_project_id(user_id, preset_id):
    """Return a globally unique, account-scoped ID for a demo project."""
    safe_user = re.sub(r"[^a-zA-Z0-9_-]", "_", str(user_id))
    return f"sample_project_{safe_user}_{preset_id}"


def seed_demo_data_for_user(user_id):
    """Load exactly one isolated copy of each curated demo project.

    Demo project IDs used to be the global ``preset-*`` IDs. Because the
    projects table has a global primary key, seeding a second account with
    those IDs could replace the first account's projects. The final build uses
    account-scoped IDs and removes only legacy demo rows owned by the same
    account. This makes the operation idempotent and prevents cross-account
    project theft.
    """
    conn = get_db()
    cursor = conn.cursor()
    now = datetime.now().isoformat()

    try:
        projects = get_demo_projects_data()
        canonical_ids = [_demo_project_id(user_id, p["id"]) for p in projects]
        legacy_ids = [str(p["id"]) for p in projects]

        # Remove legacy demo rows belonging to THIS account only. Their teams,
        # reports and project-skill rows are cleaned explicitly for databases
        # created by older builds where cascade behavior may differ.
        for legacy_id in legacy_ids:
            cursor.execute(
                "SELECT id FROM projects WHERE id=? AND user_id=? AND is_demo=1",
                (legacy_id, user_id)
            )
            if cursor.fetchone():
                cursor.execute("DELETE FROM project_skills WHERE project_id=?", (legacy_id,))
                cursor.execute("DELETE FROM reports WHERE project_id=? AND user_id=?", (legacy_id, user_id))
                cursor.execute("SELECT id FROM teams WHERE user_id=? AND project_id=?", (user_id, legacy_id))
                for team_row in cursor.fetchall():
                    cursor.execute("DELETE FROM team_members WHERE team_id=?", (team_row["id"],))
                cursor.execute("DELETE FROM teams WHERE user_id=? AND project_id=?", (user_id, legacy_id))
                cursor.execute("DELETE FROM projects WHERE id=? AND user_id=?", (legacy_id, user_id))

        for p in projects:
            project_id = _demo_project_id(user_id, p["id"])
            cursor.execute("""
            INSERT INTO projects (
                id, user_id, name, type, team_size, num_teams, description,
                objectives, technologies, requirements, required_skills_json,
                required_roles_json, is_demo, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                user_id=excluded.user_id,
                name=excluded.name,
                type=excluded.type,
                team_size=excluded.team_size,
                num_teams=excluded.num_teams,
                description=excluded.description,
                objectives=excluded.objectives,
                technologies=excluded.technologies,
                requirements=excluded.requirements,
                required_skills_json=excluded.required_skills_json,
                required_roles_json=excluded.required_roles_json,
                is_demo=1,
                updated_at=excluded.updated_at
            """, (
                project_id,
                user_id,
                p["name"],
                p["type"],
                p["team_size"],
                p["num_teams"],
                p["description"],
                p["objectives"],
                p["technologies"],
                p["requirements"],
                json.dumps(p["required_skills"]),
                json.dumps(p["required_roles"]),
                now,
                now
            ))

        # Student samples are already account-scoped and idempotent. Commit the
        # project seed before the helper opens its own SQLite connection.
        conn.commit()
        load_sample_students_for_admin(user_id)

        # Set active project to this account's canonical first sample project.
        cursor.execute("""
        INSERT INTO user_settings(user_id, active_project_id, weights_json, theme, updated_at)
        VALUES (?, ?, '{"skill": 50, "pref": 30, "exp": 20}', 'light', ?)
        ON CONFLICT(user_id) DO UPDATE SET
            active_project_id=excluded.active_project_id,
            updated_at=excluded.updated_at
        """, (user_id, canonical_ids[0], now))

        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

# ----------------- WORKSPACE & PROJECT CRUD -----------------

def save_workspace_snapshot(user_id, workspace_data):
    """Persist the current UI workspace without deleting unrelated records.

    This is intentionally an UPSERT-only operation. A browser autosave must
    never interpret a temporary/stale frontend array as a delete command.
    Explicit deletion is handled only by delete_project().
    """
    conn = get_db()
    cursor = conn.cursor()
    now = datetime.now().isoformat()
    try:
        # Projects: upsert only records present in the snapshot. Never delete
        # rows that are absent; that is the job of the explicit DELETE endpoint.
        for project in (workspace_data.get("projects") or []):
            project = dict(project or {})
            if not project.get("id"):
                continue
            pid = str(project["id"])
            cursor.execute("SELECT user_id FROM projects WHERE id=?", (pid,))
            existing = cursor.fetchone()
            if existing and str(existing["user_id"]) != str(user_id):
                # A client must not overwrite another account's project.
                continue
            req_skills = project.get("requiredSkills") or []
            req_roles = project.get("requiredRoles") or []
            cursor.execute("""
                INSERT INTO projects (
                    id,user_id,name,type,team_size,num_teams,description,objectives,
                    technologies,requirements,required_skills_json,required_roles_json,
                    is_demo,created_at,updated_at
                ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                ON CONFLICT(id) DO UPDATE SET
                    name=excluded.name,type=excluded.type,team_size=excluded.team_size,
                    num_teams=excluded.num_teams,description=excluded.description,
                    objectives=excluded.objectives,technologies=excluded.technologies,
                    requirements=excluded.requirements,
                    required_skills_json=excluded.required_skills_json,
                    required_roles_json=excluded.required_roles_json,
                    updated_at=excluded.updated_at
            """, (
                pid, user_id, project.get("name", "Untitled Project"),
                project.get("type", "General"), project.get("teamSize", 5),
                project.get("numTeams", 4), project.get("description", ""),
                project.get("objectives", ""), project.get("technologies", ""),
                project.get("requirements", ""), json.dumps(req_skills),
                json.dumps(req_roles), project.get("is_demo", 0),
                project.get("created_at") or now, now
            ))

        # Student edits are also UPSERT-only. Most importantly, do not reset
        # assignment fields for students that are not in this snapshot.
        #
        # IMPORTANT: older frontend builds stored the 20 curated samples as
        # `std-001` ... `std-020` (and sometimes as account-scoped IDs). A later
        # autosave could therefore recreate those legacy rows after the sample
        # loader had already cleaned them. Normalize every recognized sample to
        # the one canonical account-scoped ID before writing it.
        cursor.execute("SELECT role FROM users WHERE id=?", (user_id,))
        _owner_role_row = cursor.fetchone()
        _sample_maps = _sample_catalog_maps() if _owner_role_row and _owner_role_row["role"] == "admin" else None
        for student in (workspace_data.get("students") or []):
            student = dict(student or {})
            sid = student.get("id")
            if not sid:
                continue

            if _sample_maps:
                _by_id, _by_roll, _by_name_roll, _by_email = _sample_maps
                _sample = _sample_match_for_row(student, _by_id, _by_roll, _by_name_roll, _by_email)
                if _sample:
                    sid = f"sample_{str(user_id).replace('-', '_')}_{_sample['id']}"
                    # Keep the curated sample explicitly marked as demo data so
                    # future cleanup can identify it even if the browser sends
                    # a stale object from an older localStorage snapshot.
                    student["is_demo"] = 1
            cursor.execute("SELECT id,user_id FROM students WHERE id=?", (str(sid),))
            existing = cursor.fetchone()
            if not existing:
                # New manual/sample students are owned by this coordinator.
                owner_id = user_id
                created_at = now
            else:
                owner_id = existing["user_id"]
                created_at = now
            skills = student.get("skills") or {}
            interests = student.get("interests") or []
            cursor.execute("""
                INSERT INTO students (
                    id,user_id,name,roll_no,email,branch,semester,cgpa,experience,
                    preferred_role,academic_info,certifications,projects_text,
                    internships_text,technical_experience,languages_tools,achievements,
                    interests_json,skills_json,assignment_status,assigned_project_id,
                    assigned_team_id,assigned_role,is_demo,created_at,updated_at
                ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                ON CONFLICT(id) DO UPDATE SET
                    name=excluded.name,roll_no=excluded.roll_no,email=excluded.email,
                    branch=excluded.branch,semester=excluded.semester,cgpa=excluded.cgpa,
                    experience=excluded.experience,preferred_role=excluded.preferred_role,
                    academic_info=excluded.academic_info,certifications=excluded.certifications,
                    projects_text=excluded.projects_text,internships_text=excluded.internships_text,
                    technical_experience=excluded.technical_experience,
                    languages_tools=excluded.languages_tools,achievements=excluded.achievements,
                    interests_json=excluded.interests_json,skills_json=excluded.skills_json,
                    assignment_status=excluded.assignment_status,
                    assigned_project_id=excluded.assigned_project_id,
                    assigned_team_id=excluded.assigned_team_id,
                    assigned_role=excluded.assigned_role,updated_at=excluded.updated_at
            """, (
                str(sid), owner_id, student.get("name", "Unnamed Student"),
                student.get("rollNo", student.get("roll_no", "")), student.get("email", ""),
                student.get("branch", ""), student.get("semester", ""), student.get("cgpa", 8.0),
                student.get("experience", "Intermediate"), student.get("preferredRole", student.get("preferred_role", "")),
                student.get("academicInfo", ""), student.get("certifications", ""),
                student.get("projectsText", student.get("projects_text", "")),
                student.get("internshipsText", student.get("internships_text", "")),
                student.get("technicalExperience", student.get("technical_experience", "")),
                student.get("languagesTools", student.get("languages_tools", "")),
                student.get("achievements", ""), json.dumps(interests), json.dumps(skills),
                student.get("assignmentStatus", student.get("assignment_status", "Available")),
                student.get("assignedProjectId", student.get("assigned_project_id")),
                student.get("assignedTeamId", student.get("assigned_team_id")),
                student.get("assignedRole", student.get("assigned_role")),
                student.get("is_demo", 0), created_at, now
            ))

        active_id = workspace_data.get("activeProjectId")
        cursor.execute("""
            INSERT INTO user_settings(user_id,active_project_id,weights_json,theme,updated_at)
            VALUES (?,?,?,?,?)
            ON CONFLICT(user_id) DO UPDATE SET
                active_project_id=excluded.active_project_id,
                weights_json=excluded.weights_json,theme=excluded.theme,updated_at=excluded.updated_at
        """, (
            user_id, active_id,
            json.dumps(workspace_data.get("weights") or {"skill":50,"pref":30,"exp":20}),
            workspace_data.get("theme", "light"), now
        ))
        conn.commit()
        return get_workspace_data(user_id)
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

def save_teams_and_assignments(user_id, project_id, teams, algorithm="Multi-Objective Optimization"):
    """Replace teams for ONE project and assign ONLY their listed students.

    Students belonging to other projects are never touched.
    """
    if not project_id:
        raise ValueError("Project ID is required.")
    conn = get_db()
    cursor = conn.cursor()
    now = datetime.now().isoformat()
    try:
        cursor.execute("SELECT id FROM projects WHERE id=? AND user_id=?", (str(project_id), user_id))
        if not cursor.fetchone():
            raise ValueError("Project not found or it does not belong to this account.")
        cursor.execute("BEGIN IMMEDIATE")

        # Re-forming this project releases only its previous assignments.
        cursor.execute("""
            UPDATE students SET assignment_status='Available', assigned_project_id=NULL,
                assigned_team_id=NULL, assigned_role=NULL
            WHERE assigned_project_id=?
        """, (str(project_id),))
        cursor.execute("SELECT id FROM teams WHERE user_id=? AND project_id=?", (user_id, str(project_id)))
        old_team_ids=[r["id"] for r in cursor.fetchall()]
        for tid in old_team_ids:
            cursor.execute("DELETE FROM team_members WHERE team_id=?", (tid,))
        cursor.execute("DELETE FROM teams WHERE user_id=? AND project_id=?", (user_id, str(project_id)))

        # Frontend optimizers intentionally use readable IDs such as
        # ``team-1``/``team-2``. Those IDs are only unique inside one
        # optimization run, not across the whole SQLite database. Reusing them
        # for a second project can therefore hit the teams.id PRIMARY KEY,
        # causing the entire save transaction to roll back. When that happens
        # the UI can look like teams were formed while the persistent student
        # assignment fields were never updated.
        #
        # Always create a database-unique team ID here. The returned workspace
        # below is then the single source of truth for both teams and students.
        for idx, team in enumerate(teams or [], 1):
            team_id = f"team_{secrets.token_hex(8)}"
            metrics = team.get("metrics") or {}
            cursor.execute("""
                INSERT INTO teams(id,user_id,project_id,team_name,algorithm_used,metrics_json,created_at)
                VALUES (?,?,?,?,?,?,?)
            """, (team_id,user_id,str(project_id),team.get("name") or f"Team {idx}",
                  algorithm,json.dumps(metrics),now))
            for member in team.get("members") or []:
                sid = member.get("id")
                if not sid:
                    continue
                cursor.execute("SELECT id FROM students WHERE id=?", (str(sid),))
                if not cursor.fetchone():
                    continue
                role = member.get("assignedRole") or member.get("preferredRole") or "Core Contributor"
                fit = member.get("fit") or {}
                cursor.execute("""
                    INSERT INTO team_members(team_id,student_id,assigned_role,fit_metrics_json)
                    VALUES (?,?,?,?)
                """, (team_id,str(sid),role,json.dumps(fit)))
                cursor.execute("""
                    UPDATE students SET assignment_status='Assigned',assigned_project_id=?,
                        assigned_team_id=?,assigned_role=?,updated_at=? WHERE id=?
                """, (str(project_id),team_id,role,now,str(sid)))
        conn.commit()
        return True
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

def get_workspace_data(user_id):
    """Fetches complete user-isolated workspace data."""
    conn = get_db()
    cursor = conn.cursor()

    # User profile
    cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
    user_row = cursor.fetchone()
    user_data = dict(user_row) if user_row else {}
    user_data.pop("password_hash", None)
    user_data.pop("salt", None)

    # User settings
    cursor.execute("SELECT * FROM user_settings WHERE user_id = ?", (user_id,))
    settings_row = cursor.fetchone()
    active_project_id = settings_row["active_project_id"] if settings_row else None
    weights = json.loads(settings_row["weights_json"]) if (settings_row and settings_row["weights_json"]) else {"skill": 50, "pref": 30, "exp": 20}
    theme = settings_row["theme"] if settings_row else "light"

    # Projects
    cursor.execute("SELECT * FROM projects WHERE user_id = ? ORDER BY created_at ASC", (user_id,))
    projects = []
    for row in cursor.fetchall():
        p = dict(row)
        p["requiredSkills"] = json.loads(p.pop("required_skills_json") or "[]")
        p["requiredRoles"] = json.loads(p.pop("required_roles_json") or "[]")
        p["teamSize"] = p.pop("team_size")
        p["numTeams"] = p.pop("num_teams")
        projects.append(p)

    # Students
    # Faculty/admin workspaces see the shared student registry: every registered
    # non-demo student account plus any demo/sample students belonging to this
    # admin. Student accounts continue to see only their own profile.
    if user_data.get("role") == "admin":
        admin_cohort = user_data.get("cohort_code") or ""
        cursor.execute("""
            SELECT s.*, u.id AS linked_user_id, u.email AS account_email,
                   u.college AS account_college, u.dept AS account_dept,
                   u.semester AS account_semester, u.section AS account_section
            FROM students s
            LEFT JOIN users u ON u.id = s.user_id
            WHERE s.user_id = ?
               OR (s.is_demo = 0 AND u.role = 'student' AND (s.coordinator_id = ? OR UPPER(COALESCE(s.cohort_code,'')) = UPPER(?) OR UPPER(COALESCE(u.cohort_code,'')) = UPPER(?)))
            ORDER BY s.roll_no ASC
        """, (user_id, user_id, admin_cohort, admin_cohort))
    else:
        cursor.execute("""
            SELECT s.*, u.id AS linked_user_id, u.email AS account_email
            FROM students s
            LEFT JOIN users u ON u.id = s.user_id
            WHERE s.user_id = ?
            ORDER BY s.roll_no ASC
        """, (user_id,))
    students = []
    for row in cursor.fetchall():
        s = dict(row)
        s["userId"] = s.pop("linked_user_id", None)
        if s.get("account_email"):
            s["accountEmail"] = s["account_email"]
        s.pop("account_email", None)
        s["rollNo"] = s.pop("roll_no")
        s["cohortCode"] = s.pop("cohort_code", None) or s.get("cohortCode") or ""
        s["section"] = s.pop("section", None) or s.get("account_section") or ""
        if not s.get("semester") and s.get("account_semester"):
            s["semester"] = s.get("account_semester")
        if not s.get("college") and s.get("account_college"):
            s["college"] = s.get("account_college")
        if not s.get("dept") and s.get("account_dept"):
            s["dept"] = s.get("account_dept")
        s.pop("account_college", None); s.pop("account_dept", None); s.pop("account_semester", None); s.pop("account_section", None)
        s["academicInfo"] = s.pop("academic_info")
        s["projectsText"] = s.pop("projects_text")
        s["internshipsText"] = s.pop("internships_text")
        s["technicalExperience"] = s.pop("technical_experience")
        s["languagesTools"] = s.pop("languages_tools")
        s["preferredRole"] = s.pop("preferred_role")
        s["recommendedRole"] = s.pop("recommended_role", None) or s.get("preferredRole") or "Full Stack Engineer"
        try: s["roleAnalysis"] = json.loads(s.pop("role_analysis_json") or "{}")
        except Exception: s["roleAnalysis"] = {}
        s["assignmentStatus"] = s.pop("assignment_status")
        s["assignedProjectId"] = s.pop("assigned_project_id")
        s["assignedTeamId"] = s.pop("assigned_team_id")
        s["assignedRole"] = s.pop("assigned_role")
        s["interests"] = json.loads(s.pop("interests_json") or "[]")
        s["skills"] = json.loads(s.pop("skills_json") or "{}")
        students.append(s)

    # Teams for every project owned by this user. This preserves a separate
    # team formation record for each project and makes multi-project allocation
    # visible after logout/login.
    def load_team_rows(project_id=None):
        if project_id:
            cursor.execute("SELECT * FROM teams WHERE user_id = ? AND project_id = ? ORDER BY created_at ASC", (user_id, project_id))
        else:
            cursor.execute("SELECT * FROM teams WHERE user_id = ? ORDER BY created_at ASC", (user_id,))
        out = []
        for trow in cursor.fetchall():
            team = dict(trow)
            team["projectId"] = team.get("project_id")
            team["name"] = team.pop("team_name")
            team["algorithm"] = team.pop("algorithm_used")
            team["metrics"] = json.loads(team.pop("metrics_json") or "{}")
            team.pop("project_id", None)
            cursor.execute("""
            SELECT tm.*, s.name as student_name, s.roll_no, s.cgpa, s.experience, s.preferred_role, s.skills_json, s.interests_json
            FROM team_members tm JOIN students s ON tm.student_id = s.id
            WHERE tm.team_id = ?
            """, (team["id"],))
            members = []
            for mrow in cursor.fetchall():
                m = dict(mrow)
                members.append({"id":m["student_id"],"name":m["student_name"],"rollNo":m["roll_no"],
                    "cgpa":m["cgpa"],"experience":m["experience"],"preferredRole":m["preferred_role"],
                    "assignedRole":m["assigned_role"],"skills":json.loads(m["skills_json"] or "{}"),
                    "interests":json.loads(m["interests_json"] or "[]"),"fit":json.loads(m["fit_metrics_json"] or "{}")})
            team["members"] = members
            out.append(team)
        return out

    all_teams = load_team_rows()
    teams = [t for t in all_teams if t.get("projectId") == active_project_id] if active_project_id else []
    teams_by_project = {}
    for team in all_teams:
        teams_by_project.setdefault(team.get("projectId"), []).append(team)

    conn.close()

    # Statistics calculation
    total_students = len(students)
    assigned_students = len([s for s in students if s["assignmentStatus"] == "Assigned"])
    available_students = total_students - assigned_students

    return {
        "user": user_data,
        "demoChoice": user_data.get("demo_choice", "pending"),
        "activeProjectId": active_project_id,
        "weights": weights,
        "theme": theme,
        "projects": projects,
        "students": students,
        "teams": teams,
        "teamsByProject": teams_by_project,
        "stats": {
            "totalStudents": total_students,
            "assignedStudents": assigned_students,
            "availableStudents": available_students,
            "totalProjects": len(projects),
            "totalTeams": len(all_teams)
        }
    }

def save_or_update_project(user_id, project_data):
    conn = get_db()
    cursor = conn.cursor()
    now = datetime.now().isoformat()

    p_id = project_data.get("id") or f"proj_{secrets.token_hex(6)}"
    # IDs must be unique globally, while workspaces are isolated per user. If a
    # client supplies an id that belongs to another coordinator, fork it rather
    # than overwriting that coordinator's project.
    cursor.execute("SELECT user_id FROM projects WHERE id = ?", (p_id,))
    existing_project = cursor.fetchone()
    if existing_project and existing_project["user_id"] != user_id:
        p_id = f"{user_id}_{p_id}"
    req_skills = project_data.get("requiredSkills") or []
    req_roles = project_data.get("requiredRoles") or []

    cursor.execute("""
    INSERT INTO projects (
        id, user_id, name, type, team_size, num_teams, description,
        objectives, technologies, requirements, required_skills_json,
        required_roles_json, is_demo, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        type = excluded.type,
        team_size = excluded.team_size,
        num_teams = excluded.num_teams,
        description = excluded.description,
        objectives = excluded.objectives,
        technologies = excluded.technologies,
        requirements = excluded.requirements,
        required_skills_json = excluded.required_skills_json,
        required_roles_json = excluded.required_roles_json,
        updated_at = excluded.updated_at
    """, (
        p_id,
        user_id,
        project_data.get("name", "Untitled Project"),
        project_data.get("type", "General"),
        project_data.get("teamSize", 5),
        project_data.get("numTeams", 4),
        project_data.get("description", ""),
        project_data.get("objectives", ""),
        project_data.get("technologies", ""),
        project_data.get("requirements", ""),
        json.dumps(req_skills),
        json.dumps(req_roles),
        project_data.get("is_demo", 0),
        now,
        now
    ))

    # Update active project setting
    cursor.execute("""
    INSERT INTO user_settings (user_id, active_project_id, weights_json, theme, updated_at)
    VALUES (?, ?, '{"skill": 50, "pref": 30, "exp": 20}', 'light', ?)
    ON CONFLICT(user_id) DO UPDATE SET active_project_id = excluded.active_project_id, updated_at = excluded.updated_at
    """, (user_id, p_id, now))

    conn.commit()
    conn.close()
    return p_id

def delete_project(user_id, project_id):
    """Delete a project safely, release its students, and tolerate brief SQLite locks."""
    if not project_id:
        raise ValueError("Project ID is required.")

    project_id = str(project_id)
    last_error = None

    # A browser autosave can briefly hold a SQLite write transaction. Retry the
    # complete transaction with a fresh connection so a transient lock never
    # leaves the project half-deleted.
    for attempt in range(6):
        conn = get_db()
        cursor = conn.cursor()
        try:
            cursor.execute("BEGIN IMMEDIATE")
            cursor.execute("SELECT id FROM projects WHERE id = ? AND user_id = ?", (project_id, user_id))
            project = cursor.fetchone()
            if not project:
                raise ValueError("Project not found or it does not belong to this account.")

            # Release every student assigned to this project. Admin workspaces
            # can contain registered student accounts as well as admin-owned rows.
            cursor.execute("""
                UPDATE students
                SET assignment_status='Available', assigned_project_id=NULL,
                    assigned_team_id=NULL, assigned_role=NULL
                WHERE assigned_project_id = ?
                  AND (user_id = ? OR user_id IN (SELECT id FROM users WHERE role='student'))
            """, (project_id, user_id))

            # Explicit cleanup keeps this compatible with older databases whose
            # foreign-key cascade settings may not have been enabled.
            cursor.execute("SELECT id FROM teams WHERE user_id=? AND project_id=?", (user_id, project_id))
            team_ids = [row["id"] for row in cursor.fetchall()]
            for team_id in team_ids:
                cursor.execute("DELETE FROM team_members WHERE team_id=?", (team_id,))
            cursor.execute("DELETE FROM teams WHERE user_id=? AND project_id=?", (user_id, project_id))
            cursor.execute("DELETE FROM project_skills WHERE project_id=?", (project_id,))
            cursor.execute("DELETE FROM reports WHERE project_id=? AND user_id=?", (project_id, user_id))

            cursor.execute("DELETE FROM projects WHERE id=? AND user_id=?", (project_id, user_id))
            if cursor.rowcount != 1:
                raise ValueError("Project could not be removed.")

            # Move the active project to another remaining project, or clear it.
            cursor.execute("SELECT active_project_id FROM user_settings WHERE user_id=?", (user_id,))
            settings = cursor.fetchone()
            if settings and str(settings["active_project_id"] or "") == project_id:
                cursor.execute("""
                    SELECT id FROM projects WHERE user_id=?
                    ORDER BY created_at ASC LIMIT 1
                """, (user_id,))
                next_project = cursor.fetchone()
                cursor.execute(
                    "UPDATE user_settings SET active_project_id=?, updated_at=? WHERE user_id=?",
                    (next_project["id"] if next_project else None, datetime.now().isoformat(), user_id)
                )

            conn.commit()
            conn.close()
            return True
        except ValueError:
            conn.rollback()
            conn.close()
            raise
        except sqlite3.OperationalError as exc:
            conn.rollback()
            conn.close()
            last_error = exc
            if "locked" not in str(exc).lower() and "busy" not in str(exc).lower():
                raise
            import time
            time.sleep(0.25 * (attempt + 1))
        except Exception:
            conn.rollback()
            conn.close()
            raise

    raise RuntimeError("Database is busy. Please try removing the project again in a moment.") from last_error

def release_project_assignments(user_id, project_id):
    """Releases all students assigned to a given project back to the 'Available' pool."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
    UPDATE students SET assignment_status = 'Available', assigned_project_id = NULL, assigned_team_id = NULL, assigned_role = NULL
    WHERE user_id = ? AND assigned_project_id = ?
    """, (user_id, project_id))

    cursor.execute("SELECT id FROM teams WHERE user_id = ? AND project_id = ?", (user_id, project_id))
    old_team_ids = [row["id"] for row in cursor.fetchall()]
    for tid in old_team_ids:
        cursor.execute("DELETE FROM team_members WHERE team_id = ?", (tid,))
    cursor.execute("DELETE FROM teams WHERE user_id = ? AND project_id = ?", (user_id, project_id))

    conn.commit()
    conn.close()

def save_report_details(user_id, project_id, report_data):
    conn = get_db()
    cursor = conn.cursor()
    now = datetime.now().isoformat()
    report_id = report_data.get("id") or f"rep_{secrets.token_hex(6)}"

    cursor.execute("""
    INSERT INTO reports (
        id, user_id, project_id, report_date, prep_name, prep_desig, prep_sig,
        hod_name, hod_desig, hod_sig, dean_name, dean_desig, dean_sig, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
        report_date = excluded.report_date,
        prep_name = excluded.prep_name,
        prep_desig = excluded.prep_desig,
        prep_sig = excluded.prep_sig,
        hod_name = excluded.hod_name,
        hod_desig = excluded.hod_desig,
        hod_sig = excluded.hod_sig,
        dean_name = excluded.dean_name,
        dean_desig = excluded.dean_desig,
        dean_sig = excluded.dean_sig,
        notes = excluded.notes,
        updated_at = excluded.updated_at
    """, (
        report_id,
        user_id,
        project_id,
        report_data.get("report_date", datetime.now().strftime("%d %B %Y")),
        report_data.get("prep_name", ""),
        report_data.get("prep_desig", ""),
        report_data.get("prep_sig", ""),
        report_data.get("hod_name", ""),
        report_data.get("hod_desig", ""),
        report_data.get("hod_sig", ""),
        report_data.get("dean_name", ""),
        report_data.get("dean_desig", ""),
        report_data.get("dean_sig", ""),
        report_data.get("notes", ""),
        now,
        now
    ))

    conn.commit()
    conn.close()
    return report_id

# Initialize database on module import
init_db()
ensure_demo_account()
