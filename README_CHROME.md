# SkillMatch AI — Google Chrome Setup & Permanent Data Persistence Guide

## 🌟 How Data is Stored Accurately in Chrome

SkillMatch AI uses a **Dual-Layer Persistent Browser Storage Engine**:
1. **Primary Layer (`localStorage`):** Real-time, zero-latency synchronous storage for all active session data, student profiles, project requirements, weights, and formed teams.
2. **Durability Layer (`IndexedDB`):** Asynchronous database mirroring in Chrome's high-capacity IndexedDB store (`SkillMatchDB`), protecting against cache eviction and supporting unlimited cohort capacity.
3. **Session Memory (`Keep Me Signed In`):** When you close Chrome completely, your active session ID and workspace state remain saved. When you open the portal again, you are automatically logged in and returned to the exact screen you were viewing.
4. **Debounced Auto-Save:** As you type project descriptions, adjust skill sliders, or edit students, changes are automatically written to storage in real-time.
5. **Physical JSON Backup & Restore:** Click **"💾 Backup / Restore"** in the top navigation bar at any time to export a complete `.json` backup file of all accounts, student cohorts, projects, and formed teams.

---

## 🚀 How to Open SkillMatch AI in Chrome

You have three convenient ways to open the application:

### Option 1: 1-Click Desktop Launcher (Recommended)
Simply double-click:
```
Launch_SkillMatch_AI.bat
```
*This automatically starts the local background server (if not already running) and opens SkillMatch AI in Google Chrome's dedicated standalone app window (borderless, full desktop experience).*

### Option 2: Directly in Chrome Browser
1. Make sure the local server is running (running in background on port `8000`).
2. Open Google Chrome and navigate to:
   **[http://127.0.0.1:8000](http://127.0.0.1:8000)**

### Option 3: Install as a Native Chrome Desktop App (PWA)
1. Open [http://127.0.0.1:8000](http://127.0.0.1:8000) in Google Chrome.
2. Click the **"📲 Install App"** button in the top navigation bar, or click the **Install icon** on the right side of Chrome's address bar.
3. SkillMatch AI will be installed to your Windows Start Menu, Desktop, and Chrome Apps, running just like a native desktop program.

---

## 🔐 Demo Coordinator Credentials
- **Institutional Email:** `rajesh.sharma@itas.edu.in`
- **Password:** `admin123`
- *Tip: You can also click the "⚡ Quick Sign In as Demo Coordinator" button on the login screen for instant 1-click access.*

---

## 📋 Features Included
- **Student Cohort Management:** Add, edit, delete, and filter engineering students with multidimensional skill ratings (1–10).
- **Roster Import / Export:** Bulk upload students using CSV or JSON, or download the full cohort.
- **Intelligent Project Requirement Extraction:** Semantic keyword and domain analysis that infers required roles, core skills, and proficiency targets.
- **Cohort Skill Gap Auditing:** Transparent mathematical comparison of project demands against cohort capacity with severity tags.
- **Multi-Objective Team Optimization:** Algorithmic balance across Skill Coverage (40%), Student Role Preferences (25%), Experience Distribution (20%), and Diversity (15%).
- **Explainable AI & What-If Simulator:** Inspect placement rationale and test hypothetical student transfers with instant delta scoring.
- **Analysis of Algorithms (AOA CS-402) Benchmarking:** Direct comparative performance analysis of Greedy Heuristics, Bipartite Hungarian Matching, and Multi-Objective Genetic Pareto optimization.
- **Official Institutional Reports:** Formatted executive documentation ready for printing or exporting as PDF/JSON.
