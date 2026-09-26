import { storage } from "./utils/storage.js";
import { api } from "./utils/api.js";
import { extractSkillsFromProfile } from "./models/studentSkillExtractor.js";
// SkillMatch AI — Master Academic Platform Coordinator
// Analysis of Algorithms (CS-402) Capstone System
// Connects authentication, multi-account isolation, dynamic requirement extraction,
// transparent skill gap auditing, multi-objective team formation, explainable AI, and reports.

import { DEFAULT_STUDENTS } from "./data/defaultStudents.js";
import { PROJECT_PRESETS } from "./data/projectPresets.js";
import { analyzeProjectRequirements, MASTER_SKILL_LIBRARY } from "./models/projectAnalyzer.js";
import {
  calculateStudentRoleFit,
  evaluateTeam,
  runGreedyAlgorithm,
  runMatchingAlgorithm,
  runOptimizationAlgorithm,
  generateOptimalTeams,
  evaluateTeamResults,
  explainStudentPlacement,
  simulateWhatIfMove,
  runAlgorithmBenchmarkSuite
} from "./models/teamOptimizer.js";
import {
  renderSkillGapChart,
  renderAlgoQualityChart,
  renderAlgoTimeChart,
  renderScalabilityChart,
  renderScoreGauge
} from "./utils/charts.js";

// ==========================================
// 1. ALL SKILLS & DEFAULT DEMO ACCOUNTS
// ==========================================

export const ALL_SKILLS = [
  "Python",
  "AI/ML",
  "Computer Vision",
  "NLP",
  "Data Analysis",
  "Database",
  "Backend",
  "Web Development",
  "UI/UX",
  "Cloud/DevOps",
  "Cybersecurity",
  "Research",
  "IoT",
  "Optimization Algorithms",
  "Data Structures & Algorithms",
  "Git & Version Control",
  "Software Testing & QA",
  "Mobile Development"
];

const DEFAULT_DEMO_ADMIN = {
  id: "admin-demo-1",
  email: "rajesh.sharma@itas.edu.in",
  password: "admin123",
  name: "Prof. Rajesh Sharma",
  designation: "Associate Professor & Head of Project Committee",
  college: "Institute of Technology & Advanced Sciences",
  dept: "Department of Computer Science & Engineering",
  branch: "CSE-AI & Systems",
  hodName: "Dr. Suresh Raman",
  deanName: "Prof. Meenakshi Sundaram",
  facultyId: "FAC-CS-8042",
  office: "Room 408, Dept. of CSE, Block B",
  research: "Algorithm Design, Multi-Objective Optimization, Distributed Systems",
  reportDocumentId: "SM-2026-CS402-09"
};

// ==========================================
// 2. MULTI-ACCOUNT REPO & STATE STORE
// ==========================================

const CLIENT_BUILD_ID = "2026-09-18-FINAL-MULTI-PROJECT-ALLOCATION-1";

class AppState {
  constructor() {
    this.resetWorkspaceData();
    this.initAccountsRegistry();
    this.loadActiveSession();
  }

  initAccountsRegistry() {
    // FINAL CLEAN BUILD: discard account data left by older project builds once.
    // This prevents an old browser localStorage account (for example an earlier
    // test account) from appearing as "already registered" in this fresh build.
    // After this one-time cleanup, accounts created in this build persist normally.
    const buildKey = "skillmatch_client_build_id";
    if (localStorage.getItem(buildKey) !== CLIENT_BUILD_ID) {
      try {
        localStorage.removeItem("skillmatch_accounts");
        localStorage.removeItem("skillmatch_current_admin_id");
        localStorage.removeItem("skillmatch_auth_token");
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith("skillmatch_account_") && key !== `skillmatch_account_${DEFAULT_DEMO_ADMIN.id}`) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));
      } catch (e) {
        console.warn("Fresh account cleanup warning:", e);
      }
      localStorage.setItem(buildKey, CLIENT_BUILD_ID);
    }

    // Seed demo account's workspace data in local storage if missing
    const demoKey = `skillmatch_account_${DEFAULT_DEMO_ADMIN.id}`;
    if (!localStorage.getItem(demoKey)) {
      const demoData = {
        projects: JSON.parse(JSON.stringify(PROJECT_PRESETS)),
        students: JSON.parse(JSON.stringify(DEFAULT_STUDENTS)),
        activeProjectId: PROJECT_PRESETS[0].id,
        weights: { skill: 50, pref: 30, exp: 20 },
        teams: null,
        lastResultMeta: null,
        historyLog: [],
        reportDocumentId: "SM-2026-CS402-09"
      };
      localStorage.setItem(demoKey, JSON.stringify(demoData));
    }
  }

  async initSession() {
    // A browser reload should keep the current coordinator in the portal.
    // First restore the locally persisted session/workspace, then refresh it from
    // the backend when the saved API token is still valid.
    const localSessionId = storage.loadCurrentSession();
    if (!localSessionId || !this.isLoggedIn || !this.currentAdmin) {
      return null;
    }

    try {
      const res = await api.getMe();
      if (res && res.user) {
        this.isLoggedIn = true;
        this.currentAdmin = { ...this.currentAdmin, ...res.user };
        storage.saveCurrentSession(res.user.id);

        // IMPORTANT: On a browser reload, the local workspace is the latest
        // client-side state. Loading the SQLite workspace here used to overwrite
        // freshly entered students, skills, weights, teams and the current view
        // with an older backend snapshot (often making values appear as 0).
        // Keep the locally persisted workspace on reload. The backend remains the
        // source for authentication and normal CRUD operations, while local
        // storage is the reload-safe UI snapshot.
        const localWorkspaceKey = `skillmatch_account_${res.user.id}`;
        const hasLocalWorkspace = Boolean(localStorage.getItem(localWorkspaceKey));
        if (!hasLocalWorkspace) {
          await this.loadWorkspaceFromBackend();
          this.persistAccountData(res.user.id);
        }

        return this.currentAdmin;
      }
    } catch (e) {
      // Keep the locally persisted workspace/session on temporary backend or
      // network failure. This prevents a reload from throwing the user to login.
      console.warn("Backend session refresh unavailable; using persisted workspace:", e);
    }

    return this.currentAdmin;
  }

  async loadWorkspaceFromBackend() {
    try {
      const ws = await api.getWorkspace();
      if (ws) {
        // CRITICAL LOGIN-RESTORE RULE:
        // A previous version could return an empty/partial SQLite workspace after
        // re-login even though this account still had a complete local snapshot.
        // Never replace real saved account data with an empty backend snapshot.
        const localKey = this.currentAdmin ? `skillmatch_account_${this.currentAdmin.id}` : null;
        let localWs = null;
        if (localKey) {
          try {
            const raw = localStorage.getItem(localKey);
            localWs = raw ? JSON.parse(raw) : null;
          } catch (_) { localWs = null; }
        }

        const backendProjects = Array.isArray(ws.projects) ? ws.projects : [];
        const backendStudents = Array.isArray(ws.students) ? ws.students : [];
        const backendTeams = Array.isArray(ws.teams) ? ws.teams : [];
        const localProjects = localWs && Array.isArray(localWs.projects) ? localWs.projects : [];
        const localStudents = localWs && Array.isArray(localWs.students) ? localWs.students : [];
        const localTeams = localWs && Array.isArray(localWs.teams) ? localWs.teams : [];
        const backendTeamsByProject = ws.teamsByProject || {};
        const localTeamsByProject = localWs && localWs.teamsByProject ? localWs.teamsByProject : {};

        // If the backend is empty/partial while the local account snapshot has
        // actual user data, restore that snapshot to the server instead of wiping
        // the UI to zero. This is the key fix for logout -> login persistence.
        const backendEmptyButLocalHasData =
          (backendProjects.length === 0 && localProjects.length > 0) ||
          (backendStudents.length === 0 && localStudents.length > 0) ||
          (backendTeams.length === 0 && localTeams.length > 0);

        if (backendEmptyButLocalHasData && localWs) {
          this.projects = localProjects;
          this.students = localStudents;
          this.teamsByProject = localTeamsByProject;
          this.teams = localTeams.length ? localTeams : null;
          this.weights = localWs.weights || ws.weights || { skill: 40, pref: 25, exp: 20, div: 15 };
          this.historyLog = localWs.historyLog || ws.historyLog || [];
          this.benchmarkData = localWs.benchmarkData || ws.benchmarkData || null;
          this.theme = localWs.theme || ws.theme || localStorage.getItem("skillmatch_theme") || "light";
          this.currentView = localWs.currentView || "main";
          if (this.projects.length > 0) {
            const wanted = localWs.activeProjectId || ws.activeProjectId;
            this.activeProject = this.projects.find(p => p.id === wanted) || this.projects[0];
          } else {
            this.activeProject = null;
          }
          if (this.activeProject) this.teams = this.teamsByProject[this.activeProject.id] || this.teams || null;
          if (this.currentAdmin && (localWs.reportDocumentId || ws.reportDocumentId)) {
            this.currentAdmin.reportDocumentId = localWs.reportDocumentId || ws.reportDocumentId;
          }

          // Rehydrate SQLite from the preserved account snapshot. Do not await this
          // request before showing the dashboard; the local state is already valid.
          api.saveWorkspace({
            projects: this.projects,
            students: this.students,
            activeProjectId: this.activeProject ? this.activeProject.id : null,
            weights: this.weights,
            teams: this.teams,
            allTeams: Object.values(this.teamsByProject || {}).flat(),
            teamsByProject: this.teamsByProject,
            lastResultMeta: localWs.lastResultMeta || null,
            historyLog: this.historyLog,
            benchmarkData: this.benchmarkData,
            currentView: this.currentView,
            theme: this.theme,
            draftProject: localWs.draftProject || null,
            reportDocumentId: this.currentAdmin ? this.currentAdmin.reportDocumentId : localWs.reportDocumentId
          }).catch(err => console.warn("Account workspace rehydration:", err));
          return true;
        }

        this.projects = backendProjects;
        this.students = backendStudents;
        this.teamsByProject = backendTeamsByProject;
        this.teams = backendTeams.length ? backendTeams : (this.activeProject ? (this.teamsByProject[this.activeProject.id] || null) : null);
        this.weights = ws.weights || { skill: 40, pref: 25, exp: 20, div: 15 };
        this.historyLog = ws.historyLog || [];
        this.benchmarkData = ws.benchmarkData || null;
        this.theme = ws.theme || localStorage.getItem("skillmatch_theme") || "light";
        this.currentView = ws.currentView || "main";
        if (this.projects.length > 0) {
          const found = this.projects.find(p => p.id === ws.activeProjectId);
          this.activeProject = found || this.projects[0];
        } else {
          this.activeProject = null;
        }
        if (this.activeProject) this.teams = this.teamsByProject[this.activeProject.id] || this.teams || null;
        if (this.currentAdmin && ws.reportDocumentId) {
          this.currentAdmin.reportDocumentId = ws.reportDocumentId;
        }
        // Keep the browser snapshot synchronized with the durable backend copy.
        this.persistAccountData(this.currentAdmin ? this.currentAdmin.id : null);
        return true;
      }
    } catch (e) {
      console.warn("Could not load backend workspace, using local cache:", e);
      // Backend unavailable: local account data remains the recovery source.
      if (this.currentAdmin) this.loadAccountData(this.currentAdmin.id);
    }
    return false;
  }

  getRegisteredAccounts() {
    try {
      const data = localStorage.getItem("skillmatch_accounts");
      return data ? JSON.parse(data) : [DEFAULT_DEMO_ADMIN];
    } catch {
      return [DEFAULT_DEMO_ADMIN];
    }
  }

  saveRegisteredAccounts(accounts) {
    localStorage.setItem("skillmatch_accounts", JSON.stringify(accounts));
  }

  loadActiveSession() {
    // Restore the last authenticated coordinator on browser reload.
    // The session id, account profile and workspace are persisted locally, while
    // the backend token (when available) is restored by ApiClient from localStorage.
    const adminId = storage.loadCurrentSession();
    if (!adminId) {
      this.isLoggedIn = false;
      this.currentAdmin = null;
      this.resetWorkspaceData();
      return false;
    }

    const accounts = this.getRegisteredAccounts();
    const account = accounts.find(a => a.id === adminId);

    // IMPORTANT: A newly registered coordinator can have a valid backend session
    // before the local account registry has finished being written. Never treat
    // that as a logged-out state on browser reload. Recover the account from the
    // persisted workspace/session and let initSession() refresh the full profile
    // from the backend. This keeps NEW accounts reload-safe as well as existing ones.
    this.isLoggedIn = true;
    this.currentAdmin = account ? { ...account } : { id: adminId };
    this.loadAccountData(adminId);
    return true;
  }

  resetWorkspaceData() {
    this.projects = [];
    this.students = [];
    this.activeProject = null;
    this.weights = { skill: 40, pref: 25, exp: 20, div: 15 };
    this.teams = null;
    this.teamsByProject = {};
    this.lastResultMeta = null;
    this.historyLog = [];
    this.benchmarkData = null;
    this.theme = localStorage.getItem("skillmatch_theme") || "light";
    this.currentView = "main";
    this.draftProject = null;
  }

  loadAccountData(adminId) {
    const rawData = localStorage.getItem(`skillmatch_account_${adminId}`);
    let data = null;
    if (rawData) {
      try {
        data = JSON.parse(rawData);
      } catch {
        data = null;
      }
    }

    if (!data) {
      // Brand-new accounts always start clean. Demo data is loaded only for explicit demo accounts.
      data = {
        projects: [],
        students: [],
        activeProjectId: null,
        weights: { skill: 40, pref: 25, exp: 20, div: 15 },
        teams: null,
        lastResultMeta: null,
        historyLog: [],
        currentView: "main",
        reportDocumentId: `SM-2026-CS402-${Math.floor(100 + Math.random() * 900)}`
      };
      this.persistAccountData(adminId, data);
    }

    this.projects = data.projects || [];
    this.students = data.students || [];
    this.weights = data.weights || { skill: 40, pref: 25, exp: 20, div: 15 };
    this.teams = data.teams || null;
    this.teamsByProject = data.teamsByProject || {};
    this.lastResultMeta = data.lastResultMeta || null;
    this.historyLog = data.historyLog || [];
    this.benchmarkData = data.benchmarkData || null;
    this.theme = localStorage.getItem("skillmatch_theme") || "light";
    this.currentView = data.currentView || "main";
    this.draftProject = data.draftProject || null;

    // Set or resolve active project
    if (this.projects.length > 0) {
      const found = this.projects.find(p => p.id === data.activeProjectId);
      this.activeProject = found || this.projects[0];
    } else {
      this.activeProject = null;
    }
    if (!Object.keys(this.teamsByProject).length && this.teams && this.activeProject) this.teamsByProject[this.activeProject.id] = this.teams;
    if (this.activeProject) this.teams = this.teamsByProject[this.activeProject.id] || this.teams || null;

    // Ensure persistent Document ID
    if (!this.currentAdmin.reportDocumentId) {
      this.currentAdmin.reportDocumentId = data.reportDocumentId || `SM-2026-CS402-${Math.floor(100 + Math.random() * 900)}`;
      this.saveAdminProfile();
    }
  }

  persistAccountData(adminId = null, customData = null) {
    const id = adminId || (this.currentAdmin ? this.currentAdmin.id : null);
    if (!id) return;

    const payload = customData || {
      projects: this.projects,
      students: this.students,
      activeProjectId: this.activeProject ? this.activeProject.id : null,
      weights: this.weights,
      teams: this.teams,
      allTeams: Object.values(this.teamsByProject || {}).flat(),
      teamsByProject: this.teamsByProject,
      lastResultMeta: this.lastResultMeta,
      historyLog: this.historyLog,
      benchmarkData: this.benchmarkData,
      currentView: this.currentView,
      theme: this.theme,
      draftProject: this.draftProject,
      reportDocumentId: this.currentAdmin ? this.currentAdmin.reportDocumentId : `SM-2026-CS402-09`
    };

    storage.saveWorkspace(id, payload);
  }

  saveLocalOnly() {
    const id = this.currentAdmin ? this.currentAdmin.id : null;
    if (!id) return;
    storage.saveWorkspace(id, {
      projects: this.projects,
      students: this.students,
      activeProjectId: this.activeProject ? this.activeProject.id : null,
      weights: this.weights,
      teams: this.teams,
      allTeams: Object.values(this.teamsByProject || {}).flat(),
      teamsByProject: this.teamsByProject,
      lastResultMeta: this.lastResultMeta,
      historyLog: this.historyLog,
      benchmarkData: this.benchmarkData,
      currentView: this.currentView,
      theme: this.theme,
      draftProject: this.draftProject,
      reportDocumentId: this.currentAdmin.reportDocumentId
    });
  }

  save() {
    this.persistAccountData();
    if (this.isLoggedIn && this.currentAdmin && typeof api.saveWorkspace === "function") {
      api.saveWorkspace({
        projects: this.projects,
        students: this.students,
        activeProjectId: this.activeProject ? this.activeProject.id : null,
        weights: this.weights,
        teams: this.teams,
        allTeams: Object.values(this.teamsByProject || {}).flat(),
        teamsByProject: this.teamsByProject,
        lastResultMeta: this.lastResultMeta,
        historyLog: this.historyLog,
        benchmarkData: this.benchmarkData,
        currentView: this.currentView,
        theme: this.theme,
        draftProject: this.draftProject,
        reportDocumentId: this.currentAdmin.reportDocumentId
      }).catch(err => console.warn("Backend autosave:", err));
    }
    if (typeof updateStorageStatusIndicator === "function") {
      updateStorageStatusIndicator();
    }
  }

  saveAdminProfile() {
    if (!this.currentAdmin) return;
    const accounts = this.getRegisteredAccounts();
    const idx = accounts.findIndex(a => a.id === this.currentAdmin.id);
    if (idx !== -1) {
      accounts[idx] = { ...this.currentAdmin };
    } else {
      accounts.push({ ...this.currentAdmin });
    }
    this.saveRegisteredAccounts(accounts);
    this.save();
    updateAdminUI();
  }

  async login(identifier, password) {
    const cleanId = (identifier || "").trim();
    const cleanPass = (password || "").trim();

    try {
      const res = await api.login(cleanId, cleanPass);
      if (res && res.user) {
        this.isLoggedIn = true;
        this.currentAdmin = res.user;
        // Persist the account profile immediately so a brand-new coordinator
        // can be recovered by AppState on the very next browser reload.
        this.saveRegisteredAccounts([
          ...this.getRegisteredAccounts().filter(a => a.id !== res.user.id),
          { ...res.user }
        ]);
        await this.loadWorkspaceFromBackend();
        storage.saveCurrentSession(res.user.id);
        this.save();
        return { success: true, admin: res.user, demoChoice: res.user.demoChoice };
      }
      return {
        success: false,
        notRegistered: res.notRegistered || false,
        wrongPassword: res.wrongPassword || false,
        message: res.error || "Authentication failed"
      };
    } catch (e) {
      if (e.data) {
        return {
          success: false,
          notRegistered: Boolean(e.data.notRegistered),
          wrongPassword: Boolean(e.data.wrongPassword),
          message: e.data.error || e.message || "Invalid credentials."
        };
      }
      console.warn("Backend login failed, attempting local fallback:", e);
      // Local fallback
      const accounts = this.getRegisteredAccounts();
      const matched = accounts.find(a =>
        (a.email.toLowerCase() === cleanId.toLowerCase() || (a.facultyId && a.facultyId.toLowerCase() === cleanId.toLowerCase())) &&
        a.password === cleanPass
      );
      if (matched) {
        storage.saveCurrentSession(matched.id);
        this.isLoggedIn = true;
        this.currentAdmin = matched;
        this.loadAccountData(matched.id);
        return { success: true, admin: matched, demoChoice: "loaded" };
      }
      return { success: false, message: e.message || "Invalid credentials." };
    }
  }

  async signup(profileData) {
    try {
      const res = await api.register(profileData);
      if (res && res.user) {
        this.isLoggedIn = true;
        this.currentAdmin = res.user;
        // Persist the newly created coordinator in the local account registry
        // before the page can be reloaded.
        this.saveRegisteredAccounts([
          ...this.getRegisteredAccounts().filter(a => a.id !== res.user.id),
          { ...res.user }
        ]);
        await this.loadWorkspaceFromBackend();
        storage.saveCurrentSession(res.user.id);
        this.save();
        return { success: true, admin: res.user, demoChoice: res.user.demoChoice };
      }
      return {
        success: false,
        alreadyRegistered: res.alreadyRegistered || false,
        message: res.error || "Registration failed"
      };
    } catch (e) {
      if (e.data) {
        return {
          success: false,
          alreadyRegistered: Boolean(e.data.alreadyRegistered),
          message: e.data.error || e.message || "Registration failed"
        };
      }
      console.warn("Backend signup failed, attempting local fallback:", e);
      return { success: false, message: e.message || "Registration failed" };
    }
  }

  async demoLogin() {
    try {
      const res = await api.demoLogin();
      if (res && res.user) {
        this.isLoggedIn = true;
        this.currentAdmin = res.user;
        await this.loadWorkspaceFromBackend();
        // Demo coordinator always opens with the curated sample projects + student cohort.
        if (this.projects.length === 0 || this.students.length === 0) {
          try {
            await api.setDemoChoice(true);
            await this.loadWorkspaceFromBackend();
          } catch (seedErr) { console.warn("Demo workspace seed:", seedErr); }
        }
        storage.saveCurrentSession(res.user.id);
        this.save();
        return { success: true, admin: res.user };
      }
    } catch (e) {
      console.warn("Backend demo login fallback:", e);
    }
    return this.login("rajesh.sharma@itas.edu.in", "admin123");
  }

  async studentDemoLogin() {
    try {
      const res = await api.studentDemoLogin();
      if (res && res.user) {
        this.isLoggedIn = true;
        this.currentAdmin = res.user;
        await this.loadWorkspaceFromBackend();
        storage.saveCurrentSession(res.user.id);
        this.save();
        return { success: true, admin: res.user };
      }
    } catch (e) {
      console.warn("Backend student demo login fallback:", e);
    }
    return this.login("demo.student@itas.edu.in", "student123");
  }

  async logout() {
    try {
      await api.logout();
    } catch (_) { }
    storage.saveCurrentSession(null);
    this.isLoggedIn = false;
    this.currentAdmin = null;
    this.resetWorkspaceData();
  }
}

// A fresh launch from RUN_PROJECT.bat must always show the login page.
// Browser reloads do NOT use this flag, so reload persistence remains intact.
// The query flag is removed immediately so subsequent Chrome reloads keep the
// authenticated coordinator session and workspace data.
if (typeof window !== "undefined") {
  const params = new URLSearchParams(window.location.search);
  if (params.get("freshLaunch") === "1") {
    localStorage.removeItem("skillmatch_current_admin_id");
    localStorage.removeItem("skillmatch_auth_token");
    if (window.history && window.history.replaceState) {
      const cleanUrl = `${window.location.origin}${window.location.pathname}${window.location.hash}`;
      window.history.replaceState({}, document.title, cleanUrl);
    }
  }
}

export const state = new AppState();

// ==========================================
// 2.1 PERSISTENT STORAGE STATUS & HELPERS
// ==========================================

export function updateStorageStatusIndicator() {
  const statusEl = document.getElementById("storage-status-text");
  const dotEl = document.getElementById("storage-pulse-dot");
  if (statusEl) {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    statusEl.textContent = `Saved Locally in Chrome (${time})`;
  }
  if (dotEl) {
    dotEl.classList.add("saving");
    setTimeout(() => dotEl.classList.remove("saving"), 500);
  }
  updateStorageModalStats();
}

function updateStorageModalStats() {
  const sStd = document.getElementById("stat-students-saved");
  const sProj = document.getElementById("stat-projects-saved");
  const sTeams = document.getElementById("stat-teams-saved");
  const sSize = document.getElementById("stat-size-saved");
  const sEngine = document.getElementById("storage-modal-engine");

  if (sStd) sStd.textContent = state.students ? state.students.length : 0;
  if (sProj) sProj.textContent = state.projects ? state.projects.length : 0;
  if (sTeams) sTeams.textContent = state.teams ? state.teams.length : 0;

  if (typeof storage !== 'undefined') {
    const stats = storage.getStorageStats();
    if (sSize) sSize.textContent = `${stats.sizeKB} KB`;
    if (sEngine) sEngine.textContent = stats.engine;
  }
}

function debounce(fn, ms = 350) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}


// ==========================================
// 3. TOAST NOTIFICATIONS
// ==========================================

export function showToast(message, type = "info") {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;

  const icon = type === "success" ? "✅" :
    type === "error" ? "❌" :
      type === "warning" ? "⚠️" : "ℹ️";

  toast.innerHTML = `
    <span style="font-size: 1.1rem;">${icon}</span>
    <div style="flex: 1; font-size: 0.88rem; font-weight: 500;">${message}</div>
    <button style="background: none; border: none; font-size: 1.1rem; cursor: pointer; color: inherit; opacity: 0.6;" aria-label="Close">&times;</button>
  `;

  const closeBtn = toast.querySelector("button");
  closeBtn.addEventListener("click", () => toast.remove());

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("fade-out");
    setTimeout(() => toast.remove(), 250);
  }, 4000);
}

// ==========================================
// 4. CENTRALIZED ADMIN PROFILE SYNCHRONIZATION
// ==========================================

export function updateAdminUI() {
  const admin = state.currentAdmin;
  if (!admin) return;

  const initials = admin.name
    .split(" ")
    .map(w => w[0])
    .filter(Boolean)
    .slice(-2)
    .join("")
    .toUpperCase() || "RK";

  // 1. Sidebar Elements
  const avatarEl = document.getElementById("sidebar-admin-avatar");
  if (avatarEl) avatarEl.textContent = initials;

  const sidebarName = document.getElementById("sidebar-admin-name");
  if (sidebarName) sidebarName.textContent = admin.name;

  const role = admin.role || "admin";
  const sidebarTitle = document.getElementById("sidebar-admin-title");
  if (sidebarTitle) {
    if (role === "student") {
      sidebarTitle.textContent = admin.rollNo ? `Student • Roll: ${admin.rollNo}` : "Student Researcher";
    } else {
      sidebarTitle.textContent = admin.designation || "Project Coordinator & Faculty";
    }
  }

  // Strict role-based navigation: students see only their own portfolio dashboard.
  const studentViews = new Set(["myskills"]);
  const coordinatorViews = new Set(["main", "project", "students", "optimizer", "results", "explain", "algo", "reports", "teamhistory"]);
  document.querySelectorAll(".sidebar-nav .nav-item").forEach(item => {
    const view = item.getAttribute("data-view");
    item.style.display = role === "student"
      ? (studentViews.has(view) ? "flex" : "none")
      : (coordinatorViews.has(view) ? "flex" : "none");
  });

  // Coordinator-only header tools are hidden for students.
  ["btn-header-backup", "btn-header-sample-data", "btn-header-open-auth", "btn-quick-teacher-modal", "btn-quick-generate-nav"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = role === "student" ? "none" : "";
  });

  // 2. Top Header Elements
  const headerCollege = document.getElementById("header-college-name");
  if (headerCollege) headerCollege.textContent = admin.college;

  const headerBranch = document.getElementById("header-branch-name");
  if (headerBranch) headerBranch.textContent = admin.branch || admin.dept;

  const headerPill = document.getElementById("header-admin-pill-name");
  if (headerPill) headerPill.textContent = admin.name;

  const cohortCodeEl = document.getElementById("admin-cohort-code");
  if (cohortCodeEl) cohortCodeEl.textContent = admin.cohortCode || "—";
  const profileSummary = document.getElementById("student-profile-summary");
  if (profileSummary && role === "student") {
    const parts = [admin.college, admin.branch, admin.section ? `Section ${admin.section}` : "", admin.semester ? `Semester ${admin.semester}` : "", admin.rollNo ? `Roll ${admin.rollNo}` : ""].filter(Boolean);
    profileSummary.textContent = parts.join(" • ");
  }

  // 3. Main Dashboard Welcome
  const mainWelcome = document.getElementById("main-welcome-teacher");
  if (mainWelcome) mainWelcome.textContent = admin.name;

  const studentWelcome = document.getElementById("student-welcome-name");
  if (studentWelcome) studentWelcome.textContent = admin.name || "Student";

  // 4. Academic Report Header & Meta
  const repCollege = document.getElementById("rep-college-name");
  if (repCollege) repCollege.textContent = admin.college;

  const repDept = document.getElementById("rep-dept-name");
  if (repDept) repDept.textContent = `${admin.dept} (${admin.branch || "Core"})`;

  const repTeacherName = document.getElementById("rep-teacher-name");
  if (repTeacherName) repTeacherName.textContent = admin.name;

  const repTeacherDesig = document.getElementById("rep-teacher-desig");
  if (repTeacherDesig) repTeacherDesig.textContent = admin.designation;

  const repTeacherEmail = document.getElementById("rep-teacher-email");
  if (repTeacherEmail) repTeacherEmail.textContent = `${admin.facultyId ? admin.facultyId + ' • ' : ''}${admin.email}`;

  // Report Persistent Document ID
  const repId = document.getElementById("rep-report-id");
  if (repId) repId.textContent = admin.reportDocumentId || "SM-2026-CS402-09";

  // 5. Academic Report Dynamic Signatures
  const repSigTeacher = document.getElementById("rep-sig-teacher-name");
  if (repSigTeacher) repSigTeacher.textContent = admin.name;

  const repSigDesig = document.getElementById("rep-sig-teacher-desig");
  if (repSigDesig) repSigDesig.textContent = `${admin.designation} (Guide)`;

  const repSigHod = document.getElementById("rep-sig-hod-name");
  if (repSigHod) repSigHod.textContent = admin.hodName || "Head of Department";
  const repSigHodImg = document.getElementById("rep-sig-img-hod");
  if (repSigHodImg) repSigHodImg.textContent = admin.hodName || "Head of Department";

  const repSigHodDept = document.getElementById("rep-sig-hod-dept");
  if (repSigHodDept) repSigHodDept.textContent = `Head of Department (${admin.branch || admin.dept})`;

  const repSigDean = document.getElementById("rep-sig-dean-name");
  if (repSigDean) repSigDean.textContent = admin.deanName || "Dean of Academic Affairs";
  const repSigDeanImg = document.getElementById("rep-sig-img-dean");
  if (repSigDeanImg) repSigDeanImg.textContent = admin.deanName || "Dean of Academic Affairs";

  const repSigDeanCollege = document.getElementById("rep-sig-dean-college");
  if (repSigDeanCollege) repSigDeanCollege.textContent = `Dean of Academic Affairs (${admin.college})`;
}

// ==========================================
// 5. AUTH VIEW CONTROLLER
// ==========================================

function initAuthFlow() {
  const authOverlay = document.getElementById("auth-view");
  const tabLogin = document.getElementById("tab-auth-login");
  const tabSignup = document.getElementById("tab-auth-signup");
  const tabStudentSignup = document.getElementById("tab-auth-student-signup");
  const formLogin = document.getElementById("form-auth-login");
  const formSignup = document.getElementById("form-auth-signup");
  const formStudentSignup = document.getElementById("form-auth-student-signup");
  const loginAlert = document.getElementById("login-feedback-alert");
  const signupAlert = document.getElementById("signup-feedback-alert");
  const studentSignupAlert = document.getElementById("student-signup-feedback-alert");

  // Tab switcher
  const showAuthPanel = (panel) => {
    [tabLogin, tabSignup, tabStudentSignup].forEach(t => t?.classList.remove("active"));
    [formLogin, formSignup, formStudentSignup].forEach(f => { if (f) f.style.display = "none"; });
    panel?.tab?.classList.add("active");
    if (panel?.form) panel.form.style.display = "block";
    if (loginAlert) loginAlert.style.display = "none";
    if (signupAlert) signupAlert.style.display = "none";
    if (studentSignupAlert) studentSignupAlert.style.display = "none";
  };

  if (tabLogin) tabLogin.addEventListener("click", () => showAuthPanel({tab: tabLogin, form: formLogin}));
  if (tabSignup) tabSignup.addEventListener("click", () => showAuthPanel({tab: tabSignup, form: formSignup}));
  if (tabStudentSignup) tabStudentSignup.addEventListener("click", () => showAuthPanel({tab: tabStudentSignup, form: formStudentSignup}));

  // Password visibility toggles
  const bindPassToggle = (btnId, inputId) => {
    const btn = document.getElementById(btnId);
    const input = document.getElementById(inputId);
    if (btn && input) {
      btn.addEventListener("click", () => {
        if (input.type === "password") {
          input.type = "text";
          btn.textContent = "🙈";
        } else {
          input.type = "password";
          btn.textContent = "👁️";
        }
      });
    }
  };

  bindPassToggle("toggle-login-password", "login-password");
  bindPassToggle("toggle-signup-password", "signup-password");
  bindPassToggle("toggle-signup-confirm-password", "signup-confirm-password");
  bindPassToggle("toggle-student-signup-password", "student-signup-password");
  bindPassToggle("toggle-student-signup-confirm", "student-signup-confirm");

  // Live Caps Lock detection on login password field
  const loginPassField = document.getElementById("login-password");
  const capsLockBadge = document.getElementById("caps-lock-warning");
  if (loginPassField && capsLockBadge) {
    const handleCaps = (e) => {
      if (e.getModifierState && e.getModifierState("CapsLock")) {
        capsLockBadge.style.display = "inline-flex";
      } else {
        capsLockBadge.style.display = "none";
      }
    };
    loginPassField.addEventListener("keyup", handleCaps);
    loginPassField.addEventListener("keydown", handleCaps);
    loginPassField.addEventListener("blur", () => {
      capsLockBadge.style.display = "none";
    });
  }

  // Helper validation function for instant real-time feedback
  const validateField = (inputEl, feedbackEl, isValid, errorMsg) => {
    if (!inputEl) return isValid;
    if (isValid) {
      inputEl.classList.remove("is-invalid");
      inputEl.classList.add("is-valid");
      if (feedbackEl) {
        feedbackEl.classList.remove("show");
        feedbackEl.textContent = "";
      }
    } else {
      inputEl.classList.remove("is-valid");
      inputEl.classList.add("is-invalid");
      if (feedbackEl) {
        feedbackEl.classList.add("show");
        feedbackEl.textContent = errorMsg;
      }
    }
    return isValid;
  };

  // Instant Live Signup Field Validations
  const sName = document.getElementById("signup-name");
  const sNameFb = document.getElementById("feedback-signup-name");
  const sEmail = document.getElementById("signup-email");
  const sEmailFb = document.getElementById("feedback-signup-email");
  const sPass = document.getElementById("signup-password");
  const sPassFb = document.getElementById("feedback-signup-password");
  const sConfirm = document.getElementById("signup-confirm-password");
  const sConfirmFb = document.getElementById("feedback-signup-confirm-password");
  const sFaculty = document.getElementById("signup-faculty-id");
  const sFacultyFb = document.getElementById("feedback-signup-faculty-id");
  const sCollege = document.getElementById("signup-college");
  const sCollegeFb = document.getElementById("feedback-signup-college");
  const sDept = document.getElementById("signup-dept");
  const sDeptFb = document.getElementById("feedback-signup-dept");
  const sBranch = document.getElementById("signup-branch");
  const sBranchFb = document.getElementById("feedback-signup-branch");
  const sHod = document.getElementById("signup-hod");
  const sHodFb = document.getElementById("feedback-signup-hod");
  const sDean = document.getElementById("signup-dean");
  const sDeanFb = document.getElementById("feedback-signup-dean");
  const sDesig = document.getElementById("signup-designation");
  const sDesigFb = document.getElementById("feedback-signup-designation");

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (sName) {
    sName.addEventListener("input", () => {
      validateField(sName, sNameFb, sName.value.trim().length >= 3, "Please enter your full name (at least 3 characters).");
    });
  }

  if (sEmail) {
    sEmail.addEventListener("input", () => {
      const val = sEmail.value.trim();
      if (!emailRegex.test(val)) {
        validateField(sEmail, sEmailFb, false, "Please enter a valid institutional email address (e.g. user@college.edu.in).");
        if (signupAlert) signupAlert.style.display = "none";
        return;
      }

      // Check if already registered
      const accounts = state.getRegisteredAccounts();
      const isRegistered = accounts.some(a => a.email.toLowerCase() === val.toLowerCase());
      if (isRegistered) {
        validateField(sEmail, sEmailFb, false, "⚠️ This email is already registered! Please sign in with your password.");
        if (signupAlert) {
          signupAlert.style.display = "block";
          signupAlert.innerHTML = `
            <div style="font-weight: 700; margin-bottom: 4px;">⚠️ Account Already Exists</div>
            <div>An administrator account already exists for <code>${val}</code>.</div>
            <div style="margin-top: 4px;">Please switch to Faculty Login to enter your portal.</div>
            <div style="margin-top: 10px;">
              <button type="button" class="btn btn-primary btn-sm" id="btn-switch-to-login-inline" style="font-size: 0.8rem; padding: 6px 12px;">
                <span>🔐</span> Switch to Sign In
              </button>
            </div>
          `;
          const btnSwitch = document.getElementById("btn-switch-to-login-inline");
          if (btnSwitch) {
            btnSwitch.addEventListener("click", () => {
              if (tabLogin) tabLogin.click();
              const lEmail = document.getElementById("login-email");
              if (lEmail) lEmail.value = val;
              const lPass = document.getElementById("login-password");
              if (lPass) lPass.focus();
            });
          }
        }
      } else {
        validateField(sEmail, sEmailFb, true, "");
        if (signupAlert) signupAlert.style.display = "none";
      }
    });
  }

  if (sPass) {
    sPass.addEventListener("input", () => {
      validateField(sPass, sPassFb, sPass.value.length >= 4, "Password must be at least 4 characters long.");
      if (sConfirm && sConfirm.value) {
        validateField(sConfirm, sConfirmFb, sConfirm.value === sPass.value, "Passwords do not match.");
      }
    });
  }

  if (sConfirm) {
    sConfirm.addEventListener("input", () => {
      validateField(sConfirm, sConfirmFb, sConfirm.value === (sPass ? sPass.value : ""), "Passwords do not match.");
    });
  }

  [sFaculty, sCollege, sDept, sBranch, sHod, sDean, sDesig].forEach(inp => {
    if (inp) {
      inp.addEventListener("input", () => {
        const fb = document.getElementById(`feedback-${inp.id}`);
        validateField(inp, fb, inp.value.trim().length > 0, "This field is required.");
      });
    }
  });

  // Quick demo coordinator login
  const quickDemoBtn = document.getElementById("btn-quick-demo-login");
  if (quickDemoBtn) {
    quickDemoBtn.addEventListener("click", async () => {
      const res = await state.demoLogin();
      if (res && res.success) {
        showToast("Logged in as Demo Coordinator (Prof. Rajesh Sharma)!", "success");
        authOverlay.classList.add("hidden");
        updateAdminUI();
        state.currentView = "main";
        switchView("main");
      } else {
        showToast(res ? res.message : "Demo sign in failed.", "error");
      }
    });
  }

  // Self-registration skill editor: the registration form accepts the same
  // skill/proficiency information used by the demo student records.
  const signupSkillsContainer = document.getElementById("student-signup-skills-container");
  const signupSkillsEmpty = document.getElementById("student-signup-skills-empty");
  let signupSkillCounter = 0;
  const addSignupSkillRow = (name = "", level = 7) => {
    if (!signupSkillsContainer) return;
    signupSkillCounter += 1;
    const row = document.createElement("div");
    row.className = "student-signup-skill-row";
    row.style.cssText = "display:grid;grid-template-columns:1.5fr .7fr auto;gap:8px;align-items:center;";
    row.innerHTML = `<input class="form-control signup-skill-name" list="signup-skill-options" placeholder="Skill name e.g. Python" value="${escapeHtml(name)}" type="text"/><input class="form-control signup-skill-level" type="number" min="1" max="10" step="1" value="${Number(level)||7}"/><button type="button" class="btn btn-secondary btn-sm signup-remove-skill" title="Remove skill">✕</button>`;
    signupSkillsContainer.appendChild(row);
    if (signupSkillsEmpty) signupSkillsEmpty.style.display = "none";
    row.querySelector(".signup-remove-skill")?.addEventListener("click", () => { row.remove(); if (!signupSkillsContainer.children.length && signupSkillsEmpty) signupSkillsEmpty.style.display="block"; });
  };
  document.getElementById("btn-student-signup-add-skill")?.addEventListener("click", () => addSignupSkillRow());
  if (!document.getElementById("signup-skill-options")) {
    const dl=document.createElement("datalist"); dl.id="signup-skill-options"; dl.innerHTML=ALL_SKILLS.map(x=>`<option value="${escapeHtml(x)}"></option>`).join(""); document.body.appendChild(dl);
  }

  // Student self-registration: students join an existing coordinator cohort,
  // then land directly on their personal Skill Portfolio dashboard.
  if (formStudentSignup) {
    formStudentSignup.addEventListener("submit", async (e) => {
      e.preventDefault();
      const get = id => document.getElementById(id);
      const name = get("student-signup-name")?.value.trim() || "";
      const email = get("student-signup-email")?.value.trim() || "";
      const password = get("student-signup-password")?.value || "";
      const confirm = get("student-signup-confirm")?.value || "";
      const rollNo = get("student-signup-roll")?.value.trim() || "";
      const cohortCode = get("student-signup-cohort")?.value.trim().toUpperCase() || "";
      const college = get("student-signup-college")?.value.trim() || "";
      const branch = get("student-signup-branch")?.value.trim() || "";
      const section = get("student-signup-section")?.value.trim() || "";
      const semester = get("student-signup-semester")?.value || "";
      const cgpa = get("student-signup-cgpa")?.value || "";
      const experience = get("student-signup-experience")?.value || "Beginner";
      const preferredRole = get("student-signup-preferred-role")?.value || "";
      const interests = get("student-signup-interests")?.value || "";
      const academicInfo = get("student-signup-academic")?.value || "";
      const certifications = get("student-signup-certifications")?.value || "";
      const projectsText = get("student-signup-projects")?.value || "";
      const internshipsText = get("student-signup-internships")?.value || "";
      const technicalExperience = get("student-signup-technical")?.value || "";
      const languagesTools = get("student-signup-tools")?.value || "";
      const achievements = get("student-signup-achievements")?.value || "";
      const skills = {};
      document.querySelectorAll("#student-signup-skills-container .student-signup-skill-row").forEach(row => {
        const sk=(row.querySelector(".signup-skill-name")?.value || "").trim();
        const lv=Number(row.querySelector(".signup-skill-level")?.value || 0);
        if (sk && Number.isInteger(lv) && lv>=1 && lv<=10) skills[sk]=lv;
      });
      if (!name || !email || !password || password.length < 4 || password !== confirm || !rollNo || !cohortCode || !college || !branch || !section || !semester) {
        showToast("Please complete all student registration fields and check the password.", "warning");
        return;
      }
      const btn = get("btn-student-signup");
      if (btn) { btn.disabled = true; btn.innerHTML = "<span>⏳</span> Creating Student Account..."; }
      try {
        const res = await state.signup({ name, email, password, role: "student", rollNo, cohortCode, college, branch, dept: "", section, semester, cgpa, experience, preferredRole, interests, academicInfo, certifications, projectsText, internshipsText, technicalExperience, languagesTools, achievements, skills });
        if (!res || !res.success || !res.admin) {
          const message = res?.message || "Student registration failed. Please verify your details and cohort code.";
          showToast(message, "error");
          if (studentSignupAlert) {
            studentSignupAlert.style.display = "block";
            studentSignupAlert.innerHTML = `<strong>⚠️ Registration failed</strong><div style="margin-top:4px;">${escapeHtml(message)}</div>`;
          }
          return;
        }

        // Student registration must finish by opening the student's own portfolio.
        // Do this explicitly after authentication instead of depending on the
        // coordinator workspace/navigation state. This keeps registration reliable
        // even when the account has a blank workspace or no previous local cache.
        state.isLoggedIn = true;
        state.currentAdmin = { ...res.admin, role: "student", isAdmin: false };
        state.currentView = "myskills";
        storage.saveCurrentSession(state.currentAdmin.id);
        state.persistAccountData(state.currentAdmin.id);

        authOverlay?.classList.add("hidden");
        updateAdminUI();
        switchView("myskills");
        // Load the portfolio from the newly authenticated student account.
        await renderMySkillsView();
        showToast("Student account created! Welcome to your Skill Portfolio.", "success");
      } catch (err) {
        console.error("Student registration/open portfolio failed:", err);
        const message = err?.message || "Something went wrong while creating the student account.";
        showToast(message, "error");
        if (studentSignupAlert) {
          studentSignupAlert.style.display = "block";
          studentSignupAlert.innerHTML = `<strong>⚠️ Registration failed</strong><div style="margin-top:4px;">${escapeHtml(message)}</div>`;
        }
      } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = "<span>🎓</span> Register & Open Skill Portfolio"; }
      }
    });
  }

  const demoHint = document.getElementById("demo-account-hint");
  if (demoHint) {
    demoHint.addEventListener("click", async () => {
      const res = await state.demoLogin();
      if (res && res.success) {
        showToast("Logged in as Demo Coordinator!", "success");
        authOverlay.classList.add("hidden");
        updateAdminUI();
        state.currentView = "main";
        switchView("main");
      }
    });
  }

  // Login Form Submission
  if (formLogin) {
    formLogin.addEventListener("submit", async (e) => {
      e.preventDefault();
      const emailInp = document.getElementById("login-email");
      const passInp = document.getElementById("login-password");
      const fbEmail = document.getElementById("feedback-login-email");
      const fbPass = document.getElementById("feedback-login-password");

      if (loginAlert) loginAlert.style.display = "none";
      if (emailInp) emailInp.classList.remove("is-invalid");
      if (passInp) passInp.classList.remove("is-invalid");
      if (fbEmail) fbEmail.classList.remove("show");
      if (fbPass) fbPass.classList.remove("show");

      const email = emailInp ? emailInp.value.trim() : "";
      const pass = passInp ? passInp.value : "";

      const res = await state.login(email, pass);
      if (!res.success) {
        showToast(res.message, "error");

        if (loginAlert) {
          loginAlert.style.display = "block";
          if (res.notRegistered) {
            if (emailInp) emailInp.classList.add("is-invalid");
            loginAlert.className = "instruction-alert-box";
            loginAlert.innerHTML = `
              <div style="display: flex; align-items: center; gap: 8px; color: #dc2626; font-weight: 700; font-size: 0.92rem; margin-bottom: 8px;">
                <span>⚠️</span> Faculty ID or email not found
              </div>
              <div style="background: rgba(37, 99, 235, 0.08); border-left: 3.5px solid var(--primary); padding: 8px 12px; border-radius: var(--radius-sm); display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap;">
                <div style="font-size: 0.82rem; color: var(--text-primary);">
                  <strong>Demo:</strong> <code>rajesh.sharma@itas.edu.in</code> / <code>admin123</code>
                </div>
                <button type="button" class="btn btn-primary btn-sm" id="btn-helper-demo-id" style="font-size: 0.76rem; padding: 4px 10px; white-space: nowrap;">
                  <span>⚡</span> Use Demo Credentials
                </button>
              </div>
            `;

            const helperDemoBtn = document.getElementById("btn-helper-demo-id");
            if (helperDemoBtn) {
              helperDemoBtn.addEventListener("click", () => {
                if (emailInp) emailInp.value = "rajesh.sharma@itas.edu.in";
                if (passInp) passInp.value = "admin123";
                if (formLogin) formLogin.dispatchEvent(new Event("submit"));
              });
            }
          } else {
            if (passInp) passInp.classList.add("is-invalid");
            loginAlert.className = "instruction-alert-box";
            loginAlert.innerHTML = `
              <div style="display: flex; align-items: center; gap: 8px; color: #dc2626; font-weight: 700; font-size: 0.92rem; margin-bottom: 8px;">
                <span>❌</span> Incorrect password
              </div>
              <div style="background: rgba(37, 99, 235, 0.08); border-left: 3.5px solid var(--primary); padding: 8px 12px; border-radius: var(--radius-sm); display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap;">
                <div style="font-size: 0.82rem; color: var(--text-primary);">
                  <strong>Demo Password:</strong> <code>admin123</code>
                </div>
                <button type="button" class="btn btn-primary btn-sm" id="btn-helper-fill-pass" style="font-size: 0.76rem; padding: 4px 10px; white-space: nowrap;">
                  <span>⚡</span> Use Demo Credentials
                </button>
              </div>
            `;

            const btnFillPass = document.getElementById("btn-helper-fill-pass");
            if (btnFillPass) {
              btnFillPass.addEventListener("click", () => {
                if (emailInp) emailInp.value = "rajesh.sharma@itas.edu.in";
                if (passInp) {
                  passInp.value = "admin123";
                  passInp.classList.remove("is-invalid");
                  passInp.focus();
                }
                if (loginAlert) loginAlert.style.display = "none";
                if (formLogin) formLogin.dispatchEvent(new Event("submit"));
              });
            }
          }
        }
        return;
      }

      showToast(`Welcome back, ${res.admin.name}!`, "success");
      authOverlay.classList.add("hidden");
      updateAdminUI();
      const userRole = (res.admin && res.admin.role) || "admin";
      if (userRole === "student") {
        state.currentView = "myskills";
        switchView("myskills");
      } else if (res.demoChoice === "pending") {
        showDemoChoiceModal();
      } else {
        state.currentView = "main";
        switchView("main");
      }
    });
  }

  // Signup Form Submission
  if (formSignup) {
    formSignup.addEventListener("submit", async (e) => {
      e.preventDefault();

      const submitBtn = document.getElementById("btn-signup");
      if (submitBtn?.disabled) return;
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<span>⏳</span> Creating Account...`;
      }

      let isValid = true;
      let firstInvalidEl = null;

      const checkReq = (inp, fb, cond, msg) => {
        const ok = validateField(inp, fb, cond, msg);
        if (!ok) {
          isValid = false;
          if (!firstInvalidEl) firstInvalidEl = inp;
        }
      };

      const isStudent = false; // Coordinator-only registration

      checkReq(sName, sNameFb, sName && sName.value.trim().length >= 3, "Full name must be at least 3 characters.");
      checkReq(sEmail, sEmailFb, sEmail && emailRegex.test(sEmail.value.trim()), "Valid institutional email is required.");
      checkReq(sPass, sPassFb, sPass && sPass.value.length >= 4, "Password must be at least 4 characters.");
      checkReq(sConfirm, sConfirmFb, sConfirm && sPass && sConfirm.value === sPass.value, "Passwords do not match.");

      // Coordinator registration uses only faculty/coordinator fields.
      checkReq(sFaculty, sFacultyFb, sFaculty && sFaculty.value.trim().length > 0, "Faculty ID is required.");
      checkReq(sCollege, sCollegeFb, sCollege && sCollege.value.trim().length > 0, "College name is required.");
      checkReq(sDept, sDeptFb, sDept && sDept.value.trim().length > 0, "Department is required.");
      checkReq(sHod, sHodFb, sHod && sHod.value.trim().length > 0, "HOD name is required.");
      checkReq(sDean, sDeanFb, sDean && sDean.value.trim().length > 0, "Dean name is required.");
      checkReq(sDesig, sDesigFb, sDesig && sDesig.value.trim().length > 0, "Designation is required.");

      if (!isValid) {
        showToast("Please correct the highlighted errors before registering.", "warning");
        if (firstInvalidEl) firstInvalidEl.focus();
        if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = `<span>✨</span> Register Coordinator Account & Enter Portal`; }
        return;
      }

      const email = sEmail.value.trim();
      const pass = sPass.value;

      const payload = {
        name: sName.value.trim(),
        email: email,
        password: pass,
        role: "admin",
        rollNo: "",
        facultyId: !isStudent ? (sFaculty ? sFaculty.value.trim() : "") : "",
        college: sCollege ? sCollege.value.trim() : "Institute of Technology & Advanced Sciences",
        dept: sDept ? sDept.value.trim() : "Department of Computer Science & Engineering",
        branch: "CSE - AI & Machine Learning",
        hodName: !isStudent ? (sHod ? sHod.value.trim() : "") : "",
        deanName: !isStudent ? (sDean ? sDean.value.trim() : "") : "",
        designation: sDesig ? sDesig.value.trim() : "Project Coordinator",
        office: document.getElementById("signup-office") ? document.getElementById("signup-office").value.trim() : "",
        research: document.getElementById("signup-research") ? document.getElementById("signup-research").value.trim() : ""
      };

      const res = await state.signup(payload);
      if (!res.success) {
        showToast(res.message, "error");
        if (res.alreadyRegistered && signupAlert) {
          signupAlert.style.display = "block";
          signupAlert.innerHTML = `
            <div style="font-weight: 700; margin-bottom: 4px;">⚠️ Account Already Exists</div>
            <div>An account with <code>${email}</code> is already registered in the system.</div>
            <div style="margin-top: 4px;">Please switch to Sign In and enter your password.</div>
            <div style="margin-top: 10px;">
              <button type="button" class="btn btn-primary btn-sm" id="btn-goto-login-helper-submit" style="font-size: 0.8rem; padding: 6px 12px;">
                <span>🔐</span> Switch to Sign In
              </button>
            </div>
          `;
          const btnSwitch = document.getElementById("btn-goto-login-helper-submit");
          if (btnSwitch) {
            btnSwitch.addEventListener("click", () => {
              if (tabLogin) tabLogin.click();
              const lEmail = document.getElementById("login-email");
              if (lEmail) lEmail.value = email;
              const lPass = document.getElementById("login-password");
              if (lPass) lPass.focus();
            });
          }
        }
        if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = `<span>✨</span> Register Coordinator Account & Enter Portal`; }
        return;
      }

      showToast("Coordinator account registered successfully!", "success");
      authOverlay.classList.add("hidden");
      updateAdminUI();
      // New coordinator accounts start with a clean workspace. Demo data is available only through Demo Login.
      state.currentView = "main";
      switchView("main");

      // Reset the registration form after a successful account creation so old/demo-looking values cannot leak into a later registration.
      formSignup.reset();
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `<span>✨</span> Register Coordinator Account & Enter Portal`;
      }
    });
  }

  // Logout handlers
  const handleSignOut = async () => {
    await state.logout();
    authOverlay.classList.remove("hidden");
    if (tabLogin) tabLogin.click();
    const lEmail = document.getElementById("login-email");
    if (lEmail) lEmail.value = "";
    const lPass = document.getElementById("login-password");
    if (lPass) lPass.value = "";
    showToast("Signed out successfully from SkillMatch AI portal.", "info");
  };

  const sidebarLogout = document.getElementById("btn-sidebar-logout");
  if (sidebarLogout) sidebarLogout.addEventListener("click", handleSignOut);

  const headerLogout = document.getElementById("btn-header-logout");
  if (headerLogout) headerLogout.addEventListener("click", handleSignOut);

  // Switch account & faculty login modal triggers
  const showAuthModal = () => {
    authOverlay.classList.remove("hidden");
    if (tabLogin) tabLogin.click();
  };
  const sidebarSwitch = document.getElementById("btn-sidebar-switch-account");
  if (sidebarSwitch) sidebarSwitch.addEventListener("click", showAuthModal);

  const headerAuth = document.getElementById("btn-header-open-auth");
  if (headerAuth) headerAuth.addEventListener("click", showAuthModal);

  // Strictly enforce authentication; prevent unauthorized access to dashboards
  const handleEnterDashboards = () => {
    if (!state.isLoggedIn || !state.currentAdmin) {
      showToast("Please sign in or use Demo Login to access the portal.", "info");
      return;
    }
    authOverlay.classList.add("hidden");
    updateAdminUI();
    switchView(state.currentView || "main");
  };

  const btnEnterDash = document.getElementById("btn-landing-enter-dashboards");
  if (btnEnterDash) btnEnterDash.addEventListener("click", handleEnterDashboards);

  const btnSkipToApp = document.getElementById("btn-portal-skip-to-app");
  if (btnSkipToApp) btnSkipToApp.addEventListener("click", handleEnterDashboards);

  const btnLandingClose = document.getElementById("btn-landing-close");
  if (btnLandingClose) btnLandingClose.addEventListener("click", () => {
    if (state.isLoggedIn) {
      authOverlay.classList.add("hidden");
    } else {
      handleEnterDashboards();
    }
  });

  // Restore authenticated dashboard if user has active session; only show login when not signed in
  if (state.isLoggedIn && state.currentAdmin) {
    authOverlay.classList.add("hidden");
    updateAdminUI();
  } else {
    authOverlay.classList.remove("hidden");
    if (tabLogin) tabLogin.click();
  }
}

export function showDemoChoiceModal() {
  const modal = document.getElementById("modal-demo-choice");
  if (modal) {
    modal.classList.add("active");
  }
}

export function hideDemoChoiceModal() {
  const modal = document.getElementById("modal-demo-choice");
  if (modal) {
    modal.classList.remove("active");
  }
}

function initDemoChoiceModal() {
  const modal = document.getElementById("modal-demo-choice");
  const btnLoad = document.getElementById("btn-choice-load-demo");
  const btnEmpty = document.getElementById("btn-choice-empty-workspace");

  if (btnLoad) {
    btnLoad.addEventListener("click", async () => {
      btnLoad.disabled = true;
      btnLoad.innerHTML = `<span>⏳</span> Loading Demo Data...`;
      try {
        await api.setDemoChoice(true);
        await state.loadWorkspaceFromBackend();
        hideDemoChoiceModal();
        showToast("Sample demo projects & students loaded into your private workspace!", "success");
        switchView("main");
      } catch (err) {
        showToast("Error loading demo data.", "error");
      } finally {
        btnLoad.disabled = false;
        btnLoad.innerHTML = `<span>📦</span> Yes, Load Demo Data`;
      }
    });
  }

  if (btnEmpty) {
    btnEmpty.addEventListener("click", async () => {
      btnEmpty.disabled = true;
      btnEmpty.innerHTML = `<span>⏳</span> Initializing Clean Workspace...`;
      try {
        await api.setDemoChoice(false);
        await state.loadWorkspaceFromBackend();
        hideDemoChoiceModal();
        showToast("Clean slate initialized! You can now define your projects and add students.", "info");
        switchView("main");
      } catch (err) {
        showToast("Error setting up workspace.", "error");
      } finally {
        btnEmpty.disabled = false;
        btnEmpty.innerHTML = `<span>✨</span> No, Start With My Own Data`;
      }
    });
  }
}


// ==========================================
// 6. NAVIGATION & VIEW SWITCHING
// ==========================================

export function switchView(targetView) {
  const role = state.currentAdmin?.role;
  if (role === "student" && targetView !== "myskills") targetView = "myskills";
  if (targetView === "catalog") targetView = role === "student" ? "myskills" : "main";
  state.currentView = targetView;
  // Team Overview is read-only. Avoid writing a possibly stale in-memory
  // workspace just because the user navigated to this dashboard.
  if (targetView !== "reports") state.save();

  // 1. Sidebar items active state
  document.querySelectorAll(".sidebar-nav .nav-item").forEach(item => {
    const viewName = item.getAttribute("data-view");
    if (viewName === targetView) {
      item.classList.add("active");
    } else {
      item.classList.remove("active");
    }
  });

  // 2. Toggle panels visibility
  document.querySelectorAll(".view-panel").forEach(panel => {
    if (panel.id === `view-${targetView}`) {
      panel.style.display = "block";
    } else {
      panel.style.display = "none";
    }
  });

  // 3. Reset the actual application scroll container.
  // The page scroll lives inside .main-wrapper, not window; resetting it prevents blank/white areas after switching dashboards.
  const mainWrapper = document.querySelector(".main-wrapper");
  if (mainWrapper) mainWrapper.scrollTo({ top: 0, behavior: "auto" });
  else window.scrollTo({ top: 0, behavior: "auto" });

  // 4. Trigger view-specific render updates
  switch (targetView) {
    case "main":
      renderMainDashboard();
      // The backend cohort is the live source of truth for registered students.
      // Refresh it whenever the main dashboard is opened so the sidebar and KPI
      // always show the current registered-student count.
      if (state.currentAdmin?.role === "admin") {
        refreshAdminCohortStudents();
      }
      break;
    case "project":
      renderProjectAnalysisView();
      break;
    case "students":
      renderStudentsCohortView();
      // Always refresh the admin roster directly from SQLite when this dashboard
      // is opened. This prevents an older localStorage workspace with 0 students
      // from masking newly registered student accounts.
      if (state.currentAdmin?.role === "admin") refreshAdminCohortStudents();
      break;
    case "optimizer":
      renderOptimizerView();
      break;
    case "results":
      renderResultsView();
      break;
    case "explain":
      renderExplainView();
      break;
    case "algo":
      renderAlgoBenchmarkView();
      break;
    case "reports":
      renderReportsView();
      break;
    case "teamhistory":
      renderTeamHistoryView();
      break;
    case "myskills":
      renderMySkillsView();
      break;
  }
}

// ==========================================
// 7. THEME TOGGLE
// ==========================================

function initTheme() {
  const html = document.documentElement;
  html.setAttribute("data-theme", state.theme);

  const icon = document.getElementById("theme-toggle-icon");
  if (icon) icon.textContent = state.theme === "dark" ? "☀️" : "🌙";

  const btn = document.getElementById("theme-toggle-btn");
  if (btn) {
    btn.addEventListener("click", () => {
      state.theme = state.theme === "dark" ? "light" : "dark";
      html.setAttribute("data-theme", state.theme);
      localStorage.setItem("skillmatch_theme", state.theme);
      if (icon) icon.textContent = state.theme === "dark" ? "☀️" : "🌙";

      // Re-render chart views to refresh palette contrast
      if (state.currentView === "algo") renderAlgoBenchmarkView();
      if (state.currentView === "results") renderResultsView();
    });
  }
}

// ==========================================
// 8. TEACHER / ADMIN PROFILE MODAL
// ==========================================


// ==========================================
// 8.1 STORAGE MODAL & ROSTER IMPORT/EXPORT
// ==========================================

function initStorageManagementEvents() {
  const storagePill = document.getElementById("header-storage-status");
  const backupBtn = document.getElementById("btn-header-backup");
  const modal = document.getElementById("modal-storage-mgmt");
  const closeBtn = document.getElementById("close-storage-modal");
  const closeFooterBtn = document.getElementById("btn-close-storage-modal");
  const exportBtn = document.getElementById("btn-modal-export-backup");
  const dropzone = document.getElementById("dropzone-backup-file");
  const fileInput = document.getElementById("input-backup-file");

  const openModal = () => {
    updateStorageModalStats();
    if (modal) modal.classList.add("active");
  };
  const closeModal = () => {
    if (modal) modal.classList.remove("active");
  };

  if (storagePill) storagePill.addEventListener("click", openModal);
  if (backupBtn) backupBtn.addEventListener("click", openModal);
  if (closeBtn) closeBtn.addEventListener("click", closeModal);
  if (closeFooterBtn) closeFooterBtn.addEventListener("click", closeModal);

  if (exportBtn) {
    exportBtn.addEventListener("click", () => {
      storage.exportBackup();
      showToast("Workspace backup exported to JSON file!", "success");
    });
  }

  if (dropzone && fileInput) {
    dropzone.addEventListener("click", () => fileInput.click());
    dropzone.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropzone.classList.add("dragover");
    });
    dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
    dropzone.addEventListener("drop", (e) => {
      e.preventDefault();
      dropzone.classList.remove("dragover");
      if (e.dataTransfer.files.length > 0) {
        handleBackupFile(e.dataTransfer.files[0]);
      }
    });

    fileInput.addEventListener("change", (e) => {
      if (e.target.files.length > 0) {
        handleBackupFile(e.target.files[0]);
      }
    });
  }

  const handleBackupFile = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const res = storage.importBackup(e.target.result);
      if (res.success) {
        showToast("Backup restored accurately! Reloading workspace...", "success");
        setTimeout(() => {
          state.loadActiveSession();
          updateAdminUI();
          switchView(state.currentView || "main");
          closeModal();
        }, 500);
      } else {
        showToast(res.message, "error");
      }
    };
    reader.readAsText(file);
  };
}

function initStudentImportEvents() {
  const importModal = document.getElementById("modal-import-students");
  const openImportBtn = document.getElementById("btn-import-students-modal");
  const closeImportBtn = document.getElementById("close-import-students-modal");
  const cancelImportBtn = document.getElementById("btn-cancel-import-students");
  const confirmImportBtn = document.getElementById("btn-confirm-import-students");
  const dropzone = document.getElementById("dropzone-students-file");
  const fileInput = document.getElementById("input-students-file");
  const downloadTemplateBtn = document.getElementById("btn-download-csv-template");
  const exportCohortBtn = document.getElementById("btn-export-students-json");

  let parsedStudents = [];

  const openModal = () => {
    parsedStudents = [];
    if (confirmImportBtn) confirmImportBtn.disabled = true;
    if (importModal) importModal.classList.add("active");
  };
  const closeModal = () => {
    if (importModal) importModal.classList.remove("active");
  };

  if (openImportBtn) openImportBtn.addEventListener("click", openModal);
  if (closeImportBtn) closeImportBtn.addEventListener("click", closeModal);
  if (cancelImportBtn) cancelImportBtn.addEventListener("click", closeModal);

  if (exportCohortBtn) {
    exportCohortBtn.addEventListener("click", () => {
      const blob = new Blob([JSON.stringify(state.students, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `SkillMatch_Cohort_${state.students.length}_Students.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast(`Exported ${state.students.length} student profiles!`, "success");
    });
  }

  if (downloadTemplateBtn) {
    downloadTemplateBtn.addEventListener("click", () => {
      const headers = ["RollNo", "Name", "CGPA", "Experience", "PreferredRole", "Interests", ...ALL_SKILLS].join(",");
      const sample = ["CS2026-001", "Arjun Das", "8.7", "Advanced", "AI Developer", "Deep Learning; PyTorch", "9", "9", "7", "8", "4", "7", "8", "6", "5", "6", "7", "8", "5", "7", "6"].join(",");
      const csvContent = "data:text/csv;charset=utf-8," + encodeURIComponent(headers + "\n" + sample);
      const a = document.createElement("a");
      a.href = csvContent;
      a.download = "SkillMatch_Student_Roster_Template.csv";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      showToast("CSV roster template downloaded!", "info");
    });
  }

  if (dropzone && fileInput) {
    dropzone.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", (e) => {
      if (e.target.files.length > 0) processRosterFile(e.target.files[0]);
    });
  }

  const processRosterFile = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      try {
        if (file.name.endsWith(".json")) {
          const json = JSON.parse(text);
          parsedStudents = Array.isArray(json) ? json : (json.students || []);
        } else {
          parsedStudents = parseStudentCSV(text);
        }
        if (parsedStudents.length > 0) {
          dropzone.innerHTML = `<div style="color: var(--success); font-weight: 700; font-size: 1.1rem;">✅ Loaded ${parsedStudents.length} student profiles from ${file.name}</div><p style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 4px;">Click 'Import Students' below to finalize.</p>`;
          if (confirmImportBtn) confirmImportBtn.disabled = false;
        } else {
          showToast("No valid student rows found in file.", "warning");
        }
      } catch (err) {
        showToast(`Failed to parse file: ${err.message}`, "error");
      }
    };
    reader.readAsText(file);
  };

  const parseStudentCSV = (csv) => {
    const lines = csv.trim().split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) return [];
    const headers = lines[0].split(",").map(h => h.trim().toLowerCase());
    const list = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(",").map(c => c.trim());
      if (cols.length < 2) continue;
      const s = {
        id: `std-imp-${Date.now()}-${i}`,
        rollNo: cols[0] || `CS2026-${String(i).padStart(3, '0')}`,
        name: cols[1] || `Student ${i}`,
        cgpa: parseFloat(cols[2]) || 8.0,
        experience: cols[3] || "Intermediate",
        preferredRole: cols[4] || "AI Developer",
        interests: cols[5] ? cols[5].split(";").map(x => x.trim()) : ["Software Engineering"],
        skills: {}
      };
      ALL_SKILLS.forEach(skill => {
        const idx = headers.indexOf(skill.toLowerCase());
        s.skills[skill] = (idx !== -1 && cols[idx]) ? parseInt(cols[idx], 10) || 6 : 6;
      });
      list.push(s);
    }
    return list;
  };

  if (confirmImportBtn) {
    confirmImportBtn.addEventListener("click", () => {
      if (parsedStudents.length === 0) return;
      const mode = document.querySelector('input[name="import-mode"]:checked')?.value || "append";
      if (mode === "replace") {
        state.students = parsedStudents;
      } else {
        state.students = [...state.students, ...parsedStudents];
      }
      state.save();
      renderStudentsCohortView();
      closeModal();
      showToast(`Successfully imported ${parsedStudents.length} students into student group!`, "success");
    });
  }
}

function initPWAEvents() {
  if ("serviceWorker" in navigator && (window.location.protocol === "http:" || window.location.protocol === "https:")) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => { });
    });
  }

  let deferredPrompt = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const installBtn = document.getElementById("btn-install-pwa");
    if (installBtn) {
      installBtn.style.display = "inline-flex";
      installBtn.addEventListener("click", () => {
        installBtn.style.display = "none";
        deferredPrompt.prompt();
        deferredPrompt = null;
      });
    }
  });
}

function initTeacherModal() {
  const modal = document.getElementById("modal-teacher-profile");
  const openSidebar = document.getElementById("open-teacher-profile-sidebar");
  const openHeader = document.getElementById("btn-quick-teacher-modal");
  const closeBtn = document.getElementById("close-teacher-modal");
  const cancelBtn = document.getElementById("btn-cancel-teacher-modal");
  const form = document.getElementById("teacher-profile-form");

  const openModal = () => {
    if (!state.currentAdmin) return;
    const a = state.currentAdmin;
    document.getElementById("teacher-input-name").value = a.name || "";
    document.getElementById("teacher-input-desig").value = a.designation || "";
    document.getElementById("teacher-input-college").value = a.college || "";
    document.getElementById("teacher-input-dept").value = a.dept || "";
    document.getElementById("teacher-input-branch").value = a.branch || "";
    document.getElementById("teacher-input-empid").value = a.facultyId || "";
    document.getElementById("teacher-input-hod").value = a.hodName || "";
    document.getElementById("teacher-input-dean").value = a.deanName || "";
    document.getElementById("teacher-input-email").value = a.email || "";
    document.getElementById("teacher-input-password").value = "";
    document.getElementById("teacher-input-research").value = a.research || "";
    document.getElementById("teacher-input-office").value = a.office || "";
    modal.classList.add("active");
  };

  const closeModal = () => modal.classList.remove("active");

  if (openSidebar) openSidebar.addEventListener("click", openModal);
  if (openHeader) openHeader.addEventListener("click", openModal);
  if (closeBtn) closeBtn.addEventListener("click", closeModal);
  if (cancelBtn) cancelBtn.addEventListener("click", closeModal);

  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!state.currentAdmin) return;

      const newPass = document.getElementById("teacher-input-password").value.trim();

      state.currentAdmin = {
        ...state.currentAdmin,
        name: document.getElementById("teacher-input-name").value.trim(),
        designation: document.getElementById("teacher-input-desig").value.trim(),
        college: document.getElementById("teacher-input-college").value.trim(),
        dept: document.getElementById("teacher-input-dept").value.trim(),
        branch: document.getElementById("teacher-input-branch").value.trim(),
        facultyId: document.getElementById("teacher-input-empid").value.trim(),
        hodName: document.getElementById("teacher-input-hod").value.trim(),
        deanName: document.getElementById("teacher-input-dean").value.trim(),
        email: document.getElementById("teacher-input-email").value.trim(),
        research: document.getElementById("teacher-input-research").value.trim(),
        office: document.getElementById("teacher-input-office").value.trim(),
        password: newPass ? newPass : state.currentAdmin.password
      };

      state.saveAdminProfile();
      closeModal();
      showToast("Admin profile credentials updated successfully!", "success");
    });
  }
}

// ==========================================
// 9. SKILL GAP AUDITING LOGIC
// ==========================================

export function computeSkillGaps() {
  const proj = state.activeProject;
  if (!proj) {
    return {
      gapData: [],
      gapCount: 0,
      gapNames: [],
      fullyCoveredCount: 0,
      readinessIndex: 100
    };
  }

  const reqSkills = (proj.requiredSkills && proj.requiredSkills.length > 0)
    ? proj.requiredSkills
    : ((proj.expectedSkills && proj.expectedSkills.length > 0) ? proj.expectedSkills : []);

  if (reqSkills.length === 0) {
    return {
      gapData: [],
      gapCount: 0,
      gapNames: [],
      fullyCoveredCount: 0,
      readinessIndex: 100
    };
  }

  const students = state.students || [];
  const numTeams = parseInt(proj.numTeams, 10) || 4;

  const domainMap = {
    "AI/ML": "AI & Machine Learning",
    "Python": "Core Software Engineering",
    "Computer Vision": "Perception AI",
    "NLP": "Language AI",
    "Data Analysis": "Data Science",
    "Database": "Backend & Database",
    "Backend": "Backend & Database",
    "Web Development": "UI/UX & Web",
    "Web": "UI/UX & Web",
    "UI/UX": "UI/UX & Web",
    "Cloud/DevOps": "Cloud & DevOps",
    "Cybersecurity": "InfoSec & Systems",
    "Research": "Academic Research",
    "IoT": "Embedded Systems",
    "Optimization Algorithms": "Algorithms & Optimization",
    "Mobile Development": "Mobile Systems"
  };

  const getDomainRecommendation = (skill, domain, isGap, deficit, proficientCount, numTeams) => {
    if (!isGap) {
      return "Cohort competency verified across all teams; proceed with regular milestone reviews.";
    }
    const dLower = (domain || "").toLowerCase();
    const sLower = (skill || "").toLowerCase();

    if (sLower.includes("ai") || sLower.includes("ml") || sLower.includes("vision") || sLower.includes("nlp") || dLower.includes("ai")) {
      return "PyTorch/Deep Learning lab bootcamps, paired model tuning sessions.";
    }
    if (sLower.includes("backend") || sLower.includes("database") || sLower.includes("sql") || sLower.includes("api") || dLower.includes("backend") || dLower.includes("database")) {
      return "Asynchronous microservices workshop, schema indexing standards.";
    }
    if (sLower.includes("ui") || sLower.includes("ux") || sLower.includes("web") || sLower.includes("frontend") || dLower.includes("ui") || dLower.includes("web")) {
      return "Design sprint workshops, standardizing accessible frontend component libraries.";
    }
    if (sLower.includes("cloud") || sLower.includes("devops") || sLower.includes("docker") || sLower.includes("k8s") || dLower.includes("cloud")) {
      return "Containerization (Docker) and deployment CI/CD pipeline starter packs.";
    }
    if (sLower.includes("research") || dLower.includes("research")) {
      return "Technical literature synthesis and empirical benchmarking milestones.";
    }
    if (sLower.includes("python")) {
      return "Python asynchronous architecture labs and coding interview style pair-programming.";
    }
    return `Conduct targeted laboratory workshops for ${skill} and pair emerging students with senior project leads.`;
  };

  const gapData = [];
  let gapCount = 0;
  const gapNames = [];
  let fullyCoveredCount = 0;
  let readinessSum = 0;

  for (const req of reqSkills) {
    const skillName = (typeof req === "string" ? req : (req.skill || req.name || "Engineering Skill")).trim();
    const target = parseInt(req.targetPercent || req.target || 70, 10);
    const targetScore = Math.round(target / 10);
    const importance = req.importance || (target >= 85 ? "Very High" : target >= 75 ? "High" : (target <= 45 ? "Beginner / Foundational" : "Medium"));
    const domain = req.domain || domainMap[skillName] || "Core Engineering";

    const getSkillPct = (student, skill) => {
      const skills = student?.skills || {};
      if (skills[skill] !== undefined) return Number(skills[skill]) * 10;
      const key = Object.keys(skills).find(k => k.toLowerCase() === skill.toLowerCase());
      if (key) return Number(skills[key]) * 10;
      if (skill.toLowerCase() === "web development" || skill.toLowerCase() === "web") {
        const k = Object.keys(skills).find(x => ["web", "web development"].includes(x.toLowerCase()));
        return k ? Number(skills[k]) * 10 : 0;
      }
      return 0;
    };

    const scoredStudents = students.map(student => ({student, value: getSkillPct(student, skillName)}));
    const maxRecord = scoredStudents.reduce((best, cur) => cur.value > best.value ? cur : best, {student:null,value:0});
    const totalCapability = scoredStudents.reduce((sum,x) => sum + x.value, 0);
    const maxCapability = maxRecord.value;
    const topStudent = maxRecord.student?.name || "No matching student";
    const proficientCount = scoredStudents.filter(x => x.value >= target).length;
    const cohortAvg = students.length ? Math.round(totalCapability / students.length) : 0;

    // Every team needs at least one student meeting the target for each required competency.
    const requiredQualified = Math.max(1, numTeams);
    const qualifiedDeficit = Math.max(0, requiredQualified - proficientCount);
    const teamCapability = maxCapability;
    const currentProfScore = Math.round(teamCapability / 10);
    const gapScore = Math.max(0, targetScore - currentProfScore);
    const peakDeficit = Math.max(0, target - maxCapability);
    const meanDeficit = Math.max(0, target - cohortAvg);
    const hasSufficiency = proficientCount >= requiredQualified;
    const isGap = !hasSufficiency || meanDeficit > 0 || peakDeficit > 0;
    const gapDelta = isGap ? Math.max(peakDeficit, meanDeficit, qualifiedDeficit * 10, gapScore * 10) : 0;

    // Identify unassigned students in available pool who have this skill
    const unassignedCandidates = students
      .filter(s => {
        const isAssigned = s.assignedTeamId || (s.assignedProjectId && s.assignedProjectId !== proj.id);
        return !isAssigned;
      })
      .filter(s => {
        let sVal = 0;
        if (s.skills && s.skills[skillName] !== undefined) sVal = s.skills[skillName];
        else if (s.skills) {
          const matchKey = Object.keys(s.skills).find(k => k.toLowerCase() === skillName.toLowerCase());
          if (matchKey) sVal = s.skills[matchKey];
        }
        return sVal * 10 >= target - 10;
      })
      .map(s => {
        let sVal = s.skills && s.skills[skillName] !== undefined ? s.skills[skillName] : 7;
        return `${s.name} (${sVal}/10)`;
      });

    let severity = "Fully Covered";
    let severityClass = "badge-success";

    if (peakDeficit > 20 || proficientCount === 0 || meanDeficit > 25 || gapScore >= 3) {
      severity = "Critical Gap";
      severityClass = "badge-danger";
    } else if (peakDeficit > 10 || proficientCount < numTeams || meanDeficit > 15 || gapScore >= 1) {
      severity = "Moderate Deficit";
      severityClass = "badge-warning";
    } else if (isGap) {
      severity = "Low Deficit";
      severityClass = "badge-primary";
    }

    if (isGap) {
      gapCount++;
      gapNames.push(skillName);
    } else {
      fullyCoveredCount++;
    }

    const skillReadiness = Math.min(100, Math.round((teamCapability / Math.max(1, target)) * 100));
    readinessSum += skillReadiness;

    const tailoredRec = getDomainRecommendation(skillName, domain, isGap, gapDelta, proficientCount, numTeams);

    gapData.push({
      skill: skillName,
      domain,
      importance,
      target,
      targetScore,
      currentProfScore,
      gapScore,
      required: target,
      cohortAvg: cohortAvg || 0,
      available: teamCapability || 0,
      gapDelta: gapDelta || 0,
      deficit: peakDeficit,
      topStudent: topStudent || (students.length > 0 ? "Cohort Average" : "No Students"),
      proficientCount,
      requiredQualified,
      numTeams,
      isGap,
      severity,
      severityClass,
      unassignedCandidates,
      remediation: tailoredRec
    });
  }

  const readinessIndex = reqSkills.length > 0 ? Math.round(readinessSum / reqSkills.length) : 100;

  return {
    gapData,
    gapCount,
    gapNames,
    fullyCoveredCount,
    readinessIndex
  };
}

// ==========================================
// 10. DASHBOARD 1: 🏠 MAIN DASHBOARD
// ==========================================

function renderMainDashboard() {
  const { gapCount, gapNames } = computeSkillGaps();

  // KPIs
  const kpiProjects = document.getElementById("kpi-total-projects");
  if (kpiProjects) kpiProjects.textContent = state.projects.length;

  const kpiStudents = document.getElementById("kpi-total-students");
  if (kpiStudents) kpiStudents.textContent = state.students.length;

  const kpiTeams = document.getElementById("kpi-teams-created");
  if (kpiTeams) kpiTeams.textContent = state.teams ? state.teams.length : (state.activeProject ? state.activeProject.numTeams : 0);

  const kpiAvg = document.getElementById("kpi-avg-score");
  if (kpiAvg) {
    if (state.teams && state.teams.length > 0) {
      const sum = state.teams.reduce((acc, t) => acc + (t.metrics ? t.metrics.overallScore : 0), 0);
      kpiAvg.textContent = `${Math.round(sum / state.teams.length)}%`;
    } else {
      kpiAvg.textContent = state.projects.length === 0 ? "0%" : "—";
    }
  }

  const kpiGaps = document.getElementById("kpi-skill-gaps");
  if (kpiGaps) kpiGaps.textContent = gapCount;

  const kpiGapSubtext = document.getElementById("kpi-gap-subtext");
  if (kpiGapSubtext) {
    if (state.projects.length === 0) {
      kpiGapSubtext.textContent = "Awaiting project definition";
    } else if (gapCount > 0) {
      kpiGapSubtext.textContent = `${gapNames.slice(0, 2).join(", ")} Deficit Detected`;
    } else {
      kpiGapSubtext.textContent = "Students Well Balanced";
    }
  }

  // Sidebar Counts
  const sidebarGap = document.getElementById("sidebar-gap-badge");
  if (sidebarGap) {
    if (state.projects.length === 0) {
      sidebarGap.textContent = "No Project";
      sidebarGap.className = "nav-badge";
    } else if (gapCount > 0) {
      sidebarGap.textContent = `${gapCount} Gap${gapCount > 1 ? "s" : ""}`;
      sidebarGap.className = "nav-badge alert";
    } else {
      sidebarGap.textContent = "Optimal";
      sidebarGap.className = "nav-badge";
    }
  }

  const sidebarTeams = document.getElementById("sidebar-team-count");
  if (sidebarTeams) {
    sidebarTeams.textContent = `${state.teams ? state.teams.length : (state.activeProject ? state.activeProject.numTeams : 0)} Teams`;
  }

  // Active Project Card or Empty State
  const activeProj = state.activeProject;
  const pType = document.getElementById("main-active-proj-type");
  const pName = document.getElementById("main-active-proj-name");
  const pDesc = document.getElementById("main-active-proj-desc");
  const pSkills = document.getElementById("main-active-proj-skills");
  const pCount = document.getElementById("main-active-proj-req-count");

  const REQ_THEME_PALETTE = [
    { theme: "emerald", label: "Emerald", color: "#10b981", bg: "rgba(16, 185, 129, 0.08)", border: "rgba(16, 185, 129, 0.35)", badgeBg: "#10b981", badgeText: "#ffffff" },
    { theme: "sapphire", label: "Sapphire", color: "#2563eb", bg: "rgba(37, 99, 235, 0.08)", border: "rgba(37, 99, 235, 0.35)", badgeBg: "#2563eb", badgeText: "#ffffff" },
    { theme: "amber", label: "Amber", color: "#d97706", bg: "rgba(245, 158, 11, 0.08)", border: "rgba(245, 158, 11, 0.35)", badgeBg: "#f59e0b", badgeText: "#ffffff" },
    { theme: "violet", label: "Violet", color: "#7c3aed", bg: "rgba(124, 58, 237, 0.08)", border: "rgba(124, 58, 237, 0.35)", badgeBg: "#8b5cf6", badgeText: "#ffffff" },
    { theme: "cyan", label: "Cyan", color: "#0891b2", bg: "rgba(6, 182, 212, 0.08)", border: "rgba(6, 182, 212, 0.35)", badgeBg: "#06b6d4", badgeText: "#ffffff" },
    { theme: "rose", label: "Rose", color: "#db2777", bg: "rgba(219, 39, 119, 0.08)", border: "rgba(219, 39, 119, 0.35)", badgeBg: "#ec4899", badgeText: "#ffffff" },
    { theme: "indigo", label: "Indigo", color: "#4f46e5", bg: "rgba(79, 70, 229, 0.08)", border: "rgba(79, 70, 229, 0.35)", badgeBg: "#6366f1", badgeText: "#ffffff" },
    { theme: "coral", label: "Coral", color: "#ea580c", bg: "rgba(234, 88, 12, 0.08)", border: "rgba(234, 88, 12, 0.35)", badgeBg: "#f97316", badgeText: "#ffffff" }
  ];

  if (activeProj) {
    if (pType) pType.textContent = activeProj.type || "Capstone";
    if (pName) pName.textContent = activeProj.name || "(Untitled Blank Project)";
    if (pDesc) pDesc.textContent = activeProj.description || "No project scope specified yet. Click Edit Requirements to enter details.";

    const skills = activeProj.requiredSkills || [];
    if (pCount) pCount.textContent = `${skills.length} Requirement${skills.length === 1 ? '' : 's'}`;

    if (pSkills) {
      if (skills.length === 0) {
        pSkills.innerHTML = `
          <div style="grid-column: 1 / -1; padding: 20px; background: var(--bg-subtle); border-radius: var(--radius-md); border: 1.5px dashed var(--border-color); text-align: center;">
            <div style="font-size: 1.6rem; margin-bottom: 6px;">📝</div>
            <div style="font-weight: 700; font-size: 0.95rem; color: var(--text-primary); margin-bottom: 4px;">No Technical Requirements Extracted</div>
            <div style="font-size: 0.82rem; color: var(--text-muted); margin-bottom: 12px;">Define project scope and extract skills in the Project Analysis tab.</div>
            <button class="btn btn-secondary btn-sm" id="btn-main-define-reqs" type="button">
              <span>⚙️</span> Open Project Analysis
            </button>
          </div>
        `;
        const btnDef = document.getElementById("btn-main-define-reqs");
        if (btnDef) btnDef.addEventListener("click", () => switchView("project"));
      } else {
        pSkills.innerHTML = skills.map((req, idx) => {
          const theme = REQ_THEME_PALETTE[idx % REQ_THEME_PALETTE.length];
          const pointNum = String(idx + 1).padStart(2, '0');
          const isGap = gapNames.includes(req.skill);
          const targetPct = req.targetPercent || 75;
          const importance = req.importance || "High";

          return `
            <div class="req-point-card" style="
              --point-accent: ${theme.color};
              --point-border: ${theme.border};
              --point-pill-bg: ${theme.bg};
              --point-badge-bg: ${theme.badgeBg};
              --point-badge-text: ${theme.badgeText};
            ">
              <div class="req-point-header">
                <div class="req-point-left">
                  <span class="req-point-num">Point ${pointNum}</span>
                  <span class="req-point-name">${req.skill}</span>
                </div>
                <span class="req-point-target-badge">
                  🎯 Target ${targetPct}%
                </span>
              </div>
              <div class="req-point-meta">
                <span class="req-point-importance">
                  Priority: <strong style="color: var(--text-secondary);">${importance}</strong>
                </span>
                <span class="req-point-status ${isGap ? 'deficit' : 'ready'}">
                  ${isGap ? '⚠️ Skill Deficit' : '✓ Students Ready'}
                </span>
              </div>
              <div class="req-point-meter">
                <div class="req-point-fill" style="width: ${targetPct}%;"></div>
              </div>
            </div>
          `;
        }).join("");
      }
    }
  } else {
    if (pType) pType.textContent = "None Active";
    if (pName) pName.textContent = "No Project Configured";
    if (pDesc) pDesc.textContent = "Start by analyzing a project requirement specification or choose to load a sample capstone preset.";
    if (pCount) pCount.textContent = "0 Requirements";
    if (pSkills) {
      pSkills.innerHTML = `
        <div style="grid-column: 1 / -1; padding: 20px; background: var(--bg-subtle); border-radius: var(--radius-md); border: 1.5px dashed var(--border-color); text-align: center;">
          <button class="btn btn-primary btn-sm" id="btn-main-load-sample-proj">
            <span>📚</span> Load Sample Capstone Project
          </button>
        </div>
      `;
      const btnLoad = document.getElementById("btn-main-load-sample-proj");
      if (btnLoad) {
        btnLoad.addEventListener("click", () => {
          loadDefaultPresets();
        });
      }
    }
  }

  // Projects Catalog List
  const catalogList = document.getElementById("main-recent-projects-list");
  if (catalogList) {
    if (state.projects.length === 0) {
      catalogList.innerHTML = `
        <div class="empty-state-card" style="padding: 24px 16px;">
          <div class="empty-state-icon" style="font-size: 2rem;">📁</div>
          <div class="empty-state-title" style="font-size: 1rem;">Project Catalog is Empty</div>
          <div class="empty-state-desc" style="font-size: 0.8rem; margin-bottom: 12px;">New accounts start with zero demo data.</div>
          <div style="display: flex; gap: 8px; justify-content: center; flex-wrap: wrap;">
            <button class="btn btn-secondary btn-sm" id="btn-catalog-load-presets">
              <span>📚</span> Load Sample Presets
            </button>
            <button class="btn btn-primary btn-sm" id="btn-catalog-create-new">
              <span>📝</span> Create Project
            </button>
          </div>
        </div>
      `;
      const btnPresets = document.getElementById("btn-catalog-load-presets");
      if (btnPresets) btnPresets.addEventListener("click", loadDefaultPresets);
      const btnNew = document.getElementById("btn-catalog-create-new");
      if (btnNew) btnNew.addEventListener("click", () => switchView("project"));
    } else {
      catalogList.innerHTML = state.projects.map(proj => {
        const isActive = state.activeProject && proj.id === state.activeProject.id;
        return `
          <div class="project-catalog-card ${isActive ? 'active' : ''}" data-proj-id="${proj.id}" style="
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 14px;
            border-radius: var(--radius-md);
            border: 1px solid ${isActive ? 'var(--primary)' : 'var(--border-color)'};
            background: ${isActive ? 'var(--primary-light)' : 'var(--bg-surface)'};
            cursor: pointer;
            transition: all var(--transition-fast);
          ">
            <div>
              <div style="font-weight: 700; font-size: 0.95rem; color: var(--text-primary);">${proj.name}</div>
              <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 2px;">
                ${proj.type} • ${proj.teamSize || 5} Students/Team • ${proj.numTeams || 4} Teams
              </div>
            </div>
            <span class="badge ${isActive ? 'badge-primary' : 'badge-neutral'}">
              ${isActive ? 'Active' : 'Switch'}
            </span>
          </div>
        `;
      }).join("");

      catalogList.querySelectorAll(".project-catalog-card").forEach(el => {
        el.addEventListener("click", () => {
          const id = el.getAttribute("data-proj-id");
          const found = state.projects.find(p => p.id === id);
          if (found) {
            state.activeProject = found;
            state.teams = null;
            state.lastResultMeta = null;
            state.save();
            showToast(`Active project changed to: ${found.name}`, "info");
            renderMainDashboard();
          }
        });
      });
    }
  }

  updateAdminUI();
}

async function loadDefaultPresets() {
  const presets = JSON.parse(JSON.stringify(PROJECT_PRESETS));

  // Keep sample projects idempotent for both the built-in demo account and
  // registered admin accounts. Older builds stored the presets as global
  // `preset-*` IDs while newer builds use account-scoped IDs. If both sets are
  // present, simply saving the new four projects would leave eight projects.
  // Remove only those known sample IDs before writing the canonical four.
  if (state.isLoggedIn && state.currentAdmin?.role === "admin" && typeof api.getWorkspace === "function") {
    try {
      if (typeof api.flushWorkspaceSaves === "function") await api.flushWorkspaceSaves();
      const fresh = await api.getWorkspace();
      const workspace = fresh?.workspace || fresh || {};
      const accountId = String(state.currentAdmin?.id || "account")
        .replace(/[^a-zA-Z0-9_-]/g, "_");
      // Loading the sample catalog is a REPLACE operation: remove every
      // currently stored project for this account before writing the canonical
      // four samples. Team History is intentionally not touched because it is
      // a separate historical record and must remain available.
      const existingProjects = Array.isArray(workspace.projects) ? workspace.projects : [];
      for (const project of existingProjects) {
        if (!project?.id) continue;
        try {
          await api.deleteProject(project.id);
        } catch (err) {
          console.warn(`Could not replace existing project ${project.id}:`, err);
        }
      }

      state.projects = presets.map(project => ({
        ...project,
        id: `sample_project_${accountId}_${project.id}`
      }));
      state.activeProject = state.projects[0];
      state.teams = null;
      state.teamsByProject = {};
      state.lastResultMeta = null;
      await api.saveWorkspace({
        projects: state.projects,
        activeProjectId: state.activeProject?.id || null,
        weights: state.weights,
        theme: state.theme,
        currentView: state.currentView,
        reportDocumentId: state.currentAdmin?.reportDocumentId || ""
      });
      showToast("Sample capstone projects loaded successfully!", "success");
      renderMainDashboard();
      return;
    } catch (err) {
      console.error("Persistent sample project loading failed:", err);
      showToast("Could not load sample capstone projects. Please try again.", "error");
      return;
    }
  }

  // Offline/demo-preview fallback: replace the catalog rather than append to it.
  state.projects = presets;
  state.activeProject = state.projects[0];
  state.teams = null;
  state.teamsByProject = {};
  state.lastResultMeta = null;
  state.save();
  showToast("Sample capstone projects loaded successfully!", "success");
  renderMainDashboard();
}

async function persistCohortToBackend(students) {
  // Keep sample/manual cohort data in the same persistent SQLite workspace used
  // by team saving. Otherwise /api/teams/save can return an empty backend cohort
  // and the UI would replace the populated local cohort with 0 students.
  if (!state.isLoggedIn || !state.currentAdmin || state.currentAdmin.role !== "admin" || !Array.isArray(students)) return;
  try {
    for (const student of students) {
      const res = await api.saveStudent(student);
      // If a sample student id already belongs to another coordinator, the
      // backend creates a coordinator-scoped id. Keep the frontend id aligned
      // with SQLite so team membership and assignments survive relogin.
      if (res && res.studentId && res.studentId !== student.id) {
        student.id = res.studentId;
      }
    }
  } catch (err) {
    console.warn("Backend cohort sync warning:", err);
  }
}

async function loadDefaultCohort() {
  // Never let a previously queued autosave write stale student arrays after
  // the backend has normalized the sample cohort. This is essential when the
  // user clicks Load Sample Students immediately after another dashboard
  // action.
  if (typeof api.flushWorkspaceSaves === "function") {
    await api.flushWorkspaceSaves();
  }

  // Sample loading is intentionally idempotent. The backend keeps one
  // account-scoped copy of each of the 20 sample students, so clicking this
  // button again refreshes those same records instead of appending duplicates.
  try {
    let workspace = null;
    try {
      const fresh = await api.getWorkspace();
      workspace = fresh?.workspace || fresh || null;
    } catch (err) {
      console.warn("Workspace read before sample-student load failed:", err);
    }

    const projects = Array.isArray(workspace?.projects)
      ? workspace.projects
      : (Array.isArray(state.projects) ? state.projects : []);

    // Clear existing project assignments first so replacing sample records
    // cannot leave stale team memberships behind.
    for (const project of projects) {
      if (project?.id !== undefined && project?.id !== null) {
        try {
          await api.releaseProjectAssignments(project.id);
        } catch (err) {
          console.warn(`Could not release assignments for project ${project.id}:`, err);
        }
      }
    }

    if (!state.isLoggedIn || state.currentAdmin?.role !== "admin" || typeof api.loadSampleStudents !== "function") {
      // The normal application always has an authenticated admin backend.
      // Keep a safe local fallback for offline/demo-preview use; de-duplicate
      // by roll number so even this path cannot append the same 20 students.
      const samples = JSON.parse(JSON.stringify(DEFAULT_STUDENTS));
      const byRoll = new Map((state.students || []).map(s => [String(s.rollNo || '').toUpperCase(), s]));
      for (const sample of samples) {
        const key = String(sample.rollNo || '').toUpperCase();
        const existing = byRoll.get(key);
        if (existing) {
          Object.assign(existing, sample, { id: existing.id });
        } else {
          state.students.push(sample);
          byRoll.set(key, sample);
        }
      }
      state.save();
      renderStudentsCohortView();
      showToast("Standard 20 sample students loaded without duplicates.", "success");
      return;
    }

    // The release calls above are independent HTTP writes. Ensure any older
    // workspace autosave has also drained before the final sample normalization.
    if (typeof api.flushWorkspaceSaves === "function") {
      await api.flushWorkspaceSaves();
    }
    const result = await api.loadSampleStudents();
    const ws = result?.workspace || {};

    if (Array.isArray(ws.projects)) state.projects = ws.projects;
    if (Array.isArray(result.students)) state.students = result.students;
    else if (Array.isArray(ws.students)) state.students = ws.students;

    state.teamsByProject = ws.teamsByProject && typeof ws.teamsByProject === "object"
      ? ws.teamsByProject
      : {};
    state.teams = Array.isArray(ws.teams) ? ws.teams : [];
    state.activeProject =
      state.projects.find(p => String(p.id) === String(ws.activeProjectId))
      || state.projects[0]
      || null;
    state.lastResultMeta = null;
    state.persistAccountData(state.currentAdmin ? state.currentAdmin.id : null);

    showToast("Standard 20 sample students loaded — existing sample students were refreshed, not duplicated.", "success");
    if (state.currentView === "students") renderStudentsCohortView();
    else if (state.currentView === "reports") await renderReportsView();
    else renderMainDashboard();
  } catch (err) {
    console.error("Sample cohort load failed:", err);
    showToast("Could not load sample students. Please try again.", "error");
  }
}

// ==========================================
// 11. DASHBOARD 2: 🔍 PROJECT ANALYSIS
// ==========================================


function renderDeepProjectAnalysis(proj) {
  const setText = (id, value) => { const el=document.getElementById(id); if(el) el.textContent=value; };
  const coverageBox=document.getElementById("deep-skill-coverage");
  const rolesBox=document.getElementById("deep-role-candidates");
  const teamBox=document.getElementById("deep-team-preview");
  const status=document.getElementById("deep-analysis-status");

  if(!proj || !proj.requiredSkills || !proj.requiredSkills.length){
    setText("deep-kpi-skills","0"); setText("deep-kpi-roles","0");
    setText("deep-kpi-coverage","0%"); setText("deep-kpi-readiness","0%");
    if(status) status.textContent="Awaiting analysis";
    if(coverageBox) coverageBox.innerHTML='<div style="font-size:.7rem;color:var(--text-muted);padding:8px 0;">Analyze the project to compare requirements with the student database.</div>';
    if(rolesBox) rolesBox.innerHTML="";
    if(teamBox) teamBox.innerHTML="";
    return;
  }

  const students=state.students||[];
  const reqs=proj.requiredSkills||[];
  const roles=proj.requiredRoles||[];
  const norm=s=>String(s||"").toLowerCase().replace(/[^a-z0-9+#]+/g," ").trim();
  const getSkill=(student, required)=>{
    const target=norm(required);
    for(const [k,v] of Object.entries(student.skills||{})){
      const nk=norm(k);
      if(nk===target || nk.includes(target) || target.includes(nk)) return Math.max(0,Number(v)||0);
    }
    return 0;
  };
  const importanceWeight={"Very High":1.4,"High":1.2,"Medium":1,"Low":.8};

  const skillRows=reqs.map(r=>{
    const target=Math.max(1,(r.targetPercent||70)/10);
    const vals=students.map(s=>getSkill(s,r.skill));
    const max=vals.length?Math.max(...vals):0;
    const avg=vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:0;
    const atTarget=vals.filter(v=>v>=target).length;
    const coverage=Math.min(100,Math.round((max/target)*100));
    return {...r,target,max,avg,atTarget,coverage};
  });
  const weightedCoverage=skillRows.length
    ? Math.round(skillRows.reduce((sum,r)=>sum+r.coverage*(importanceWeight[r.importance]||1),0)/
      skillRows.reduce((sum,r)=>sum+(importanceWeight[r.importance]||1),0))
    : 0;

  // Role candidates: compare every student to every project role, then show the best distinct candidates.
  const roleCandidates=roles.map(role=>{
    const ranked=students.map(student=>({student,fit:calculateStudentRoleFit(student,role,reqs)}))
      .sort((a,b)=>(b.fit.compositeScore||0)-(a.fit.compositeScore||0));
    return {role, ranked};
  });
  const bestRoleCandidates=[];
  const usedStudents=new Set();
  for(const rc of roleCandidates){
    const pick=rc.ranked.find(x=>!usedStudents.has(x.student.id)) || rc.ranked[0];
    if(pick){ usedStudents.add(pick.student.id); bestRoleCandidates.push({role:rc.role,student:pick.student,score:pick.fit.compositeScore||0}); }
  }

  setText("deep-kpi-skills",reqs.length);
  setText("deep-kpi-roles",roles.length);
  setText("deep-kpi-coverage",`${weightedCoverage}%`);

  // Deterministic team preview from the matching engine. The actual multi-objective
  // optimizer remains the final team-generation step; this preview is deliberately
  // non-random so opening the dashboard never changes the result.
  let preview=null;
  if(students.length && students.length >= (parseInt(proj.teamSize,10)||5)){
    try{
      preview=runMatchingAlgorithm(students,proj,state.weights||{skill:50,pref:30,exp:20});
    }catch(e){ console.warn("Deep analysis preview warning:",e); }
  }
  const readiness=preview && preview.avgScore ? Math.min(99,Math.round((weightedCoverage*.65)+(preview.avgScore*.35))) : weightedCoverage;
  setText("deep-kpi-readiness",`${readiness}%`);
  if(status) status.textContent=students.length ? "Live database comparison" : "No students loaded";

  if(coverageBox){
    coverageBox.innerHTML=skillRows.slice(0,7).map(r=>`
      <div class="deep-coverage-row">
        <div class="deep-skill-name" title="${escapeHtml(r.skill)}">${escapeHtml(r.skill)}</div>
        <div class="deep-bar"><i style="width:${Math.min(100,r.coverage)}%"></i></div>
        <div class="deep-mini">${r.coverage}%</div>
      </div>`).join("") || '<div style="font-size:.7rem;color:var(--text-muted);">No requirements extracted.</div>';
    if(skillRows.length>7) coverageBox.innerHTML += `<div style="font-size:.62rem;color:var(--text-muted);padding-top:5px;">+ ${skillRows.length-7} more requirements shown in the detailed table above.</div>`;
  }

  if(rolesBox){
    rolesBox.innerHTML=bestRoleCandidates.slice(0,6).map(x=>`
      <div class="deep-role-row">
        <strong>${escapeHtml(x.role)}</strong>
        <span>${escapeHtml(x.student.name||"Student")} · ${x.score}%</span>
      </div>`).join("") || '<div style="font-size:.7rem;color:var(--text-muted);">Add students to calculate role candidates.</div>';
  }

  if(teamBox){
    if(preview && preview.teams && preview.teams.length){
      teamBox.innerHTML=preview.teams.map(t=>{
        const names=t.members.map(m=>m.name||"Student").join(", ");
        return `<div class="deep-team-row"><strong>${escapeHtml(t.name)}</strong><div class="deep-team-members" title="${escapeHtml(names)}">${escapeHtml(names||"No members")}</div><div class="deep-team-score">${t.metrics?.overallScore||0}%</div></div>`;
      }).join("") + `<div style="font-size:.62rem;color:var(--text-muted);padding-top:6px;">Preview uses deterministic bipartite matching. Click “Continue to Team Optimization” to run the full multi-objective optimizer.</div>`;
    } else {
      teamBox.innerHTML='<div style="font-size:.7rem;color:var(--text-muted);">Need enough registered students for the requested team size to preview team formation.</div>';
    }
  }
}

function renderProjectAnalysisView() {
  const presetSelector = document.getElementById("project-preset-selector");
  if (presetSelector) {
    if (state.projects.length === 0) {
      presetSelector.innerHTML = `<option value="">-- No Projects (Click 'Create Blank Project' or 'Load Presets') --</option>`;
    } else {
      presetSelector.innerHTML = state.projects.map(p => `
        <option value="${p.id}" ${state.activeProject && p.id === state.activeProject.id ? 'selected' : ''}>${escapeHtml(p.name || "(Untitled Blank Project)")}</option>
      `).join("");
    }
  }
  const removeProjectBtn = document.getElementById("btn-remove-current-project");
  if (removeProjectBtn) {
    removeProjectBtn.disabled = !state.activeProject;
    removeProjectBtn.title = state.activeProject
      ? `Remove ${state.activeProject.name || "this project"} and make its assigned students available again`
      : "Select a project to remove";
  }

  if (state.activeProject) {
    populateProjectForm(state.activeProject);
    renderExtractedSkillsAndRoles();
  } else {
    // Empty project form
    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
    setVal("proj-input-name", "");
    setVal("proj-input-type", "");
    setVal("proj-input-teamsize", "5");
    setVal("proj-input-numteams", "4");
    setVal("proj-input-desc", "");
    renderExtractedSkillsAndRoles();
  }
}

function populateProjectForm(proj) {
  const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
  setVal("proj-input-name", proj.name || "");
  setVal("proj-input-type", proj.type || "");
  setVal("proj-input-teamsize", proj.teamSize || 5);
  setVal("proj-input-numteams", proj.numTeams || 4);
  setVal("proj-input-desc", proj.description || "");
}

function renderExtractedSkillsAndRoles() {
  const proj = state.activeProject;
  const rolesList = document.getElementById("extracted-roles-list");
  const skillsTbody = document.getElementById("extracted-skills-tbody");
  const emptyState = document.getElementById("project-analysis-empty-state");
  const resultsContainer = document.getElementById("project-analysis-results-container");

  if (!proj || !proj.requiredSkills || proj.requiredSkills.length === 0) {
    if (emptyState) emptyState.style.display = "block";
    if (resultsContainer) resultsContainer.style.display = "none";
    return;
  }

  if (emptyState) emptyState.style.display = "none";
  if (resultsContainer) resultsContainer.style.display = "block";

  if (rolesList) {
    const roles = proj.requiredRoles || ["AI Developer", "Backend Architect", "Database Engineer", "UI/UX Designer", "Research Lead"];
    rolesList.innerHTML = roles.map(role => `
      <span class="badge badge-primary" style="font-size: 0.82rem; padding: 6px 12px;">
        👤 ${role}
      </span>
    `).join("");
  }

  const alignmentBox = document.getElementById("project-student-alignment");
  if (alignmentBox) {
    const roles = proj.requiredRoles || [];
    const students = state.students || [];
    if (!students.length) {
      alignmentBox.innerHTML = `<div style="padding:12px;color:var(--text-muted);">No student profiles are registered yet. Add students to calculate live role alignment.</div>`;
    } else {
      alignmentBox.innerHTML = roles.map(role => {
        const ranked = students.map(student => ({student, fit: calculateStudentRoleFit(student, role, proj)}))
          .sort((a,b) => (b.fit?.compositeScore ?? b.fit?.compositeScore ?? b.fit?.overallMatch ?? b.fit?.score ?? 0) - (a.fit?.compositeScore ?? a.fit?.compositeScore ?? a.fit?.overallMatch ?? a.fit?.score ?? 0));
        const top = ranked[0];
        const score = Math.round(top?.fit?.compositeScore ?? top?.fit?.compositeScore ?? top?.fit?.overallMatch ?? top?.fit?.score ?? 0);
        return `<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:9px 11px;background:var(--bg-surface);border:1px solid var(--border-color);border-radius:8px;">
          <div><strong>${escapeHtml(role)}</strong><div style="font-size:.76rem;color:var(--text-muted);">Best current student-role fit</div></div>
          <div style="text-align:right;"><strong style="color:var(--primary);">${escapeHtml(top?.student?.name || "No match")}</strong><div style="font-size:.76rem;color:var(--text-secondary);">${score}% role fit</div></div>
        </div>`;
      }).join("");
    }
  }

  // AI reasoning and live student-to-project matching
  const aiSummary = document.getElementById("project-ai-summary");
  const matchesBox = document.getElementById("project-student-matches");
  if (aiSummary) {
    const topSkills = (proj.requiredSkills || []).slice(0, 5).map(r => r.skill).join(", ");
    const domains = (proj.dynamicDomains || []).slice(0, 3).join(", ");
    aiSummary.innerHTML = `<strong>System interpretation:</strong> ${escapeHtml(proj.name || "This project")} is primarily understood as <strong>${escapeHtml(domains || proj.type || "Computer Science")}</strong>. The analyzer identified <strong>${(proj.requiredSkills || []).length}</strong> evidence-backed skills and <strong>${(proj.requiredRoles || []).length}</strong> project roles. Highest-priority skills: <strong>${escapeHtml(topSkills || "No skills yet")}</strong>.<br><span style="font-size:.76rem;color:var(--text-muted);">Analysis method: ${escapeHtml(proj.analysisMethod || "deep semantic evidence and domain-context scoring")}; functional capabilities, technologies, deliverables, role responsibilities and student-fit signals are derived from the complete project scope.</span>`;
  }
  const deepGrid = document.getElementById("project-deep-analysis-grid");
  const roleDetailsBox = document.getElementById("project-role-details");
  const complexityBadge = document.getElementById("project-complexity-badge");
  const deepDomain = document.getElementById("project-deep-domain");
  if (deepDomain) {
    const explicitDomain = String(proj.selectedDomain || proj.projectType || proj.type || proj.domain || "").trim();
    const inferredDomain = String(proj.inferredDomain || "").trim();
    const detectedDomains = Array.isArray(proj.dynamicDomains) ? proj.dynamicDomains.filter(Boolean) : [];
    const displayDomain = explicitDomain || inferredDomain || detectedDomains[0] || "Computer Science";
    const secondaryDomains = detectedDomains.filter(d => String(d).toLowerCase() !== displayDomain.toLowerCase()).slice(0, 2);
    deepDomain.innerHTML = `📁 Project Domain: <strong>${escapeHtml(displayDomain)}</strong>${secondaryDomains.length ? ` <span style="font-weight:600;color:var(--text-muted);">• ${escapeHtml(secondaryDomains.join(" • "))}</span>` : ""}`;
  }
  if (deepGrid) {
    // Deep project decomposition without an architecture block.
    // All cards are derived from the analyzer output and have deterministic
    // fallbacks so unusual or short project descriptions never leave blanks.
    const asList = (value, fallback) => {
      if (Array.isArray(value)) {
        return value.filter(Boolean).map(x => typeof x === "object"
          ? (x.label || x.name || x.value || x.skill || "")
          : String(x)).filter(Boolean);
      }
      if (typeof value === "string" && value.trim()) return [value.trim()];
      return fallback;
    };

    const capabilities = asList(proj.functionalCapabilities, []);
    const capabilityItems = capabilities.length
      ? capabilities.map(x => {
          if (typeof x === "object") {
            const evidence = Array.isArray(x.evidence) ? x.evidence.slice(0,3).join(", ") : "";
            return `${x.name || "Functional capability"}${evidence ? ` — detected from: ${evidence}` : ""}`;
          }
          return x;
        })
      : ["Core project workflow and user interaction", "Data processing and validation", "Testing and result validation"];

    const techDetected = asList(proj.detectedTechnologies, []);
    const techRaw = asList(proj.technologies, []);
    const skillNames = (proj.requiredSkills || []).map(x => x.skill).filter(Boolean);
    const stackFallback = [];
    const addStack = (label, evidence) => stackFallback.push(`${label} — ${evidence}`);
    if (techDetected.length) techDetected.forEach(t => stackFallback.push(`${t} — explicitly detected in project scope`));
    if (skillNames.includes("Python")) addStack("Python", "strongly indicated by the project requirements");
    if (skillNames.includes("AI/ML")) addStack("ML framework/model tooling", "AI/ML requirement detected");
    if (skillNames.includes("Database")) addStack("SQL / NoSQL persistence", "data storage requirement detected");
    if (skillNames.includes("Backend")) addStack("REST/API backend", "backend service requirement detected");
    if (skillNames.includes("Web Development")) addStack("HTML/CSS/JavaScript web layer", "web application signals detected");
    if (skillNames.includes("Cloud/DevOps")) addStack("Cloud/container deployment", "deployment or infrastructure signals detected");
    if (skillNames.includes("IoT") || skillNames.includes("Embedded Systems")) addStack("Device/sensor communication stack", "IoT or embedded signals detected");
    if (skillNames.includes("Cybersecurity")) addStack("Authentication/security controls", "security signals detected");
    const tech = techRaw.length
      ? techRaw.map(x => typeof x === "object" ? `${x.label || x.name || "Technology"}${x.evidence?.length ? ` — evidence: ${x.evidence.join(", ")}` : ""}` : x)
      : (stackFallback.length ? stackFallback : ["Project-specific programming and implementation tools", "Testing and version-control tooling", "Execution/deployment environment"]);

    const deliverables = asList(proj.deliverables, [
      "Working project implementation / functional prototype",
      "Required data, models, modules or system components",
      "Testing and validation results",
      "Technical documentation and project demonstration"
    ]);

    const priority = (proj.requiredSkills || []).length
      ? (proj.requiredSkills || []).slice(0,10).map(x => `${x.skill} — ${x.importance || "Core"} (${x.targetPercent || 70}%)${x.evidence?.length ? ` • evidence: ${x.evidence.slice(0,2).join(", ")}` : ""}`)
      : ["Core domain skills — High priority (75%)", "Programming / implementation — High priority (70%)", "Testing and validation — Medium priority (65%)"];

    const box = (title, items) => `<div style="padding:13px;border:1px solid var(--border-color);border-radius:10px;background:var(--bg-subtle);min-height:132px;display:flex;flex-direction:column;"><div style="font-size:.76rem;font-weight:800;text-transform:uppercase;color:var(--text-secondary);margin-bottom:7px;">${title}</div><ul style="margin:0;padding-left:18px;font-size:.78rem;line-height:1.55;color:var(--text-secondary);flex:1;">${items.map(x=>`<li>${escapeHtml(x)}</li>`).join("")}</ul></div>`;
    deepGrid.innerHTML =
      box("⚙️ Functional Capabilities", capabilityItems) +
      box("🛠️ Technology & Implementation Signals", tech) +
      box("📦 Expected Deliverables", deliverables) +
      box("🎯 Skill Priorities", priority);
  }
  if (roleDetailsBox) {
    // Never leave role cards blank. Generate responsibilities and core skills
    // from role blueprints + the project's actual detected requirements.
    const reqs = proj.requiredSkills || [];
    const reqNames = reqs.map(x => x.skill).filter(Boolean);
    const roles = (proj.detailedRoles && proj.detailedRoles.length ? proj.detailedRoles : (proj.requiredRoles || []).map(role => ({role})));
    const roleSkillMap = {
      "AI/ML Developer":["AI/ML","Python","Data Analysis"], "Computer Vision Engineer":["Computer Vision","AI/ML","Python"],
      "NLP Engineer":["NLP","AI/ML","Python"], "Data Analyst":["Data Analysis","Python","Database"],
      "Database Engineer":["Database","Backend","Python"], "Backend Engineer":["Backend","Database","Cloud/DevOps"],
      "Frontend Developer":["Web Development","UI/UX"], "UI/UX Designer":["UI/UX","Web Development","Research"],
      "Cloud/DevOps Engineer":["Cloud/DevOps","Backend","Cybersecurity"], "Security Engineer":["Cybersecurity","Backend","Cloud/DevOps"],
      "Optimization Specialist":["Optimization Algorithms","Python","Data Analysis"], "Research & Validation Lead":["Research","Data Analysis","Python"],
      "IoT/Embedded Engineer":["IoT","Python","Cloud/DevOps"], "Mobile App Developer":["Mobile Development","Web Development","Backend"]
    };
    const responsibilityMap = {
      "AI/ML Developer":"Design, train, evaluate and integrate intelligent models; prepare data and monitor model performance.",
      "Computer Vision Engineer":"Build image/video processing pipelines, train or integrate vision models, and validate detection or classification results.",
      "NLP Engineer":"Prepare text data, build language-processing components, evaluate outputs, and integrate NLP features into the application.",
      "Data Analyst":"Clean and analyze project data, define useful metrics, create visual insights, and validate findings.",
      "Database Engineer":"Design schemas, queries and persistence flows; maintain data integrity, performance and reliable access.",
      "Backend Engineer":"Implement APIs and business logic, connect services and databases, and handle validation, security and reliability.",
      "Frontend Developer":"Build responsive interfaces, connect UI flows to application services, and present project outputs clearly.",
      "UI/UX Designer":"Plan user journeys, information hierarchy and interactions; improve usability, accessibility and visual consistency.",
      "Cloud/DevOps Engineer":"Configure environments, deployment, monitoring and operational workflows so the system can run reliably.",
      "Security Engineer":"Apply authentication, authorization, secure data handling and security validation across the system.",
      "Optimization Specialist":"Model the decision problem, select an optimization strategy, evaluate constraints and produce efficient assignments or routes.",
      "Research & Validation Lead":"Define evaluation methodology, review evidence, benchmark results and document limitations and conclusions.",
      "IoT/Embedded Engineer":"Integrate sensors or edge devices, communication protocols and telemetry while validating hardware-software behavior.",
      "Mobile App Developer":"Implement mobile workflows, integrate APIs/data services, and test the application across expected device conditions."
    };
    roleDetailsBox.innerHTML = roles.map((r,i) => {
      const role = r.role || `Project Role ${i+1}`;
      const blueprint = roleSkillMap[role] || [];
      const core = (r.coreSkills && r.coreSkills.length ? r.coreSkills : blueprint).filter(Boolean);
      const relevant = core.filter(x => reqNames.includes(x));
      const finalSkills = [...new Set([...(relevant.length ? relevant : core), ...reqs.filter(x => (x.defaultRole || "") === role).map(x => x.skill)])];
      const score = Number.isFinite(Number(r.score)) ? Math.round(Number(r.score)) : Math.min(98, 62 + finalSkills.length * 7);
      const responsibilities = r.responsibilities || responsibilityMap[role] || `Own the ${role.toLowerCase()} responsibilities required to implement, integrate, test and validate the project.`;
      return `<div style="display:grid;grid-template-columns:minmax(150px,.8fr) 1.6fr;gap:10px;padding:10px 0;border-bottom:1px solid var(--border-color);font-size:.78rem;"><div><strong>${escapeHtml(role)}</strong><div style="font-size:.7rem;color:var(--text-muted);margin-top:3px;">Role fit score: ${score}%</div></div><div><div style="color:var(--text-secondary);"><strong>Core skills:</strong> ${escapeHtml(finalSkills.length ? finalSkills.join(", ") : "Domain knowledge, implementation, testing")}</div><div style="color:var(--text-muted);margin-top:4px;"><strong>Responsibilities:</strong> ${escapeHtml(responsibilities)}</div></div></div>`;
    }).join("") || `<div style="padding:10px;color:var(--text-secondary);font-size:.78rem;"><strong>Project delivery roles:</strong> The analyzer will assign roles from the detected requirements. Core responsibilities include implementation, data handling, testing, integration and validation.</div>`;
  }

  if (matchesBox) {
    const students = state.students || [];
    const reqs = proj.requiredSkills || [];
    if (!students.length || !reqs.length) {
      matchesBox.innerHTML = `<div style="font-size:.82rem;color:var(--text-muted);padding:8px 0;">No student records are available for live matching yet.</div>`;
    } else {
      const normSkill = s => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
      const getSkill = (student, required) => {
        const target=normSkill(required); const skills=student.skills || {};
        for (const [k,v] of Object.entries(skills)) { const nk=normSkill(k); if(nk===target || nk.includes(target) || target.includes(nk)) return Number(v)||0; }
        return 0;
      };
      // "Best Student Matches" must consider ONLY students who are currently
      // available in the unassigned pool. Assigned students must never appear here.
      const availableStudentsForMatching = students.filter(student => {
        const status = String(
          student.assignmentStatus ?? student.assignment_status ?? "Available"
        ).trim().toLowerCase();
        const hasProjectAssignment = !!student.assignedProjectId;
        const hasTeamAssignment = !!student.assignedTeamId;
        return status === "available" && !hasProjectAssignment && !hasTeamAssignment;
      });

      const scored = availableStudentsForMatching.map(student => {
        const parts=reqs.map(r=>({skill:r.skill, target:(r.targetPercent||70)/10, value:getSkill(student,r.skill)}));
        const coverage=parts.length ? parts.reduce((s,p)=>s+Math.min(100,(p.value/Math.max(1,p.target))*100),0)/parts.length : 0;
        const pref=(student.preferredRole||"").toLowerCase();
        const roleFit=(proj.requiredRoles||[]).some(r=>pref && (r.toLowerCase().includes(pref)||pref.includes(r.toLowerCase()))) ? 100 : 60;
        const score=Math.round(coverage*.8+roleFit*.2);
        return {student,score,parts};
      }).sort((a,b)=>b.score-a.score).slice(0,8);
      matchesBox.innerHTML = `<div style="font-size:.8rem;font-weight:800;text-transform:uppercase;color:var(--text-secondary);margin-bottom:8px;">👥 Best Student Matches from Database</div>` + scored.map((x,i)=>{
        const strong=x.parts.filter(p=>p.value>=p.target).length;
        return `<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:9px 10px;margin:5px 0;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-surface);"><div><strong>${i+1}. ${escapeHtml(x.student.name || "Student")}</strong><div style="font-size:.73rem;color:var(--text-muted);">${escapeHtml(x.student.preferredRole || "Role preference not set")} · ${strong}/${x.parts.length} required skills at target</div></div><strong style="color:var(--primary);">${x.score}% match</strong></div>`;
      }).join("");
    }
  }

  if (skillsTbody) {
    const skills = proj.requiredSkills || [];
    skillsTbody.innerHTML = skills.map((req, idx) => {
      const targetPct = req.targetPercent || 70;
      const targetScore = req.targetProficiency || Math.round(targetPct / 10);
      const category = req.category || "Core";
      const justification = req.justification || req.reason || "Essential for project delivery & system architecture.";

      return `
      <tr>
        <td style="font-weight: 700; color: var(--text-primary); white-space: nowrap;">${req.skill}</td>
        <td>
          <span class="badge badge-neutral" style="font-size: 0.74rem;">${category}</span>
        </td>
        <td>
          <select class="form-control req-importance-select" data-skill-idx="${idx}" style="padding: 4px 8px; font-size: 0.82rem; width: auto;">
            <option value="Very High" ${req.importance === 'Very High' ? 'selected' : ''}>Very High</option>
            <option value="High" ${req.importance === 'High' ? 'selected' : ''}>High</option>
            <option value="Medium" ${req.importance === 'Medium' ? 'selected' : ''}>Medium</option>
            <option value="Low" ${req.importance === 'Low' ? 'selected' : ''}>Low</option>
          </select>
        </td>
        <td>
          <div style="display: flex; align-items: center; gap: 8px;">
            <input type="range" min="30" max="100" value="${targetPct}" class="req-target-slider" data-skill-idx="${idx}" style="width: 85px;">
            <span style="font-weight: 700; font-size: 0.82rem; color: var(--primary); white-space: nowrap;" id="target-val-${idx}">
              ${targetScore}/10 (${targetPct}%)
            </span>
          </div>
        </td>
        <td style="font-size: 0.8rem; color: var(--text-secondary); max-width: 240px; line-height: 1.4;">
          ${justification}
        </td>
        <td>
          <button class="btn btn-secondary btn-sm btn-delete-req-skill" data-skill-idx="${idx}" title="Delete Requirement" style="color: var(--danger); padding: 4px 8px;">
            🗑️
          </button>
        </td>
      </tr>
    `;
    }).join("");

    // Importance select
    skillsTbody.querySelectorAll(".req-importance-select").forEach(sel => {
      sel.addEventListener("change", (e) => {
        const idx = parseInt(e.target.getAttribute("data-skill-idx"), 10);
        state.activeProject.requiredSkills[idx].importance = e.target.value;
        state.save();
        renderDeepProjectAnalysis(state.activeProject);
        api.saveProject(state.activeProject).catch(err => console.warn("Requirement save warning:", err));
      });
    });

    // Target slider
    skillsTbody.querySelectorAll(".req-target-slider").forEach(sld => {
      sld.addEventListener("input", (e) => {
        const idx = parseInt(e.target.getAttribute("data-skill-idx"), 10);
        const val = parseInt(e.target.value, 10);
        const score = Math.round(val / 10);
        state.activeProject.requiredSkills[idx].targetPercent = val;
        state.activeProject.requiredSkills[idx].targetProficiency = score;
        const valSpan = document.getElementById(`target-val-${idx}`);
        if (valSpan) valSpan.textContent = `${score}/10 (${val}%)`;
        state.save();
        renderDeepProjectAnalysis(state.activeProject);
        api.saveProject(state.activeProject).catch(err => console.warn("Requirement save warning:", err));
      });
    });

    // Delete requirement
    skillsTbody.querySelectorAll(".btn-delete-req-skill").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const idx = parseInt(e.currentTarget.getAttribute("data-skill-idx"), 10);
        state.activeProject.requiredSkills.splice(idx, 1);
        state.save();
        renderExtractedSkillsAndRoles();
        api.saveProject(state.activeProject).catch(err => console.warn("Requirement delete save warning:", err));
        showToast("Requirement removed", "info");
      });
    });
  }
}

// Add Skill Modal Events
function initAddSkillModal() {
  const modal = document.getElementById("modal-add-skill");
  const openBtn = document.getElementById("btn-add-custom-skill-req");
  const closeBtn = document.getElementById("close-add-skill-modal");
  const cancelBtn = document.getElementById("btn-cancel-add-skill");
  const submitBtn = document.getElementById("btn-modal-submit-skill");
  const searchInput = document.getElementById("skill-search-input");
  const chipsContainer = document.getElementById("skill-library-chips");
  const skillNameInput = document.getElementById("skill-modal-name");
  const importanceSelect = document.getElementById("skill-modal-importance");
  const targetSlider = document.getElementById("skill-modal-target");
  const targetValDisplay = document.getElementById("skill-modal-target-val");

  const openModal = () => {
    if (!state.activeProject) {
      showToast("Please create or select a project first.", "warning");
      return;
    }
    modal.classList.add("active");
    if (skillNameInput) skillNameInput.value = "";
    if (searchInput) searchInput.value = "";
    renderSkillChips("");
  };

  const closeModal = () => modal.classList.remove("active");

  if (openBtn) openBtn.addEventListener("click", openModal);
  if (closeBtn) closeBtn.addEventListener("click", closeModal);
  if (cancelBtn) cancelBtn.addEventListener("click", closeModal);

  if (targetSlider && targetValDisplay) {
    targetSlider.addEventListener("input", (e) => {
      targetValDisplay.textContent = `${e.target.value}%`;
    });
  }

  const renderSkillChips = (filter = "") => {
    if (!chipsContainer) return;
    const existingSkills = (state.activeProject?.requiredSkills || []).map(r => r.skill.toLowerCase());
    const query = filter.toLowerCase().trim();

    const filtered = MASTER_SKILL_LIBRARY.filter(item => {
      return !query || item.skill.toLowerCase().includes(query) || item.domain.toLowerCase().includes(query);
    });

    chipsContainer.innerHTML = filtered.map(item => {
      const alreadyAdded = existingSkills.includes(item.skill.toLowerCase());
      return `
        <div class="skill-chip ${alreadyAdded ? 'selected' : ''}" data-skill-name="${item.skill}" title="${item.domain}">
          ${item.skill} ${alreadyAdded ? '✓' : ''}
        </div>
      `;
    }).join("");

    chipsContainer.querySelectorAll(".skill-chip").forEach(chip => {
      chip.addEventListener("click", () => {
        const sName = chip.getAttribute("data-skill-name");
        if (skillNameInput) skillNameInput.value = sName;
        chipsContainer.querySelectorAll(".skill-chip").forEach(c => c.classList.remove("selected"));
        chip.classList.add("selected");
      });
    });
  };

  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      renderSkillChips(e.target.value);
    });
  }

  if (submitBtn) {
    submitBtn.addEventListener("click", () => {
      const skillName = skillNameInput ? skillNameInput.value.trim() : "";
      if (!skillName) {
        showToast("Please enter or select a skill name.", "warning");
        return;
      }

      if (!state.activeProject) {
        showToast("No active project selected.", "warning");
        return;
      }

      // Check for duplicate skill (Case Insensitive)
      const isDuplicate = (state.activeProject.requiredSkills || []).some(
        r => r.skill.toLowerCase() === skillName.toLowerCase()
      );

      if (isDuplicate) {
        showToast(`"${skillName}" is already listed in project requirements!`, "error");
        return;
      }

      const importance = importanceSelect ? importanceSelect.value : "High";
      const target = targetSlider ? parseInt(targetSlider.value, 10) : 75;

      if (!state.activeProject.requiredSkills) state.activeProject.requiredSkills = [];
      state.activeProject.requiredSkills.push({
        skill: skillName,
        importance,
        targetPercent: target
      });

      state.save();
      renderExtractedSkillsAndRoles();
      api.saveProject(state.activeProject).catch(err => console.warn("Custom skill save warning:", err));
      closeModal();
      showToast(`Skill requirement "${skillName}" added successfully!`, "success");
    });
  }
  renderDeepProjectAnalysis(state.activeProject);
}

function initProjectAnalysisEvents() {
  const triggerBtn = document.getElementById("btn-trigger-analyze");
  if (triggerBtn) {
    triggerBtn.addEventListener("click", async () => {
      const name = document.getElementById("proj-input-name").value.trim();
      const type = document.getElementById("proj-input-type").value.trim();
      const teamSize = parseInt(document.getElementById("proj-input-teamsize").value, 10) || 5;
      const numTeams = parseInt(document.getElementById("proj-input-numteams").value, 10) || 4;
      const description = document.getElementById("proj-input-desc").value.trim();
      const objectives = "";
      const technologies = "";
      const requirements = "";

      if (!name || !description) {
        showToast("Please provide both a Project Name and Description.", "warning");
        return;
      }

      const analyzed = analyzeProjectRequirements({
        name,
        description,
        type,
        teamSize,
        numTeams,
        objectives,
        technologies,
        requirements
      });

      let currentProj = state.activeProject;
      if (!currentProj) {
        currentProj = {
          id: `proj-${Date.now()}`,
          name,
          type: analyzed.inferredDomain || type || "Computer Science",
          teamSize,
          numTeams,
          description,
          objectives,
          technologies,
          requirements,
          requiredSkills: analyzed.requiredSkills,
          requiredRoles: analyzed.requiredRoles
        };
        state.projects.push(currentProj);
        state.activeProject = currentProj;
      } else {
        currentProj.name = name;
        currentProj.type = type || analyzed.selectedDomain || analyzed.inferredDomain || "Computer Science";
      currentProj.selectedDomain = analyzed.selectedDomain || type || analyzed.inferredDomain || "Computer Science";
      currentProj.inferredDomain = analyzed.inferredDomain || currentProj.inferredDomain;
        currentProj.teamSize = teamSize;
        currentProj.numTeams = numTeams;
        currentProj.description = description;
        currentProj.objectives = objectives;
        currentProj.technologies = technologies;
        currentProj.requirements = requirements;
        currentProj.requiredSkills = analyzed.requiredSkills;
        currentProj.requiredRoles = analyzed.requiredRoles;
      }

      await api.saveProject(currentProj);
      state.save();
      renderProjectAnalysisView();
      showToast("AI project analysis complete: skills, roles, and student matches calculated from the project description and database.", "success");
    });
  }

  const removeProjectBtn = document.getElementById("btn-remove-current-project");
  if (removeProjectBtn) {
    removeProjectBtn.addEventListener("click", async () => {
      const project = state.activeProject;
      if (!project) {
        showToast("Select a project to remove.", "warning");
        return;
      }

      const assigned = (state.students || []).filter(s => String(s.assignedProjectId || "") === String(project.id));
      const assignedCount = assigned.length;
      const confirmed = window.confirm(
        `Remove "${project.name || "Untitled Project"}" from your account?\n\n` +
        `This will permanently remove the project and free ${assignedCount} assigned student${assignedCount === 1 ? "" : "s"} for future projects.`
      );
      if (!confirmed) return;

      removeProjectBtn.disabled = true;
      try {
        if (state.isLoggedIn) {
          // The backend is the source of truth. It atomically removes the
          // project, teams/team-members, reports and releases assigned students.
          // Use its returned workspace instead of posting a second snapshot,
          // which could accidentally recreate stale project/team state.
          const result = await api.deleteProject(project.id);
          const workspace = result && result.workspace;
          if (!workspace) throw new Error("Server did not return the updated workspace.");

          // Re-read once from SQLite after the delete. This makes the backend
          // the final source of truth and prevents a stale browser snapshot
          // from causing a second project to disappear/reappear.
          const authoritative = await api.getWorkspace();
          const freshWorkspace = authoritative?.workspace || workspace;
          state.projects = Array.isArray(freshWorkspace.projects) ? freshWorkspace.projects : [];
          state.students = Array.isArray(freshWorkspace.students) ? freshWorkspace.students : [];
          state.teamsByProject = freshWorkspace.teamsByProject || {};
          state.teams = freshWorkspace.teams || [];
          state.activeProject = state.projects.find(p => String(p.id) === String(freshWorkspace.activeProjectId)) || state.projects[0] || null;
          state.lastResultMeta = null;
          state.weights = workspace.weights || state.weights;
          // IMPORTANT: do not call state.save() here. state.save() also POSTs the
          // current workspace to SQLite and would recreate the project we just
          // deleted. Persist only the already-deleted state to browser storage.
          state.saveLocalOnly();
        } else {
          // Demo/offline workspace: perform the same release locally.
          (state.students || []).forEach(student => {
            if (String(student.assignedProjectId || "") === String(project.id)) {
              student.assignmentStatus = "Available";
              student.assignedProjectId = null;
              student.assignedTeamId = null;
              student.assignedRole = null;
            }
          });
          state.projects = (state.projects || []).filter(p => String(p.id) !== String(project.id));
          if (state.teamsByProject) delete state.teamsByProject[project.id];
          state.activeProject = state.projects[0] || null;
          state.teams = state.activeProject && state.teamsByProject
            ? (state.teamsByProject[state.activeProject.id] || [])
            : [];
          state.lastResultMeta = null;
          state.save();
        }

        renderProjectAnalysisView();
        renderMainDashboard();
        showToast(`Project removed successfully. ${assignedCount} student${assignedCount === 1 ? " is" : "s are"} now available for the next project.`, "success");
      } catch (err) {
        console.error("Project removal failed:", err);
        showToast(`Could not remove project: ${err.message || "Unknown error"}`, "error");
      } finally {
        removeProjectBtn.disabled = !state.activeProject;
      }
    });
  }

  const presetSelector = document.getElementById("project-preset-selector");
  if (presetSelector) {
    presetSelector.addEventListener("change", (e) => {
      const selectedId = e.target.value;
      const found = state.projects.find(p => p.id === selectedId);
      if (found) {
        state.activeProject = found;
        state.teams = (state.teamsByProject && state.teamsByProject[found.id]) || null;
        state.lastResultMeta = state.teams ? state.lastResultMeta : null;
        state.save();
        populateProjectForm(found);
        renderExtractedSkillsAndRoles();
        showToast(`Loaded: ${found.name}`, "info");
      }
    });
  }

  const projectToOptimizer = document.getElementById("btn-project-to-optimizer");
  if (projectToOptimizer) projectToOptimizer.addEventListener("click", () => {
    if (!state.activeProject) { showToast("Analyze a project first.", "warning"); return; }
    switchView("optimizer");
  });

  const resetBtn = document.getElementById("btn-reset-proj-form");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      if (state.activeProject) populateProjectForm(state.activeProject);
      showToast("Form reset to current project state.", "info");
    });
  }

  const saveAndAuditBtn = document.getElementById("btn-save-project-and-audit");
  if (saveAndAuditBtn) {
    saveAndAuditBtn.addEventListener("click", async () => {
      if (state.activeProject) {
        await api.saveProject(state.activeProject);
      }
      state.save();
      showToast("Project requirements saved successfully. The project analysis is ready for Team Optimization.", "success");
      switchView("optimizer");
    });
  }

  initAddSkillModal();

  // Auto-save on typing in project form
  const pName = document.getElementById("proj-input-name");
  const pType = document.getElementById("proj-input-type");
  const pSize = document.getElementById("proj-input-teamsize");
  const pNum = document.getElementById("proj-input-numteams");
  const pDesc = document.getElementById("proj-input-desc");
  const pSaveInd = document.getElementById("proj-save-indicator");

  const debouncedAutoSaveProj = debounce(() => {
    if (state.activeProject) {
      if (pName) {
        state.activeProject.name = pName.value;
        const presetSelector = document.getElementById("project-preset-selector");
        if (presetSelector) {
          const opt = presetSelector.querySelector(`option[value="${state.activeProject.id}"]`);
          if (opt) opt.textContent = pName.value.trim() || "(Untitled Blank Project)";
        }
      }
      if (pType) state.activeProject.type = pType.value;
      if (pSize) state.activeProject.teamSize = parseInt(pSize.value, 10) || 5;
      if (pNum) state.activeProject.numTeams = parseInt(pNum.value, 10) || 4;
      if (pDesc) state.activeProject.description = pDesc.value;
      state.save();
      if (pSaveInd) {
        pSaveInd.textContent = "🟢 Auto-saved";
        pSaveInd.style.opacity = "1";
      }
    }
  }, 350);

  [pName, pType, pSize, pNum, pDesc].forEach(inp => {
    if (inp) {
      inp.addEventListener("input", () => {
        if (pSaveInd) {
          pSaveInd.textContent = "⏳ Saving...";
          pSaveInd.style.opacity = "0.7";
        }
        debouncedAutoSaveProj();
      });
    }
  });

  // Create new blank project
  const createBlankBtn = document.getElementById("btn-create-blank-proj");
  if (createBlankBtn) {
    createBlankBtn.addEventListener("click", () => {
      const newProj = {
        id: `proj-${Date.now()}`,
        name: "",
        type: "",
        teamSize: 5,
        numTeams: 4,
        description: "",
        objectives: "",
        technologies: "",
        requirements: "",
        requiredSkills: [],
        requiredRoles: []
      };
      state.projects.push(newProj);
      state.activeProject = newProj;
      state.save();
      renderProjectAnalysisView();

      const inpName = document.getElementById("proj-input-name");
      if (inpName) inpName.focus();

      showToast("Created new blank project! Form is empty and ready for your input.", "success");
    });
  }
}

// ==========================================
// 12. DASHBOARD 3: 👨‍🎓 STUDENT COHORT
// ==========================================

let studentSearchQuery = "";
let studentExpFilter = "all";
let studentRoleFilter = "all";
let studentStatusFilter = "all";

function readManualStudentSkills() {
  const skills = {};
  document.querySelectorAll('#student-manual-skills-container .student-skill-row').forEach(row => {
    const name = row.querySelector('.student-manual-skill-name')?.value.trim();
    const level = parseInt(row.querySelector('.student-manual-skill-level')?.value || '0', 10);
    if (name && level >= 1 && level <= 10) skills[name] = level;
  });
  return skills;
}

function renderManualStudentSkillRows(skills = {}) {
  const container = document.getElementById('student-manual-skills-container');
  const empty = document.getElementById('student-manual-skills-empty');
  if (!container) return;
  container.innerHTML = '';
  const entries = Object.entries(skills || {});
  (entries.length ? entries : [['', 7]]).forEach(([name, level]) => addManualStudentSkillRow(name, level));
  if (empty) empty.style.display = entries.length ? 'none' : 'none';
}

function addManualStudentSkillRow(name = '', level = 7) {
  const container = document.getElementById('student-manual-skills-container');
  const empty = document.getElementById('student-manual-skills-empty');
  if (!container) return;
  const row = document.createElement('div');
  row.className = 'student-skill-row';
  row.style.cssText = 'display:grid; grid-template-columns:1fr 150px 42px; gap:8px; align-items:center;';
  row.innerHTML = `
    <input class="form-control student-manual-skill-name" type="text" placeholder="e.g. Python" value="${String(name).replace(/&/g,'&amp;').replace(/"/g,'&quot;')}" />
    <select class="form-control student-manual-skill-level">
      ${Array.from({length:10}, (_,i) => i+1).map(v => `<option value="${v}" ${v === Number(level) ? 'selected' : ''}>${v}/10</option>`).join('')}
    </select>
    <button class="btn btn-secondary btn-sm student-remove-skill-row" type="button" title="Remove skill">×</button>
  `;
  row.querySelector('.student-remove-skill-row').addEventListener('click', () => {
    row.remove();
    if (empty) empty.style.display = container.children.length ? 'none' : 'block';
  });
  container.appendChild(row);
  if (empty) empty.style.display = 'none';
}

async function refreshAdminCohortStudents() {
  if (!state.isLoggedIn || state.currentAdmin?.role !== "admin" || typeof api.getAdminCohortStudents !== "function") return;
  try {
    const res = await api.getAdminCohortStudents();
    if (!res || !Array.isArray(res.students)) return;

    // The cohort endpoint is authoritative for registered students. Do not
    // merge stale localStorage rows into it; doing so was the reason a valid
    // registration could still appear as 0 after an admin login.
    state.students = res.students;
    if (state.currentAdmin && res.cohortCode) {
      state.currentAdmin.cohortCode = res.cohortCode;
      const accounts = state.getRegisteredAccounts();
      const updated = accounts.map(a => a.id === state.currentAdmin.id
        ? { ...a, cohortCode: res.cohortCode }
        : a);
      state.saveRegisteredAccounts(updated);
    }
    state.persistAccountData(state.currentAdmin.id);
    // Use the authoritative backend count as the live source for every
    // student-count display. This prevents stale localStorage values (such as 0)
    // from appearing on the dashboard/sidebar after a student registers.
    const authoritativeCount = Number(res.count ?? res.students.length);
    const assigned = state.students.filter(s => s.assignedTeamId || s.assignedProjectId).length;
    const available = Math.max(0, authoritativeCount - assigned);

    const kpiTotal = document.getElementById("kpi-students-total");
    const kpiAvail = document.getElementById("kpi-students-available");
    const mainKpi = document.getElementById("kpi-total-students");

    if (kpiTotal) kpiTotal.textContent = authoritativeCount;
    if (kpiAvail) kpiAvail.textContent = available;
    if (mainKpi) mainKpi.textContent = authoritativeCount;

    renderStudentsCohortView();
    // Refresh the main dashboard/sidebar immediately when the authoritative
    // cohort count changes, without altering any other dashboard content.
    if (state.currentView === "main") renderMainDashboard();
  } catch (err) {
    console.warn("Authoritative student cohort refresh failed:", err);
    // Keep the current in-memory/local snapshot if the backend is temporarily unavailable.
  }
}

function renderStudentsCohortView() {
  const countEl = document.getElementById("students-table-count");
  if (countEl) countEl.textContent = state.students.length;

  // Update KPI Metric Cards (Total, Available, Assigned)
  const total = state.students.length;
  const assigned = state.students.filter(s => s.assignedTeamId || s.assignedProjectId).length;
  const available = total - assigned;

  const kpiTotal = document.getElementById("kpi-students-total");
  if (kpiTotal) kpiTotal.textContent = total;

  const kpiAvail = document.getElementById("kpi-students-available");
  if (kpiAvail) kpiAvail.textContent = available;

  const kpiAssign = document.getElementById("kpi-students-assigned");
  if (kpiAssign) kpiAssign.textContent = assigned;

  // Dynamically populate Role Filter
  const roleFilterSel = document.getElementById("filter-role");
  if (roleFilterSel) {
    const rolesSet = new Set();
    if (state.activeProject && state.activeProject.requiredRoles) {
      state.activeProject.requiredRoles.forEach(r => rolesSet.add(r));
    }
    state.students.forEach(s => {
      if (s.preferredRole) rolesSet.add(s.preferredRole);
    });

    const currentVal = roleFilterSel.value;
    roleFilterSel.innerHTML = `<option value="all">All Preferred Roles</option>` +
      Array.from(rolesSet).sort().map(r => `
        <option value="${r}" ${r === currentVal ? 'selected' : ''}>${r}</option>
      `).join("");
  }

  filterAndRenderStudentsTable();
}

function filterAndRenderStudentsTable() {
  const tbody = document.getElementById("students-table-tbody");
  if (!tbody) return;

  if (state.students.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; padding: 40px 20px;">
          <div class="empty-state-icon" style="font-size: 2.2rem; margin-bottom: 8px;">👨‍🎓</div>
          <div style="font-weight: 700; font-size: 1rem; color: var(--text-primary); margin-bottom: 6px;">
            No Students Registered in Group
          </div>
          <p style="font-size: 0.82rem; color: var(--text-secondary); max-width: 360px; margin: 0 auto 16px auto;">
            Register students with individual skill proficiencies or load sample engineering students.
          </p>
          <div style="display: flex; justify-content: center; gap: 10px;">
            <button class="btn btn-secondary btn-sm" id="btn-cohort-load-sample">
              <span>🔄</span> Load Sample Students
            </button>
            <button class="btn btn-primary btn-sm" id="btn-cohort-add-first">
              <span>➕</span> Add New Student
            </button>
          </div>
        </td>
      </tr>
    `;

    const btnLoad = document.getElementById("btn-cohort-load-sample");
    if (btnLoad) btnLoad.addEventListener("click", loadDefaultCohort);

    const btnAdd = document.getElementById("btn-cohort-add-first");
    if (btnAdd) btnAdd.addEventListener("click", () => openStudentModal(null));
    return;
  }

  const filtered = state.students.filter(s => {
    const q = studentSearchQuery.toLowerCase();
    const matchesQuery = !q ||
      s.name.toLowerCase().includes(q) ||
      s.rollNo.toLowerCase().includes(q) ||
      (s.interests && s.interests.some(i => i.toLowerCase().includes(q))) ||
      (s.preferredRole && s.preferredRole.toLowerCase().includes(q));

    const matchesExp = studentExpFilter === "all" || s.experience === studentExpFilter;
    const matchesRole = studentRoleFilter === "all" || s.preferredRole === studentRoleFilter;

    const isAssigned = !!(s.assignedTeamId || s.assignedProjectId);
    const matchesStatus = studentStatusFilter === "all" ||
      (studentStatusFilter === "Available" && !isAssigned) ||
      (studentStatusFilter === "Assigned" && isAssigned);

    return matchesQuery && matchesExp && matchesRole && matchesStatus;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; padding: 30px; color: var(--text-muted);">
          No students match the current filter criteria.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map(s => {
    const sortedSkills = Object.entries(s.skills || {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    const getSkillTierName = (r) => r >= 8 ? "Advanced" : (r >= 5 ? "Intermediate" : "Beginner");
    const getSkillTierBadge = (t) => t === "Advanced" ? "badge-success" : (t === "Intermediate" ? "badge-primary" : "badge-neutral");

    const skillsHtml = sortedSkills.map(([name, rating]) => {
      const tier = getSkillTierName(rating);
      return `
        <span style="display: inline-flex; align-items: center; gap: 4px; font-size: 0.73rem; background: var(--bg-subtle); padding: 2px 6px; border-radius: 4px; margin-right: 4px; margin-bottom: 2px; border: 1px solid var(--border-color);">
          <span>${name}</span>
          <strong style="color: var(--text-primary);">${rating}/10</strong>
          <span class="badge ${getSkillTierBadge(tier)}" style="font-size: 0.65rem; padding: 1px 4px;">${tier}</span>
        </span>
      `;
    }).join("");

    const interestsHtml = (s.interests || []).slice(0, 3).map(i => `
      <span style="font-size: 0.72rem; color: var(--text-secondary); background: rgba(59, 130, 246, 0.08); padding: 2px 6px; border-radius: 4px; margin-right: 4px;">
        ${i}
      </span>
    `).join("");

    const expBadgeClass = s.experience === "Advanced" ? "badge-success" :
      s.experience === "Intermediate" ? "badge-primary" : "badge-neutral";

    const isAssigned = !!(s.assignedTeamId || s.assignedProjectId);
    const statusHtml = isAssigned
      ? `<span class="badge badge-status-assigned">🔵 Assigned</span>`
      : `<span class="badge badge-status-available">🟢 Available</span>`;

    return `
      <tr>
        <td style="font-family: var(--font-mono); font-size: 0.82rem; font-weight: 600;">${s.rollNo}</td>
        <td>
          <div style="font-weight: 700; color: var(--text-primary);">${s.name}</div>
          <div style="font-size: 0.75rem; color: var(--text-muted);">CGPA: ${s.cgpa || 8.5}/10</div>
        </td>
        <td>${statusHtml}</td>
        <td><span class="badge ${expBadgeClass}">${s.experience}</span></td>
        <td style="font-weight: 600; color: var(--primary);">${escapeHtml(s.recommendedRole || s.preferredRole || "Full Stack Engineer")}
          <div style="font-size:.67rem;color:var(--text-muted);margin-top:3px;">AI fit: ${Number(s.roleAnalysis?.confidence || 0)}%${s.preferredRole && s.preferredRole !== s.recommendedRole ? ` · Preference: ${escapeHtml(s.preferredRole)}` : ""}</div>
        </td>
        <td>${skillsHtml}</td>
        <td>${interestsHtml}</td>
        <td>
          <div style="display: flex; gap: 6px;">
            ${state.currentAdmin?.role === "admin" && s.userId && !s.is_demo ? `
            <button class="btn btn-secondary btn-sm btn-manage-student-skills" data-student-id="${s.id}" title="Manage Student Skills" style="color: var(--primary);">
              🛠️
            </button>` : ""}
            <button class="btn btn-secondary btn-sm btn-edit-student" data-student-id="${s.id}" title="Edit Profile">
              ✏️
            </button>
            <button class="btn btn-secondary btn-sm btn-delete-student" data-student-id="${s.id}" title="Delete Student" style="color: var(--danger);">
              🗑️
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join("");

  tbody.querySelectorAll(".btn-manage-student-skills").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-student-id");
      openAdminStudentSkillsModal(id);
    });
  });

  tbody.querySelectorAll(".btn-edit-student").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-student-id");
      openStudentModal(id);
    });
  });

  tbody.querySelectorAll(".btn-delete-student").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-student-id");
      const s = state.students.find(x => x.id === id);
      if (confirm(`Are you sure you want to remove ${s ? s.name : 'this student'} from the student group?`)) {
        await api.deleteStudent(id);
        state.students = state.students.filter(x => x.id !== id);
        state.save();
        renderStudentsCohortView();
        showToast("Student profile removed.", "info");
      }
    });
  });
}

function openAdminStudentSkillsModal(studentId) {
  const student = state.students.find(s => s.id === studentId);
  const modal = document.getElementById("modal-admin-student-skills");
  if (!student || !modal) return;

  const nameEl = document.getElementById("admin-skills-student-name");
  const metaEl = document.getElementById("admin-skills-student-meta");
  const skillInput = document.getElementById("admin-student-skill-name");
  const profInput = document.getElementById("admin-student-skill-proficiency");
  const evidenceInput = document.getElementById("admin-student-skill-evidence");
  const listEl = document.getElementById("admin-student-skills-list");
  const countEl = document.getElementById("admin-student-skill-count");
  const optionsEl = document.getElementById("admin-student-skill-options");

  modal.dataset.studentId = studentId;
  if (nameEl) nameEl.textContent = student.name || "Student";
  if (metaEl) metaEl.textContent = `${student.rollNo || "No Roll No."}${student.accountEmail ? " • " + student.accountEmail : ""} • Changes are saved to the student's permanent account.`;

  if (optionsEl) {
    optionsEl.innerHTML = ALL_SKILLS.map(skill => `<option value="${skill}"></option>`).join("");
  }

  const renderSkills = () => {
    const skills = student.skills || {};
    const entries = Object.entries(skills).sort((a, b) => Number(b[1]) - Number(a[1]));
    if (countEl) countEl.textContent = `${entries.length} skill${entries.length === 1 ? "" : "s"}`;
    if (!listEl) return;
    listEl.innerHTML = entries.length ? entries.map(([skill, score]) => `
      <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; padding:9px 11px; border:1px solid var(--border-color); border-radius:8px; background:var(--bg-surface);">
        <span style="font-weight:700;">${skill}</span>
        <div style="display:flex;align-items:center;gap:6px;"><span class="badge badge-primary">${score}/10</span><button type="button" class="btn btn-secondary btn-sm btn-remove-admin-skill" data-skill="${escapeHtml(skill)}" title="Remove this skill" style="color:var(--danger);padding:3px 7px;">🗑️</button></div>
      </div>
    `).join("") : `<div style="text-align:center; padding:18px; color:var(--text-muted);">No skills recorded yet. Add the first skill above.</div>`;
  };

  const bindSkillRemoveButtons = () => {
    listEl?.querySelectorAll(".btn-remove-admin-skill").forEach(btn => {
      btn.onclick = async () => {
        const skillName = btn.dataset.skill || "";
        if (!skillName || !confirm(`Remove ${skillName} from ${student.name}?`)) return;
        try {
          const res = await api.adminDeleteStudentSkill(studentId, skillName);
          student.skills = {};
          (res.skills || []).forEach(row => { student.skills[row.skill || row.skill_name] = Number(row.proficiency); });
          renderSkills(); bindSkillRemoveButtons();
          filterAndRenderStudentsTable();
          showToast(`${skillName} removed from ${student.name}.`, "success");
        } catch (err) { showToast(err.message || "Could not remove student skill.", "error"); }
      };
    });
  };
  renderSkills();
  bindSkillRemoveButtons();
  if (skillInput) skillInput.value = "";
  if (profInput) profInput.value = "7";
  if (evidenceInput) evidenceInput.value = "";
  modal.classList.add("active");

  const saveBtn = document.getElementById("btn-save-admin-student-skill");
  if (saveBtn) {
    saveBtn.onclick = async () => {
      const skill = (skillInput?.value || "").trim();
      const proficiency = Number(profInput?.value || 7);
      const evidence = (evidenceInput?.value || "").trim();

      if (!skill) {
        showToast("Please enter a skill name.", "warning");
        skillInput?.focus();
        return;
      }
      if (!Number.isInteger(proficiency) || proficiency < 1 || proficiency > 10) {
        showToast("Proficiency must be a whole number from 1 to 10.", "warning");
        profInput?.focus();
        return;
      }

      saveBtn.disabled = true;
      try {
        const res = await api.adminSaveStudentSkill(studentId, { skill, proficiency, evidence });
        const skillRows = res.skills || [];
        student.skills = {};
        skillRows.forEach(row => { student.skills[row.skill || row.skill_name] = Number(row.proficiency); });
        state.save();
        renderSkills();
        bindSkillRemoveButtons();
        filterAndRenderStudentsTable();
        showToast(`${skill} saved for ${student.name}. Role analysis has been refreshed.`, "success");
        if (skillInput) skillInput.value = "";
        if (evidenceInput) evidenceInput.value = "";
        if (profInput) profInput.value = "7";
      } catch (err) {
        showToast(err.message || "Could not save student skill.", "error");
      } finally {
        saveBtn.disabled = false;
      }
    };
  }
}

function openStudentModal(studentId = null) {
  const modal = document.getElementById("modal-student");
  const title = document.getElementById("student-modal-title");
  const idInput = document.getElementById("student-form-id");
  const nameInput = document.getElementById("student-input-name");
  const rollInput = document.getElementById("student-input-roll");
  const expInput = document.getElementById("student-input-exp");
  const roleInput = document.getElementById("student-input-role");
  const interestsInput = document.getElementById("student-input-interests");

  // Dynamic roles in student modal
  if (roleInput) {
    const rolesSet = new Set();
    if (state.activeProject && state.activeProject.requiredRoles) {
      state.activeProject.requiredRoles.forEach(r => rolesSet.add(r));
    }
    rolesSet.add("AI Developer");
    rolesSet.add("UI/UX Designer");
    rolesSet.add("Backend Architect");
    rolesSet.add("Database Engineer");
    rolesSet.add("Research Lead");
    rolesSet.add("Frontend Developer");
    rolesSet.add("Cloud/DevOps Engineer");
    rolesSet.add("Full Stack Engineer");

    roleInput.innerHTML = Array.from(rolesSet).sort().map(r => `
      <option value="${r}">${r}</option>
    `).join("");
  }

  let student = null;
  if (studentId) {
    student = state.students.find(s => s.id === studentId);
    title.innerHTML = `<span>✏️</span> Edit Student Profile`;
    idInput.value = student.id;
    nameInput.value = student.name || "";
    rollInput.value = student.rollNo || "";
    expInput.value = student.experience || "Intermediate";
    if (roleInput) roleInput.value = student.preferredRole || "AI Developer";
    interestsInput.value = (student.interests || []).join(", ");
    renderManualStudentSkillRows(student.skills || {});
  } else {
    title.innerHTML = `<span>➕</span> Add New Student Profile`;
    idInput.value = "";
    nameInput.value = "";
    const nextIdx = state.students.length + 1;
    rollInput.value = `CS2026-${String(nextIdx).padStart(3, "0")}`;
    expInput.value = "Intermediate";
    if (roleInput) roleInput.value = "AI Developer";
    interestsInput.value = "";
    renderManualStudentSkillRows({});
  }

  modal.classList.add("active");
}

function initStudentCohortEvents() {
  const copyCohortBtn = document.getElementById("btn-copy-cohort-code");
  if (copyCohortBtn && !copyCohortBtn.dataset.bound) {
    copyCohortBtn.addEventListener("click", async () => {
      const code = state.currentAdmin?.cohortCode || "";
      if (!code) return showToast("No cohort code is available.", "warning");
      try { await navigator.clipboard.writeText(code); showToast("Cohort code copied.", "success"); }
      catch (_) { showToast(`Cohort Code: ${code}`, "info"); }
    });
    copyCohortBtn.dataset.bound = "true";
  }
  const analyzeRolesBtn = document.getElementById("btn-analyze-cohort-roles");
  if (analyzeRolesBtn && !analyzeRolesBtn.dataset.bound) {
    analyzeRolesBtn.addEventListener("click", async () => {
      analyzeRolesBtn.disabled = true;
      analyzeRolesBtn.innerHTML = "<span>⏳</span> Analyzing Roles...";
      try {
        const res = await api.analyzeCohortRoles();
        await refreshAdminCohortStudents();
        showToast(`Deep role analysis completed for ${res.count || state.students.length} students.`, "success");
      } catch (err) { showToast(err.message || "Role analysis failed.", "error"); }
      finally { analyzeRolesBtn.disabled=false; analyzeRolesBtn.innerHTML="<span>🧠</span> Analyze & Assign Roles"; }
    });
    analyzeRolesBtn.dataset.bound="true";
  }

  const searchInput = document.getElementById("student-search-input");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      studentSearchQuery = e.target.value.trim();
      filterAndRenderStudentsTable();
    });
  }

  const expFilter = document.getElementById("filter-experience");
  if (expFilter) {
    expFilter.addEventListener("change", (e) => {
      studentExpFilter = e.target.value;
      filterAndRenderStudentsTable();
    });
  }

  const roleFilter = document.getElementById("filter-role");
  if (roleFilter) {
    roleFilter.addEventListener("change", (e) => {
      studentRoleFilter = e.target.value;
      filterAndRenderStudentsTable();
    });
  }

  const statusFilter = document.getElementById("filter-assignment");
  if (statusFilter) {
    statusFilter.addEventListener("change", (e) => {
      studentStatusFilter = e.target.value;
      filterAndRenderStudentsTable();
    });
  }

  const addBtn = document.getElementById("btn-open-add-student-modal");
  if (addBtn) addBtn.addEventListener("click", () => openStudentModal(null));

  const resetCohortBtn = document.getElementById("btn-reset-students-default");
  if (resetCohortBtn) {
    resetCohortBtn.addEventListener("click", () => {
      if (confirm("Reset student group to the standard 20 engineering profiles? Custom additions will be overwritten.")) {
        loadDefaultCohort();
      }
    });
  }

  const addSkillRowBtn = document.getElementById("btn-add-student-skill-row");
  if (addSkillRowBtn && !addSkillRowBtn.dataset.bound) {
    addSkillRowBtn.addEventListener("click", () => addManualStudentSkillRow("", 7));
    addSkillRowBtn.dataset.bound = "true";
  }

  // Student modal close / save
  const modal = document.getElementById("modal-student");
  const closeBtn = document.getElementById("close-student-modal");
  const cancelBtn = document.getElementById("btn-cancel-student-modal");
  const form = document.getElementById("student-form");

  const adminSkillsModal = document.getElementById("modal-admin-student-skills");
  const closeAdminSkills = () => {
    if (adminSkillsModal) adminSkillsModal.classList.remove("active");
  };
  document.getElementById("close-admin-student-skills-modal")?.addEventListener("click", closeAdminSkills);
  document.getElementById("btn-cancel-admin-student-skills")?.addEventListener("click", closeAdminSkills);
  adminSkillsModal?.addEventListener("click", (e) => {
    if (e.target === adminSkillsModal) closeAdminSkills();
  });

  const closeModal = () => modal.classList.remove("active");
  if (closeBtn) closeBtn.addEventListener("click", closeModal);
  if (cancelBtn) cancelBtn.addEventListener("click", closeModal);

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const id = document.getElementById("student-form-id").value;
      const name = document.getElementById("student-input-name").value.trim();
      const rollNo = document.getElementById("student-input-roll").value.trim();
      const experience = document.getElementById("student-input-exp").value;
      const preferredRole = document.getElementById("student-input-role").value;
      const interestsRaw = document.getElementById("student-input-interests").value.trim();
      const interests = interestsRaw ? interestsRaw.split(",").map(i => i.trim()).filter(Boolean) : [];
      const skills = readManualStudentSkills();
      if (Object.keys(skills).length === 0) {
        showToast("Please add at least one student skill with a proficiency level.", "warning");
        return;
      }

      let studentObj;
      if (id) {
        const existing = state.students.find(s => s.id === id);
        studentObj = {
          ...existing,
          id,
          name,
          rollNo,
          experience,
          preferredRole,
          interests,
          skills
        };
        const idx = state.students.findIndex(s => s.id === id);
        if (idx !== -1) state.students[idx] = studentObj;
        showToast(`Student ${name} updated successfully!`, "success");
      } else {
        studentObj = {
          id: `std-${Date.now()}`,
          name,
          rollNo,
          experience,
          preferredRole,
          interests,
          skills,
          assignedTeamId: null,
          assignedProjectId: null
        };
        state.students.push(studentObj);
        showToast(`Student ${name} registered with manually entered skills!`, "success");
      }

      await api.saveStudent(studentObj);
      state.save();
      renderStudentsCohortView();
      closeModal();
    });
  }
}

// ==========================================
// 13. DASHBOARD 4: 📊 SKILL GAP AUDIT
// ==========================================

function renderSkillGapView() {
  if (!state.activeProject) {
    const banner = document.getElementById("gap-alert-banner");
    if (banner) {
      banner.innerHTML = `
        <div style="text-align: center; padding: 20px;">
          <h4>No Active Project Selected</h4>
          <p style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 6px;">Please create or select an active project in the Project Analysis tab.</p>
        </div>
      `;
    }
    return;
  }

  const { gapData, gapCount, gapNames, fullyCoveredCount, readinessIndex } = computeSkillGaps();

  // Update 4 KPI Cards
  const kpiReq = document.getElementById("gap-kpi-total-req");
  if (kpiReq) kpiReq.textContent = gapData.length;

  const kpiSat = document.getElementById("gap-kpi-satisfied");
  if (kpiSat) kpiSat.textContent = fullyCoveredCount;

  const kpiDef = document.getElementById("gap-kpi-deficit");
  if (kpiDef) kpiDef.textContent = gapCount;

  const kpiReady = document.getElementById("gap-kpi-readiness");
  if (kpiReady) kpiReady.textContent = `${readinessIndex}%`;

  // Summary Alert Banner
  const banner = document.getElementById("gap-alert-banner");
  if (banner) {
    if (gapCount > 0) {
      banner.style.borderLeft = "5px solid #ef4444";
      banner.innerHTML = `
        <div style="display: flex; gap: 14px; align-items: flex-start;">
          <div style="font-size: 1.8rem; line-height: 1;">⚠️</div>
          <div>
            <h4 style="font-size: 1.1rem; font-weight: 800; color: var(--danger); margin-bottom: 4px;">
              ${gapCount} Skill Deficit${gapCount > 1 ? "s" : ""} Detected for "${state.activeProject.name}"
            </h4>
            <p style="font-size: 0.88rem; color: var(--text-secondary); line-height: 1.5;">
              The student group has shortages in: <strong>${gapNames.join(", ")}</strong>.
              Review the domain audit table below to analyze severity and recommended interventions.
            </p>
          </div>
        </div>
      `;
    } else {
      banner.style.borderLeft = "5px solid #10b981";
      banner.innerHTML = `
        <div style="display: flex; gap: 14px; align-items: flex-start;">
          <div style="font-size: 1.8rem; line-height: 1;">✅</div>
          <div>
            <h4 style="font-size: 1.1rem; font-weight: 800; color: var(--success); margin-bottom: 4px;">
              Optimal Student Group Skill Alignment
            </h4>
            <p style="font-size: 0.88rem; color: var(--text-secondary); line-height: 1.5;">
              All ${gapData.length} core technical requirements for "${state.activeProject.name}" are satisfied by the current student group.
            </p>
          </div>
        </div>
      `;
    }
  }

  // Chart (Clean Dedicated Status Column, No overlapping labels)
  const chartContainer = document.getElementById("skill-gap-chart-container");
  if (chartContainer) {
    chartContainer.innerHTML = renderSkillGapChart(gapData);
  }

  // Intelligent Recommendations
  const recList = document.getElementById("skill-gap-recommendations-list");
  if (recList) {
    if (gapCount > 0) {
      recList.innerHTML = gapData.filter(d => d.isGap).map(gap => `
        <div style="background: var(--bg-subtle); padding: 14px; border-radius: var(--radius-md); border-left: 4px solid #ef4444;">
          <strong style="color: var(--text-primary); font-size: 0.95rem;">Action for ${gap.skill} (${gap.severity}):</strong>
          <p style="font-size: 0.83rem; color: var(--text-secondary); margin-top: 4px;">
            Target threshold is <strong>${gap.required}%</strong>; highest student capability is <strong>${gap.available}%</strong>
            (${gap.proficientCount} proficient students available).
          </p>
          <div style="margin-top: 8px; font-size: 0.82rem; color: var(--primary); font-weight: 600;">
            💡 Recommended: Conduct a targeted lab session or pair emerging students with senior project mentors.
          </div>
        </div>
      `).join("") + `
        <div style="background: var(--bg-subtle); padding: 14px; border-radius: var(--radius-md); border-left: 4px solid var(--primary);">
          <strong style="color: var(--text-primary); font-size: 0.95rem;">Algorithmic Balancing Recommendation:</strong>
          <p style="font-size: 0.83rem; color: var(--text-secondary); margin-top: 4px;">
            Keep <strong>Skill Balance</strong> importance high (≥40%) in the Team Optimizer so scarce skill holders are distributed evenly across all formed teams.
          </p>
        </div>
      `;
    } else {
      recList.innerHTML = `
        <div style="background: var(--bg-subtle); padding: 14px; border-radius: var(--radius-md); border-left: 4px solid #10b981;">
          <strong style="color: var(--success); font-size: 0.95rem;">Ready for Team Generation</strong>
          <p style="font-size: 0.83rem; color: var(--text-secondary); margin-top: 4px;">
            Student skills comfortably satisfy project requirements. Proceed to Team Optimization.
          </p>
        </div>
      `;
    }
  }

  // Domain-Wise Breakdown Table
  const domainTbody = document.getElementById("skillgap-domain-tbody");
  if (domainTbody) {
    domainTbody.innerHTML = gapData.map(d => `
      <tr>
        <td style="font-weight: 700; color: var(--text-primary);">${escapeHtml(d.skill)}</td>
        <td style="font-size:.78rem;">${escapeHtml(d.domain || "Core Engineering")}</td>
        <td><strong>${d.required}%</strong></td>
        <td>
          <span style="font-weight: 700; color: ${d.isGap ? 'var(--danger)' : 'var(--success)'};">${d.available}%</span>
          <span style="font-size: 0.75rem; color: var(--text-muted); margin-left: 4px;">(${escapeHtml(d.topStudent)})</span>
        </td>
        <td>
          <strong>${d.proficientCount}</strong> / ${d.numTeams}
          <div style="font-size:.72rem;color:var(--text-muted);">students meeting ${d.required}% target</div>
        </td>
        <td><span class="badge ${d.severityClass}">${d.severity}</span></td>
      </tr>
    `).join("");
  }

  // Interactive Methodology Collapsible Toggle & Live Audit
  const methHeader = document.getElementById("methodology-toggle-header");
  const methContent = document.getElementById("methodology-content");
  const methIcon = document.getElementById("methodology-toggle-icon");
  const methText = document.getElementById("methodology-toggle-text");
  const methProjName = document.getElementById("methodology-proj-name");
  const methLiveTbody = document.getElementById("methodology-live-tbody");

  if (methProjName && state.activeProject) {
    methProjName.textContent = state.activeProject.name;
  }

  if (methHeader && !methHeader.dataset.bound) {
    methHeader.dataset.bound = "true";
    methHeader.addEventListener("click", () => {
      if (!methContent) return;
      const isHidden = methContent.style.display === "none";
      methContent.style.display = isHidden ? "block" : "none";
      if (methIcon) methIcon.textContent = isHidden ? "▴" : "▾";
      if (methText) methText.textContent = isHidden ? "Hide Live Calculations" : "Show Live Calculations";
    });
  }

  if (methLiveTbody && state.activeProject) {
    const numTeams = parseInt(state.activeProject.numTeams, 10) || 4;
    methLiveTbody.innerHTML = gapData.map(d => {
      const calcStr = `max(0, ${d.required}% - ${d.available}%) = ${d.deficit}%`;
      const isSuff = d.proficientCount >= numTeams;
      const suffStr = `${d.proficientCount} ${isSuff ? '≥' : '<'} ${numTeams} qualified students needed`;

      return `
        <tr>
          <td style="font-weight: 700; color: var(--text-primary);">${d.skill}</td>
          <td><strong>${d.required}%</strong></td>
          <td>
            <strong style="color: ${d.isGap ? 'var(--danger)' : 'var(--success)'};">${d.available}%</strong>
            <div style="font-size: 0.74rem; color: var(--text-muted);">Top: ${d.topStudent}</div>
          </td>
          <td style="font-family: var(--font-mono); font-size: 0.8rem; background: var(--bg-subtle); padding: 6px 10px; border-radius: 4px;">
            ${calcStr}
          </td>
          <td style="text-align: center; font-weight: 600;">
            ${d.proficientCount}
          </td>
          <td style="font-family: var(--font-mono); font-size: 0.8rem; font-weight: 700; color: ${isSuff ? 'var(--success)' : 'var(--danger)'};">
            ${suffStr} ${isSuff ? '✅' : '⚠️'}
          </td>
          <td><span class="badge ${d.severityClass}">${d.severity}</span></td>
        </tr>
      `;
    }).join("");
  }
}

// ==========================================
// 14. DASHBOARD 5: ⚙️ TEAM OPTIMIZER
// ==========================================

function renderOptimizerView() {
  const w = state.weights || { skill: 50, pref: 30, exp: 20 };
  const sSkill = document.getElementById("slider-weight-skill");
  const sPref = document.getElementById("slider-weight-pref");
  const sExp = document.getElementById("slider-weight-exp");

  const vSkill = document.getElementById("weight-skill-val");
  const vPref = document.getElementById("weight-pref-val");
  const vExp = document.getElementById("weight-exp-val");

  if (sSkill) sSkill.value = w.skill !== undefined ? w.skill : 50;
  if (sPref) sPref.value = w.pref !== undefined ? w.pref : 30;
  if (sExp) sExp.value = w.exp !== undefined ? w.exp : 20;

  if (vSkill) vSkill.textContent = `${w.skill !== undefined ? w.skill : 50}%`;
  if (vPref) vPref.textContent = `${w.pref !== undefined ? w.pref : 30}%`;
  if (vExp) vExp.textContent = `${w.exp !== undefined ? w.exp : 20}%`;

  const sizeEl = document.getElementById("opt-team-size");
  if (sizeEl && state.activeProject) sizeEl.value = state.activeProject.teamSize || 5;

  const numEl = document.getElementById("opt-num-teams");
  if (numEl && state.activeProject) numEl.value = state.activeProject.numTeams || 4;

  // Update Pool Allocation Bar (Requirement 8, 9, 11)
  updateOptimizerPoolStatus();
}

function updateOptimizerPoolStatus() {
  const pName = document.getElementById("optimizer-pool-project-name");
  const pSlots = document.getElementById("optimizer-pool-required-slots");
  const pAvailBadge = document.getElementById("optimizer-pool-available-badge");
  const pAssignBadge = document.getElementById("optimizer-pool-assigned-badge");

  const teamSize = parseInt(document.getElementById("opt-team-size")?.value || 5, 10) || 5;
  const numTeams = parseInt(document.getElementById("opt-num-teams")?.value || 4, 10) || 4;
  const requiredSlots = teamSize * numTeams;

  const activeProjId = state.activeProject ? state.activeProject.id : null;
  const availableStudents = state.students.filter(s => !s.assignedProjectId || s.assignedProjectId === activeProjId);
  const assignedStudents = state.students.filter(s => s.assignedProjectId && s.assignedProjectId !== activeProjId);

  if (pName) pName.textContent = state.activeProject ? state.activeProject.name : "No Project Selected";
  if (pSlots) pSlots.innerHTML = `${requiredSlots} (${numTeams} Teams &times; ${teamSize})`;

  if (pAvailBadge) {
    pAvailBadge.textContent = `${availableStudents.length} Available`;
    if (availableStudents.length < requiredSlots) {
      pAvailBadge.className = "badge badge-danger";
    } else {
      pAvailBadge.className = "badge badge-success";
    }
  }

  if (pAssignBadge) {
    pAssignBadge.textContent = `${assignedStudents.length} Other Projects`;
  }
}

function initOptimizerEvents() {
  const updateSlidersAndLabels = () => {
    const sSkill = document.getElementById("slider-weight-skill");
    const sPref = document.getElementById("slider-weight-pref");
    const sExp = document.getElementById("slider-weight-exp");
    const vSkill = document.getElementById("weight-skill-val");
    const vPref = document.getElementById("weight-pref-val");
    const vExp = document.getElementById("weight-exp-val");

    if (sSkill) sSkill.value = state.weights.skill;
    if (sPref) sPref.value = state.weights.pref;
    if (sExp) sExp.value = state.weights.exp;

    if (vSkill) vSkill.textContent = `${state.weights.skill}%`;
    if (vPref) vPref.textContent = `${state.weights.pref}%`;
    if (vExp) vExp.textContent = `${state.weights.exp}%`;
  };

  const bindWeightSlider = (id, key, otherKeys) => {
    const sld = document.getElementById(id);
    if (sld) {
      sld.addEventListener("input", (e) => {
        let val = parseInt(e.target.value, 10);
        val = Math.max(5, Math.min(85, val));
        state.weights[key] = val;

        const remaining = 100 - val;
        const [k1, k2] = otherKeys;
        const currentOtherTotal = (state.weights[k1] || 0) + (state.weights[k2] || 0);

        if (currentOtherTotal > 0) {
          const ratio1 = state.weights[k1] / currentOtherTotal;
          state.weights[k1] = Math.max(5, Math.round(remaining * ratio1));
          state.weights[k2] = Math.max(5, remaining - state.weights[k1]);
        } else {
          state.weights[k1] = Math.floor(remaining / 2);
          state.weights[k2] = remaining - state.weights[k1];
        }

        updateSlidersAndLabels();
        state.save();
      });
    }
  };

  bindWeightSlider("slider-weight-skill", "skill", ["pref", "exp"]);
  bindWeightSlider("slider-weight-pref", "pref", ["skill", "exp"]);
  bindWeightSlider("slider-weight-exp", "exp", ["skill", "pref"]);

  const resetWeightsBtn = document.getElementById("btn-reset-weights");
  if (resetWeightsBtn) {
    resetWeightsBtn.addEventListener("click", () => {
      state.weights = { skill: 50, pref: 30, exp: 20 };
      state.save();
      renderOptimizerView();
      showToast("Objective weights reset to 50% Skill / 30% Preference / 20% Experience.", "info");
    });
  }

  // Update pool numbers dynamically on slider adjustments
  ["opt-team-size", "opt-num-teams"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("input", updateOptimizerPoolStatus);
  });

  // Bind both header and card "Generate Optimal Teams" triggers
  const triggerOpt = () => {
    executeTeamGeneration();
  };

  document.querySelectorAll("#btn-run-optimization, #btn-run-optimization-card, .btn-trigger-optimization").forEach(btn => {
    btn.addEventListener("click", triggerOpt);
  });
}

async function executeTeamGeneration() {
  if (!state.activeProject) {
    if (state.projects && state.projects.length > 0) {
      state.activeProject = state.projects[0];
      state.save();
    } else {
      loadDefaultPresets();
      showToast("Loaded sample capstone project for team optimization.", "info");
    }
  }

  if (!state.students || state.students.length === 0) {
    await loadDefaultCohort();
    showToast("Loaded standard 20-student engineering group for team optimization.", "info");
  }

  const teamSize = parseInt(document.getElementById("opt-team-size") ? document.getElementById("opt-team-size").value : 5, 10) || 5;
  const numTeams = parseInt(document.getElementById("opt-num-teams") ? document.getElementById("opt-num-teams").value : 4, 10) || 4;
  const requiredSlots = teamSize * numTeams;

  if (state.activeProject) {
    state.activeProject.teamSize = teamSize;
    state.activeProject.numTeams = numTeams;
    state.save();
  }

  // Filter available students (unassigned or assigned to current project)
  const activeProjId = state.activeProject ? state.activeProject.id : null;
  const availableStudents = state.students.filter(s => !s.assignedProjectId || s.assignedProjectId === activeProjId);

  const shortageAlert = document.getElementById("optimizer-shortage-alert");
  const shortageMsg = document.getElementById("optimizer-shortage-msg");
  const statReq = document.getElementById("shortage-stat-required");
  const statAvail = document.getElementById("shortage-stat-available");
  const statDeficit = document.getElementById("shortage-stat-deficit");
  const skillsContainer = document.getElementById("shortage-missing-skills-container");

  // Shortage handling (Requirement 10)
  if (availableStudents.length < requiredSlots) {
    const shortageCount = requiredSlots - availableStudents.length;
    if (shortageAlert) {
      shortageAlert.style.display = "block";
      if (shortageMsg) {
        shortageMsg.textContent = `This project requires ${requiredSlots} students (${numTeams} teams × ${teamSize} members), but only ${availableStudents.length} available student(s) remain in the unassigned pool.`;
      }
      if (statReq) statReq.textContent = requiredSlots;
      if (statAvail) statAvail.textContent = availableStudents.length;
      if (statDeficit) statDeficit.textContent = `-${shortageCount} Students`;

      if (skillsContainer && state.activeProject.requiredSkills) {
        const skillsList = state.activeProject.requiredSkills.map(s => s.skill).slice(0, 4).join(", ");
        skillsContainer.innerHTML = `⚠️ <strong>Impacted Skill Areas:</strong> Incomplete coverage across ${skillsList}. Add more students or adjust team size before proceeding.`;
      }
    }
    showToast(`Insufficient Students: Need ${requiredSlots}, but only ${availableStudents.length} available in pool!`, "error");
    return;
  }

  if (shortageAlert) shortageAlert.style.display = "none";

  const progressContainer = document.getElementById("opt-progress-container");
  const progressBar = document.getElementById("opt-progress-bar");
  const progressStatus = document.getElementById("opt-progress-status");
  const progressPercent = document.getElementById("opt-progress-percent");

  if (progressContainer) progressContainer.style.display = "block";

  const steps = [
    { pct: 20, text: "Ingesting project requirements & role constraints..." },
    { pct: 45, text: "Evaluating student multidimensional competency vectors..." },
    { pct: 70, text: "Executing Hungarian-inspired Priority bipartite allocation..." },
    { pct: 90, text: "Refining Pareto frontier via multi-objective genetic crossover..." },
    { pct: 100, text: "Validation complete! Harmonic equilibrium reached." }
  ];

  let currentStep = 0;
  const interval = setInterval(async () => {
    if (currentStep < steps.length) {
      const step = steps[currentStep];
      if (progressBar) progressBar.style.width = `${step.pct}%`;
      if (progressPercent) progressPercent.textContent = `${step.pct}%`;
      if (progressStatus) progressStatus.textContent = step.text;
      currentStep++;
    } else {
      clearInterval(interval);

      // Execute Master Team Optimizer Pipeline
      const result = generateOptimalTeams(availableStudents, state.activeProject, state.weights);

      if (result.isInsufficient) {
        if (progressContainer) {
          progressContainer.style.display = "none";
          if (progressBar) progressBar.style.width = "0%";
        }
        const shortageAlert = document.getElementById("optimizer-shortage-alert");
        const shortageMsg = document.getElementById("optimizer-shortage-msg");
        const statReq = document.getElementById("shortage-stat-required");
        const statAvail = document.getElementById("shortage-stat-available");
        const statDeficit = document.getElementById("shortage-stat-deficit");
        const skillsContainer = document.getElementById("shortage-missing-skills-container");

        if (shortageAlert) {
          shortageAlert.style.display = "block";
          if (shortageMsg) shortageMsg.textContent = result.message;
          if (statReq) statReq.textContent = result.requiredStudents;
          if (statAvail) statAvail.textContent = result.availableStudents;
          if (statDeficit) statDeficit.textContent = `-${result.shortage} Students`;

          if (skillsContainer && result.missingSkills && result.missingSkills.length > 0) {
            const list = result.missingSkills.map(s => `${s.skill} (Max: ${s.availableMax}%, Need: ${s.requiredPercent}%)`).join(", ");
            skillsContainer.innerHTML = `⚠️ <strong>Impacted Skill Shortages:</strong> Deficit in: ${list}. Add more students or adjust team size.`;
          }
        }
        showToast(`Insufficient Students: Need ${result.requiredStudents}, only ${result.availableStudents} available!`, "error");
        return;
      }

      // Reset prior assignments for this active project
      state.students.forEach(s => {
        if (s.assignedProjectId === state.activeProject.id) {
          s.assignmentStatus = "Available";
          s.assignedProjectId = null;
          s.assignedTeamId = null;
          s.assignedRole = null;
        }
      });

      // Assign students to formed teams
      result.teams.forEach(team => {
        (team.members || []).forEach(member => {
          const student = state.students.find(s => s.id === member.id);
          if (student) {
            student.assignedTeamId = team.id;
            student.assignedProjectId = state.activeProject.id;
            student.assignmentStatus = "Assigned";
            student.assignedRole = member.assignedRole || member.preferredRole;
          }
        });
      });

      state.teams = result.teams;
      state.teamsByProject = state.teamsByProject || {};
      state.teamsByProject[state.activeProject.id] = result.teams;
      state.lastResultMeta = result;

      // Add to session history
      state.historyLog.unshift({
        timestamp: new Date().toLocaleString(),
        project: state.activeProject.name,
        algorithm: result.algorithm,
        teamsCount: result.teams.length,
        avgScore: result.avgScore,
        execTime: result.executionTimeMs
      });

      // Persist teams to backend SQLite
      try {
        const saveRes = await api.saveTeams(state.activeProject.id, result.teams, result.algorithm);
        // The backend workspace is authoritative after team formation.
        // Replace the cohort even when the returned array is empty so stale
        // frontend assignment flags can never survive a successful save.
        if (saveRes && saveRes.workspace && Array.isArray(saveRes.workspace.students)) {
          state.students = saveRes.workspace.students;
        }
        if (saveRes?.workspace?.teamsByProject) {
          state.teamsByProject = saveRes.workspace.teamsByProject;
          state.teams = state.teamsByProject[state.activeProject.id] || [];
        }
      } catch (err) {
        // Never leave the UI showing assignments that were not persisted.
        // Re-read the SQLite workspace after a failed save and restore the
        // server state. This keeps the Student Cohort and Team Overview in
        // sync even when the backend rejects a team save.
        console.warn("Backend team save warning:", err);
        try {
          const freshWorkspaceRes = await api.getWorkspace();
          if (freshWorkspaceRes?.workspace) {
            const ws = freshWorkspaceRes.workspace;
            if (Array.isArray(ws.students)) state.students = ws.students;
            if (ws.teamsByProject) state.teamsByProject = ws.teamsByProject;
            state.teams = state.teamsByProject?.[state.activeProject.id] || [];
          }
        } catch (refreshErr) {
          console.warn("Workspace refresh after team save failure:", refreshErr);
        }
      }

      state.save();
      updateOptimizerPoolStatus();
      renderStudentsCohortView();

      if (progressContainer) {
        setTimeout(() => {
          progressContainer.style.display = "none";
          if (progressBar) progressBar.style.width = "0%";
        }, 300);
      }

      showToast(`Formed ${result.teams.length} balanced teams! Mean Quality: ${result.avgScore}%`, "success");
      switchView("results");
    }
  }, 100);
}

// ==========================================
// 15. DASHBOARD 6: 🏆 TEAM RESULTS
// ==========================================

function renderResultsView() {
  if (!state.activeProject || state.students.length === 0) {
    const grid = document.getElementById("team-results-grid");
    if (grid) {
      grid.innerHTML = `
        <div class="empty-state-card" style="grid-column: 1 / -1;">
          <div class="empty-state-icon">🏆</div>
          <div class="empty-state-title">No Teams Formed Yet</div>
          <div class="empty-state-desc">Define a project and student group, then click 'Generate Optimal Teams' in the Optimizer.</div>
          <button class="btn btn-primary" onclick="window.SkillMatch.switchView('optimizer')">
            <span>⚙️</span> Go to Team Optimizer
          </button>
        </div>
      `;
    }
    return;
  }

  const teams = state.teams;
  const meta = state.lastResultMeta || {
    algorithm: "Multi-Objective Genetic Optimization",
    executionTimeMs: 14.8,
    avgScore: 92
  };

  const algoLabel = document.getElementById("results-algo-used-label");
  if (algoLabel) algoLabel.textContent = meta.algorithm;

  const numTeamsEl = document.getElementById("results-summary-numteams");
  if (numTeamsEl) numTeamsEl.textContent = `${teams.length} Teams`;

  const totalStudentsPlaced = teams.reduce((acc, t) => acc + (t.members ? t.members.length : 0), 0);
  const studentsEl = document.getElementById("results-summary-students");
  if (studentsEl) studentsEl.textContent = `${totalStudentsPlaced} / ${state.students.length}`;

  const timeEl = document.getElementById("results-summary-time");
  if (timeEl) timeEl.textContent = `${meta.executionTimeMs || 12.8} ms`;

  const meanScore = Math.round(teams.reduce((acc, t) => acc + (t.metrics ? t.metrics.overallScore : 0), 0) / teams.length);
  const meanEl = document.getElementById("results-summary-mean-score");
  if (meanEl) meanEl.textContent = `${meanScore}%`;

  // Evaluate Results, Ties, and Recommended Team
  const evalResults = evaluateTeamResults(teams, state.activeProject);

  // 1. Recommended Team Banner
  const recBannerContainer = document.getElementById("results-recommended-banner");
  if (recBannerContainer) {
    if (evalResults.recommendedTeam) {
      const top = evalResults.recommendedTeam;
      recBannerContainer.innerHTML = `
        <div class="recommended-banner">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 14px;">
            <div>
              <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                <span class="badge badge-success" style="font-size: 0.85rem; padding: 4px 10px;">⭐ RECOMMENDED TEAM FORMATION</span>
                <span style="font-size: 0.82rem; color: var(--text-secondary); font-weight: 600;">Algorithmic Gold Standard</span>
              </div>
              <h3 style="font-size: 1.35rem; font-weight: 800; color: var(--text-primary); margin: 0;">
                ${top.name} — Superior Composite Harmony (${top.metrics?.overallScore || 90}%)
              </h3>
            </div>
            ${renderScoreGauge(top.metrics?.overallScore || 90, 80, 8, "Top Team")}
          </div>

          <div style="margin-top: 14px;">
            <div style="font-size: 0.8rem; font-weight: 700; text-transform: uppercase; color: var(--text-muted); margin-bottom: 6px;">
              Why Choose This Team?
            </div>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 8px;">
              ${evalResults.recommendationReasons.map(r => `
                <div style="display: flex; gap: 8px; font-size: 0.84rem; color: var(--text-secondary); align-items: center;">
                  <span style="color: var(--success); font-weight: bold;">✓</span>
                  <span>${r}</span>
                </div>
              `).join("")}
            </div>
          </div>
        </div>
      `;
    } else {
      recBannerContainer.innerHTML = "";
    }
  }

  // 2. Tie Notice
  const tieNoticeContainer = document.getElementById("results-tie-notice");
  if (tieNoticeContainer) {
    if (evalResults.tieHandled) {
      tieNoticeContainer.innerHTML = `
        <div class="tie-notice-card">
          <span style="font-size: 1.4rem;">⚖️</span>
          <div style="font-size: 0.85rem; color: var(--text-primary); line-height: 1.4;">
            <strong>Secondary Metric Tie-Breaker Applied:</strong> Top teams tied on primary overall score.
            The ranking was resolved via secondary objective hierarchy:
            <code>Skill Balance &gt; Preference Match &gt; Experience Balance &gt; Diversity</code>.
          </div>
        </div>
      `;
    } else {
      tieNoticeContainer.innerHTML = "";
    }
  }

  // 3. Team Comparison Matrix Table (Cross-Team Multi-Objective Harmony Matrix)
  const comparisonTbody = document.getElementById("team-comparison-tbody");
  if (comparisonTbody) {
    const matrix = (evalResults && evalResults.comparisonMatrix && evalResults.comparisonMatrix.length > 0)
      ? evalResults.comparisonMatrix
      : (teams || []).map((t, idx) => ({
        teamId: t.id || `team-${idx + 1}`,
        teamName: t.name || `Team ${idx + 1}`,
        rank: idx + 1,
        skillBalance: t.metrics?.skillBalance !== undefined ? t.metrics.skillBalance : 85,
        preferenceMatch: t.metrics?.preferenceMatch !== undefined ? t.metrics.preferenceMatch : 80,
        experienceBalance: t.metrics?.experienceBalance !== undefined ? t.metrics.experienceBalance : 80,
        overallScore: t.metrics?.overallScore !== undefined ? t.metrics.overallScore : 85,
        rationale: `Harmonious team formation balancing ${t.members?.length || 5} student members.`
      }));

    // Determine highest values across all columns for highlighting
    const maxSkill = Math.max(...matrix.map(m => m.skillBalance || 0));
    const maxPref = Math.max(...matrix.map(m => m.preferenceMatch || 0));
    const maxExp = Math.max(...matrix.map(m => m.experienceBalance || 0));
    const maxOverall = Math.max(...matrix.map(m => m.overallScore || 0));

    comparisonTbody.innerHTML = matrix.map((row, idx) => {
      const isTop = row.rank === 1;
      const tName = row.teamName || `Team ${idx + 1}`;
      const sVal = row.skillBalance !== undefined ? row.skillBalance : 85;
      const pVal = row.preferenceMatch !== undefined ? row.preferenceMatch : 80;
      const eVal = row.experienceBalance !== undefined ? row.experienceBalance : 80;
      const oVal = row.overallScore !== undefined ? row.overallScore : 85;
      const rationaleText = row.rationale || `Pareto optimal configuration fulfilling target constraints.`;

      return `
        <tr style="${isTop ? 'background: rgba(16, 185, 129, 0.04); font-weight: 600;' : ''}">
          <td style="font-weight: 700; color: var(--text-primary);">
            ${tName} ${isTop ? '<span class="badge badge-success" style="margin-left: 6px;">#1 Pick</span>' : ''}
          </td>
          <td class="${sVal === maxSkill ? 'best-metric-cell' : ''}">${sVal}%</td>
          <td class="${pVal === maxPref ? 'best-metric-cell' : ''}">${pVal}%</td>
          <td class="${eVal === maxExp ? 'best-metric-cell' : ''}">${eVal}%</td>
          <td class="${oVal === maxOverall ? 'best-metric-cell' : ''}" style="font-weight: 800; color: var(--primary);">${oVal}%</td>
          <td style="font-size: 0.82rem; color: var(--text-secondary); text-align: left;">${rationaleText}</td>
        </tr>
      `;
    }).join("");
  }

  // 4. Team Cards Grid
  const grid = document.getElementById("team-results-grid");
  if (grid) {
    grid.innerHTML = teams.map((team, tIdx) => {
      const m = team.metrics || { skillBalance: 0, preferenceMatch: 0, experienceBalance: 0, overallScore: 0 };

      const membersListHtml = (team.members || []).map(member => {
        const isPrefMatch = member.assignedRole && member.preferredRole &&
          member.assignedRole.toLowerCase() === member.preferredRole.toLowerCase();

        return `
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 10px; border-radius: var(--radius-sm); background: var(--bg-surface); margin-bottom: 6px; border: 1px solid var(--border-color);">
            <div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <strong style="font-size: 0.9rem; color: var(--text-primary);">${member.name}</strong>
                <span class="badge ${member.experience === 'Advanced' ? 'badge-success' : member.experience === 'Intermediate' ? 'badge-primary' : 'badge-neutral'}" style="font-size: 0.7rem; padding: 2px 6px;">
                  ${member.experience}
                </span>
              </div>
              <div style="font-size: 0.76rem; color: var(--text-secondary); margin-top: 2px;">
                Role: <strong style="color: var(--primary);">${member.assignedRole || member.preferredRole}</strong>
                ${isPrefMatch ? '<span style="color: #10b981; font-weight: 700; margin-left: 4px;">✓ Preferred</span>' : ''}
              </div>
            </div>
            <button class="btn btn-secondary btn-sm btn-quick-explain" data-student-id="${member.id}" style="padding: 4px 8px; font-size: 0.75rem;" title="Explain why this student was placed in this team">
              💡 Why?
            </button>
          </div>
        `;
      }).join("");

      return `
        <div class="card team-card">
          <div class="card-header" style="border-bottom: 1px solid var(--border-color); padding-bottom: 14px; margin-bottom: 16px;">
            <div style="display: flex; align-items: center; gap: 12px;">
              <div class="brand-logo-icon" style="width: 38px; height: 38px; font-size: 1.1rem; background: var(--primary-light); color: var(--primary);">
                T${tIdx + 1}
              </div>
              <div>
                <h3 style="font-size: 1.2rem; font-weight: 800; color: var(--text-primary); margin: 0;">${team.name}</h3>
                <span style="font-size: 0.8rem; color: var(--text-muted);">${(team.members || []).length} Members Assigned</span>
              </div>
            </div>
            ${renderScoreGauge(m.overallScore, 80, 7, "Quality")}
          </div>

          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; text-align: center; margin-bottom: 16px; background: var(--bg-subtle); padding: 10px; border-radius: var(--radius-sm);">
            <div>
              <div style="font-size: 0.72rem; color: var(--text-muted); font-weight: 600;">Skill (50%)</div>
              <div style="font-size: 0.95rem; font-weight: 800; color: var(--primary);">${m.skillBalance}%</div>
            </div>
            <div>
              <div style="font-size: 0.72rem; color: var(--text-muted); font-weight: 600;">Pref (30%)</div>
              <div style="font-size: 0.95rem; font-weight: 800; color: #10b981;">${m.preferenceMatch}%</div>
            </div>
            <div>
              <div style="font-size: 0.72rem; color: var(--text-muted); font-weight: 600;">Exp (20%)</div>
              <div style="font-size: 0.95rem; font-weight: 800; color: #8b5cf6;">${m.experienceBalance}%</div>
            </div>
          </div>

          <div>
            <div style="font-size: 0.78rem; font-weight: 700; text-transform: uppercase; color: var(--text-muted); margin-bottom: 8px;">
              Assigned Roster:
            </div>
            ${membersListHtml}
          </div>
        </div>
      `;
    }).join("");

    grid.querySelectorAll(".btn-quick-explain").forEach(btn => {
      btn.addEventListener("click", () => {
        const studentId = btn.getAttribute("data-student-id");
        switchView("explain");
        const select = document.getElementById("explain-student-select");
        if (select) {
          select.value = studentId;
          renderExplainStudent(studentId);
        }
      });
    });
  }
}

function initResultsEvents() {
  // Team results events
}

// ==========================================
// 16. DASHBOARD 7: 💡 EXPLAIN & WHAT-IF
// ==========================================

function renderExplainView() {
  if (!state.teams || state.teams.length === 0) {
    const card = document.getElementById("explain-details-card");
    if (card) {
      card.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 20px;">Please configure a project and generate teams first.</div>`;
    }
    return;
  }

  const explainSelect = document.getElementById("explain-student-select");
  if (explainSelect) {
    explainSelect.innerHTML = state.students.map(s => `
      <option value="${s.id}">${s.name} (${s.rollNo}) — ${s.preferredRole}</option>
    `).join("");

    if (!explainSelect.hasAttribute("data-bound")) {
      explainSelect.setAttribute("data-bound", "true");
      explainSelect.addEventListener("change", (e) => {
        renderExplainStudent(e.target.value);
      });
    }

    if (state.students.length > 0) {
      renderExplainStudent(state.students[0].id);
    }
  }

  const whatIfStudent = document.getElementById("whatif-student-select");
  if (whatIfStudent) {
    whatIfStudent.innerHTML = state.students.map(s => `
      <option value="${s.id}">${s.name} (${s.rollNo})</option>
    `).join("");

    if (!whatIfStudent.hasAttribute("data-bound")) {
      whatIfStudent.setAttribute("data-bound", "true");
      whatIfStudent.addEventListener("change", updateWhatIfSwapPartners);
    }
  }

  const whatIfTeam = document.getElementById("whatif-target-team-select");
  if (whatIfTeam && state.teams) {
    whatIfTeam.innerHTML = state.teams.map(t => `
      <option value="${t.id}">${t.name}</option>
    `).join("");

    if (!whatIfTeam.hasAttribute("data-bound")) {
      whatIfTeam.setAttribute("data-bound", "true");
      whatIfTeam.addEventListener("change", updateWhatIfSwapPartners);
    }
  }

  updateWhatIfSwapPartners();
}

function renderExplainStudent(studentId) {
  const card = document.getElementById("explain-details-card");
  if (!card) return;

  const explanation = explainStudentPlacement(studentId, state.teams, state.activeProject);

  if (!explanation.success) {
    card.innerHTML = `
      <div style="color: var(--text-secondary); text-align: center; padding: 20px;">
        ${explanation.message}
      </div>
    `;
    return;
  }

  card.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 14px;">
      <div>
        <h4 style="font-size: 1.15rem; font-weight: 800; color: var(--text-primary); margin: 0;">${explanation.student.name}</h4>
        <span style="font-size: 0.85rem; color: var(--primary); font-weight: 600;">
          Placed in: <strong>${explanation.team.name}</strong> as <strong>${explanation.role}</strong>
        </span>
      </div>
    </div>

    <div style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px;">
      ${explanation.explanations.map(exp => `
        <div style="display: flex; gap: 10px; font-size: 0.86rem; color: var(--text-secondary); line-height: 1.5;">
          <span style="color: #10b981; font-weight: bold;">✓</span>
          <div>${exp}</div>
        </div>
      `).join("")}
    </div>

    <div style="border-top: 1px solid var(--border-color); padding-top: 14px;">
      <div style="font-size: 0.8rem; font-weight: 700; text-transform: uppercase; color: var(--text-muted); margin-bottom: 8px;">
        Dynamically Evaluated Alternative Team Options:
      </div>
      <div style="display: flex; flex-direction: column; gap: 6px;">
        ${explanation.alternatives.map(alt => `
          <div style="font-size: 0.83rem; color: var(--text-secondary); background: var(--bg-surface); padding: 8px 12px; border-radius: var(--radius-sm); border: 1px solid var(--border-color);">
            <strong>${alt.teamName}:</strong> ${alt.reasonNotChosen}
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function updateWhatIfSwapPartners() {
  const targetTeamSelect = document.getElementById("whatif-target-team-select");
  const partnerSelect = document.getElementById("whatif-swap-partner-select");

  if (!targetTeamSelect || !partnerSelect || !state.teams) return;

  const targetTeamId = targetTeamSelect.value;
  const targetTeam = state.teams.find(t => t.id === targetTeamId);

  partnerSelect.innerHTML = `<option value="">-- Direct Move (No swap partner) --</option>`;

  if (targetTeam && targetTeam.members) {
    targetTeam.members.forEach(m => {
      const opt = document.createElement("option");
      opt.value = m.id;
      opt.textContent = `Swap with ${m.name} (${m.assignedRole || m.preferredRole})`;
      partnerSelect.appendChild(opt);
    });
  }
}

function initExplainEvents() {
  const runWhatIfBtn = document.getElementById("btn-run-whatif");
  if (runWhatIfBtn) {
    runWhatIfBtn.addEventListener("click", () => {
      const studentSelect = document.getElementById("whatif-student-select");
      const targetTeamSelect = document.getElementById("whatif-target-team-select");
      const partnerSelect = document.getElementById("whatif-swap-partner-select");

      if (!studentSelect || !targetTeamSelect) return;

      const studentId = studentSelect.value;
      const targetTeamId = targetTeamSelect.value;
      const swapPartnerId = partnerSelect?.value || null;

      let sourceTeamId = null;
      for (const t of state.teams) {
        if (t.members.some(m => m.id === studentId)) {
          sourceTeamId = t.id;
          break;
        }
      }

      if (!sourceTeamId) {
        showToast("Student is not assigned to any team.", "warning");
        return;
      }

      if (sourceTeamId === targetTeamId) {
        showToast("Student is already in this team! Choose a different destination team.", "warning");
        return;
      }

      const result = simulateWhatIfMove({
        studentId,
        sourceTeamId,
        targetTeamId,
        swapWithStudentId: swapPartnerId,
        teams: state.teams,
        project: state.activeProject,
        weights: state.weights
      });

      if (!result.valid) {
        const resultsBox = document.getElementById("whatif-results-box");
        if (resultsBox) {
          resultsBox.style.display = "block";
          resultsBox.innerHTML = `<div style="padding:12px 14px;border-left:4px solid var(--danger);background:rgba(239,68,68,.08);color:var(--danger);font-weight:700;">⚠️ ${escapeHtml(result.error || "Invalid what-if selection.")}</div>`;
        }
        showToast(result.error || "Invalid what-if selection.", "error");
        return;
      }

      const resultsBox = document.getElementById("whatif-results-box");
      if (resultsBox && result.valid) {
        resultsBox.style.display = "block";
        const deltaColor = result.delta >= 0 ? "#10b981" : "#ef4444";
        const deltaSign = result.delta > 0 ? `+${result.delta}` : `${result.delta}`;

        resultsBox.innerHTML = `
          <div style="font-weight: 800; font-size: 1rem; color: var(--text-primary); margin-bottom: 10px;">
            Hypothetical Move Simulation: ${result.studentName} (${result.sourceTeamName} → ${result.targetTeamName})
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px;">
            <div style="background: var(--bg-surface); padding: 12px; border-radius: var(--radius-sm); border: 1px solid var(--border-color);">
              <div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 700;">BEFORE MOVE</div>
              <div style="font-size: 0.85rem; margin-top: 4px;">
                ${result.sourceTeamName}: <strong>${result.before.source.overallScore}%</strong><br>
                ${result.targetTeamName}: <strong>${result.before.target.overallScore}%</strong>
              </div>
            </div>

            <div style="background: var(--bg-surface); padding: 12px; border-radius: var(--radius-sm); border: 1px solid var(--border-color);">
              <div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 700;">AFTER MOVE</div>
              <div style="font-size: 0.85rem; margin-top: 4px;">
                ${result.sourceTeamName}: <strong style="color: ${result.after.source.overallScore >= 80 ? 'var(--primary)' : '#ef4444'};">${result.after.source.overallScore}%</strong><br>
                ${result.targetTeamName}: <strong style="color: var(--primary);">${result.after.target.overallScore}%</strong>
              </div>
            </div>
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; background: rgba(59, 130, 246, 0.06); padding: 10px 14px; border-radius: var(--radius-sm);">
            <span style="font-size: 0.85rem; font-weight: 600;">Net Balance Shift:</span>
            <span style="font-size: 1.1rem; font-weight: 800; color: ${deltaColor};">${deltaSign}%</span>
          </div>

          <div style="font-size: 0.85rem; line-height: 1.5; color: var(--text-secondary); margin-bottom: 14px;">
            ${result.verdictMessage}
          </div>

          <button class="btn btn-secondary btn-sm" id="btn-apply-whatif-commit" style="width: 100%;">
            <span>✅</span> Apply & Commit What-If Move to Active Teams
          </button>
        `;

        const applyBtn = document.getElementById("btn-apply-whatif-commit");
        if (applyBtn) {
          applyBtn.addEventListener("click", () => {
            const sTeam = state.teams.find(t => t.id === sourceTeamId);
            const dTeam = state.teams.find(t => t.id === targetTeamId);
            const sIdx = sTeam.members.findIndex(m => m.id === studentId);
            const student = sTeam.members[sIdx];

            if (swapPartnerId) {
              const dIdx = dTeam.members.findIndex(m => m.id === swapPartnerId);
              const partner = dTeam.members[dIdx];
              const tempRole = student.assignedRole;
              student.assignedRole = partner.assignedRole;
              partner.assignedRole = tempRole;
              sTeam.members[sIdx] = partner;
              dTeam.members[dIdx] = student;
            } else {
              sTeam.members.splice(sIdx, 1);
              dTeam.members.push(student);
            }

            // Recalculate metrics
            sTeam.metrics = evaluateTeam(sTeam.members, state.activeProject.requiredSkills, state.weights);
            dTeam.metrics = evaluateTeam(dTeam.members, state.activeProject.requiredSkills, state.weights);

            state.save();
            showToast(`Move applied! ${student.name} transferred to ${dTeam.name}.`, "success");
            switchView("results");
          });
        }
      }
    });
  }
}

// ==========================================
// 17. DASHBOARD 8: 📈 AOA BENCHMARK SUITE
// ==========================================

function renderAlgoBenchmarkView() {
  if (!state.activeProject || state.students.length === 0) {
    const tbody = document.getElementById("aoa-comparison-tbody");
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; padding: 30px; color: var(--text-muted);">
            Please load or create a project and student group first to run live AOA benchmarks.
          </td>
        </tr>
      `;
    }
    return;
  }

  const benchmark = runAlgorithmBenchmarkSuite(state.students, state.activeProject, state.weights);
  state.benchmarkData = benchmark;

  // Comparison Table with Honest Academic Labeling
  const tbody = document.getElementById("aoa-comparison-tbody");
  if (tbody) {
    tbody.innerHTML = benchmark.results.map(r => `
      <tr>
        <td style="font-weight: 700; color: var(--text-primary);">${r.name}</td>
        <td><span class="badge badge-neutral" style="font-size: 0.74rem;">${r.role}</span></td>
        <td>
          <span class="badge ${r.score >= 90 ? 'badge-success' : 'badge-primary'}">
            ${r.score}%
          </span>
        </td>
        <td style="font-family: var(--font-mono); font-weight: 600;">${r.timeMs} ms</td>
        <td><code>${r.timeComplexity}</code></td>
        <td><code>${r.spaceComplexity}</code></td>
        <td style="font-weight: 600;">${r.variance}</td>
      </tr>
    `).join("");
  }

  // Quality Chart
  const qualityChart = document.getElementById("chart-algo-quality");
  if (qualityChart) qualityChart.innerHTML = renderAlgoQualityChart(benchmark.results);

  // Time Chart
  const timeChart = document.getElementById("chart-algo-time");
  if (timeChart) timeChart.innerHTML = renderAlgoTimeChart(benchmark.results);

  // Scalability Chart
  const scalChart = document.getElementById("chart-scalability");
  if (scalChart) scalChart.innerHTML = renderScalabilityChart(benchmark.scalabilityData);
}

function initAlgoBenchmarkEvents() {
  // Live benchmark rerun control intentionally removed from the dashboard.
}

// ==========================================
// 18. DASHBOARD 9: 📄 ACADEMIC REPORTS & PDF
// ==========================================

let teamOverviewLiveTimer = null;
let teamOverviewRefreshInFlight = false;

async function refreshTeamOverviewLive() {
  if (!state.isLoggedIn || typeof api.getWorkspace !== "function" || teamOverviewRefreshInFlight) return;
  teamOverviewRefreshInFlight = true;
  try {
    const fresh = await api.getWorkspace();
    const ws = fresh?.workspace || fresh;
    if (!ws || !Array.isArray(ws.projects)) return;

    // IMPORTANT: Team Overview always treats the backend SQLite workspace as the
    // live source of truth. It never reconstructs teams from the active project,
    // and it never sends this read-only dashboard state back to the server.
    const previousActiveId = state.activeProject ? String(state.activeProject.id) : null;
    state.projects = ws.projects;
    state.students = Array.isArray(ws.students) ? ws.students : [];

    // Normalize the project/team map from both representations. This protects
    // the overview when older records use numeric IDs, string IDs, or when the
    // backend returns only the flat team list.
    const normalized = {};
    const incomingMap = ws.teamsByProject && typeof ws.teamsByProject === "object" ? ws.teamsByProject : {};
    Object.keys(incomingMap).forEach(k => {
      if (Array.isArray(incomingMap[k])) normalized[String(k)] = incomingMap[k];
    });
    const flatTeams = Array.isArray(ws.allTeams) ? ws.allTeams : (Array.isArray(ws.teams) ? ws.teams : []);
    flatTeams.forEach(team => {
      const pid = team?.projectId ?? team?.project_id;
      if (pid === undefined || pid === null || pid === "") return;
      const key = String(pid);
      if (!normalized[key]) normalized[key] = [];
      // Avoid duplicating a team if it was present in teamsByProject already.
      if (!normalized[key].some(t => String(t?.id) === String(team?.id))) normalized[key].push(team);
    });
    state.teamsByProject = normalized;
    state.teams = flatTeams;

    // Preserve the project the user was looking at if it still exists. After a
    // deletion, switch only when that project is actually gone.
    state.activeProject = state.projects.find(p => String(p.id) === previousActiveId)
      || state.projects.find(p => String(p.id) === String(ws.activeProjectId))
      || state.projects[0]
      || null;

    renderReportsViewFromState();
    state.saveLocalOnly();
  } catch (err) {
    console.warn("Live Team Overview refresh warning:", err);
  } finally {
    teamOverviewRefreshInFlight = false;
  }
}

async function renderReportsView() {
  await refreshTeamOverviewLive();
  renderReportsViewFromState();

  // Keep this dashboard live. A project can be deleted or its teams changed in
  // another dashboard/action, so Team Overview re-reads SQLite periodically
  // while it is open. This is intentionally read-only and never autosaves.
  if (teamOverviewLiveTimer) clearInterval(teamOverviewLiveTimer);
  teamOverviewLiveTimer = setInterval(() => {
    if (state.currentView === "reports") refreshTeamOverviewLive();
    else {
      clearInterval(teamOverviewLiveTimer);
      teamOverviewLiveTimer = null;
    }
  }, 1500);
}

function getOverviewTeamsForProject(projectId) {
  const key = String(projectId);
  const map = state.teamsByProject || {};
  const matchedKey = Object.keys(map).find(k => String(k) === key);
  if (matchedKey && Array.isArray(map[matchedKey])) return map[matchedKey];

  // Defensive fallback: filter the complete live team list by project ID.
  // Never use state.teams merely because it belongs to the active project.
  const flat = Array.isArray(state.teams) ? state.teams : [];
  return flat.filter(t => String(t?.projectId ?? t?.project_id ?? "") === key);
}

function renderReportsViewFromState() {
  const admin = state.currentAdmin || {};
  const p = state.activeProject || null;
  const projectList = document.getElementById("overview-project-list");
  if (projectList) {
    const projects = Array.isArray(state.projects) ? state.projects : [];
    projectList.innerHTML = projects.length ? projects.map(project => {
      const selected = p && String(project.id) === String(p.id);
      const pt = getOverviewTeamsForProject(project.id);
      const memberCount = pt.reduce((n, t) => n + (Array.isArray(t.members) ? t.members.length : 0), 0);
      return `<button type="button" class="card overview-project-item ${selected ? 'active' : ''}" data-project-id="${escapeHtml(String(project.id))}" style="text-align:left; cursor:pointer; padding:12px 14px; border:1px solid ${selected ? 'var(--primary)' : 'var(--border-color)'}; background:${selected ? 'var(--primary-light)' : 'var(--bg-surface)'}; border-radius:10px;">
        <div style="font-weight:800; color:var(--text-primary);">${escapeHtml(project.name || 'Untitled Project')}</div>
        <div style="font-size:.76rem; color:var(--text-secondary); margin-top:4px;">${escapeHtml(project.type || project.domain || 'Computer Science')} • ${pt.length} teams • ${memberCount} students</div>
      </button>`;
    }).join('') : '<div style="color:var(--text-muted); font-size:.85rem;">No projects created yet.</div>';
    projectList.querySelectorAll('.overview-project-item').forEach(btn => btn.addEventListener('click', () => {
      const found = state.projects.find(x => String(x.id) === String(btn.dataset.projectId));
      if (found) {
        state.activeProject = found;
        state.teams = getOverviewTeamsForProject(found.id);
        // This dashboard is read-only; do not autosave a snapshot merely because
        // the user selected a project. That could overwrite newer SQLite team data.
        renderReportsViewFromState();
      }
    }));
  }

  const titleEl = document.getElementById("overview-project-title");
  const domainEl = document.getElementById("overview-project-domain");
  const descEl = document.getElementById("overview-project-description");
  const summaryEl = document.getElementById("overview-team-summary");
  const harmonyEl = document.getElementById("overview-harmony");
  const tbody = document.getElementById("overview-teams-tbody");

  if (titleEl) titleEl.textContent = p?.name || "No project selected";
  if (domainEl) domainEl.textContent = p ? (p.type || p.domain || "Computer Science") : "—";
  if (descEl) descEl.textContent = p?.description || "No project description available.";

  const teams = p ? getOverviewTeamsForProject(p.id) : [];
  const totalStudents = teams.reduce((sum, team) => sum + (Array.isArray(team.members) ? team.members.length : 0), 0);
  const scores = teams.map(team => Number(team.metrics?.overallScore)).filter(Number.isFinite);
  const harmony = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : null;

  if (summaryEl) summaryEl.textContent = `${teams.length} Teams Formed • ${totalStudents} Students Allocated`;
  if (harmonyEl) harmonyEl.textContent = harmony ? `Team Harmony: ${harmony}%` : "Team Harmony: —";

  if (tbody) {
    if (!teams.length) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:28px;">No teams formed yet for the current project. Generate teams from the Team Optimizer.</td></tr>`;
    } else {
      tbody.innerHTML = teams.map((team, index) => {
        const m = team.metrics || {};
        const members = Array.isArray(team.members) ? team.members : [];
        const teamName = `Team ${index + 1}`;
        const membersHtml = members.length
          ? members.map(mem => {
              const roll = mem.rollNo || mem.roll_no || "—";
              const name = mem.name || "Unnamed Student";
              const role = mem.assignedRole || mem.preferredRole || "Project Member";
              return `<div class="rep-team-member" style="display:flex; align-items:flex-start; gap:5px; margin-bottom:4px; line-height:1.35;">
                <span aria-hidden="true">•</span><code>${roll}</code><strong>${name}</strong><span>(${role})</span>
              </div>`;
            }).join("")
          : `<span style="color:var(--text-muted);">No students allocated</span>`;

        return `<tr>
          <td style="font-weight:800; color:var(--text-primary); vertical-align:middle;">
            ${teamName}<div style="font-size:.72rem; color:var(--text-muted);">${members.length} Members</div>
          </td>
          <td style="line-height:1.35;">${membersHtml}</td>
          <td style="font-weight:700; text-align:center;">${m.skillBalance ?? "—"}${m.skillBalance !== undefined ? "%" : ""}</td>
          <td style="font-weight:700; text-align:center;">${m.preferenceMatch ?? "—"}${m.preferenceMatch !== undefined ? "%" : ""}</td>
          <td style="font-weight:700; text-align:center;">${m.experienceBalance ?? "—"}${m.experienceBalance !== undefined ? "%" : ""}</td>
          <td style="font-weight:800; color:var(--primary); text-align:center; font-size:.95rem;">${m.overallScore ?? "—"}${m.overallScore !== undefined ? "%" : ""}</td>
        </tr>`;
      }).join("");
    }
  }

  const adminName = document.getElementById("overview-admin-name");
  const hodName = document.getElementById("overview-hod-name");
  const deanName = document.getElementById("overview-dean-name");
  const dateEl = document.getElementById("overview-report-date");
  if (adminName) adminName.textContent = admin.name || "—";
  if (hodName) hodName.textContent = admin.hodName || "—";
  if (deanName) deanName.textContent = admin.deanName || "—";
  if (dateEl) {
    const d = new Date();
    const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    dateEl.textContent = `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  }
}

function initReportsEvents() {
  const savePdfBtn = document.getElementById("btn-save-team-overview-pdf");
  if (savePdfBtn) {
    savePdfBtn.addEventListener("click", () => {
      generateTeamOverviewPdfReport();
    });
  }
}

// Builds a standalone, read-only PDF report from the live Team Overview data
// (current project, its teams/members, and team metrics exactly as shown on
// screen) and opens the browser print dialog so the user can save it as a
// PDF. This never creates/regenerates/deletes teams and never writes to the
// database — it only reads from the already-loaded live state.
function generateTeamOverviewPdfReport() {
  const admin = state.currentAdmin || {};
  const p = state.activeProject || null;
  const teams = p ? getOverviewTeamsForProject(p.id) : [];
  const totalStudents = teams.reduce((sum, team) => sum + (Array.isArray(team.members) ? team.members.length : 0), 0);
  const scores = teams.map(team => Number(team.metrics?.overallScore)).filter(Number.isFinite);
  const harmony = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : null;

  const now = new Date();
  const reportDate = `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;

  const projectName = p?.name || "No Project Selected";
  const projectDomain = p ? (p.type || p.domain || "Computer Science") : "—";
  const projectDesc = p?.description || "No project description available.";

  // The approval/signature names are always taken from the currently logged-in
  // administrator profile so the exported report reflects the account details
  // instead of leaving blank placeholders.
  const adminName = admin.name || "Administrator";
  const adminDesignation = admin.designation || "Project Coordinator & Faculty";
  const hodName = admin.hodName || "Head of Department";
  const deanName = admin.deanName || "Dean of Academic Affairs";
  const collegeName = admin.college || "Institution";

  const teamsRowsHtml = teams.length ? teams.map((team, index) => {
    const m = team.metrics || {};
    const members = Array.isArray(team.members) ? team.members : [];
    const teamName = `Team ${index + 1}`;
    const membersHtml = members.length ? members.map(mem => {
      const roll = escapeHtml(mem.rollNo || mem.roll_no || "—");
      const name = escapeHtml(mem.name || "Unnamed Student");
      const role = escapeHtml(mem.assignedRole || mem.preferredRole || "Project Member");
      const extraBits = [
        mem.branch ? escapeHtml(String(mem.branch)) : "",
        mem.section ? `Sec ${escapeHtml(String(mem.section))}` : "",
        (mem.cgpa !== undefined && mem.cgpa !== null && mem.cgpa !== "") ? `CGPA ${escapeHtml(String(mem.cgpa))}` : "",
        mem.experience ? escapeHtml(String(mem.experience)) : ""
      ].filter(Boolean).join(" • ");
      return `<div class="pdf-member-row">&bull; <strong>${roll}</strong> — ${name} <em>(${role})</em>${extraBits ? ` <span class="pdf-member-extra">[${extraBits}]</span>` : ""}</div>`;
    }).join("") : `<span class="pdf-muted">No students allocated</span>`;

    return `<tr>
      <td class="pdf-team-name">${teamName}<div class="pdf-muted-sm">${members.length} Members</div></td>
      <td>${membersHtml}</td>
      <td class="pdf-center">${m.skillBalance ?? "—"}${m.skillBalance !== undefined ? "%" : ""}</td>
      <td class="pdf-center">${m.preferenceMatch ?? "—"}${m.preferenceMatch !== undefined ? "%" : ""}</td>
      <td class="pdf-center">${m.experienceBalance ?? "—"}${m.experienceBalance !== undefined ? "%" : ""}</td>
      <td class="pdf-center pdf-overall">${m.overallScore ?? "—"}${m.overallScore !== undefined ? "%" : ""}</td>
    </tr>`;
  }).join("") : `<tr><td colspan="6" class="pdf-empty">No teams formed yet for the current project.</td></tr>`;

  const reportHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Team Overview Report - ${escapeHtml(projectName)}</title>
<style>
  @page { size: A4 portrait; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color:#0f172a; margin:0; padding:0; font-size:11pt; line-height:1.5; }
  h1 { margin:0; font-size:18pt; }
  .pdf-header { border-bottom:2.5px solid #0f172a; padding-bottom:14px; margin-bottom:20px; }
  .pdf-header .subtitle { color:#475569; font-size:9.5pt; margin-top:4px; }
  .pdf-meta-row { display:flex; justify-content:space-between; margin-top:12px; font-size:9.8pt; flex-wrap:wrap; gap:10px; }
  .pdf-badge { display:inline-block; border:1.3px solid #0f172a; border-radius:6px; padding:2px 9px; font-weight:700; font-size:9pt; }
  .pdf-section-title { font-size:11.5pt; font-weight:800; text-transform:uppercase; letter-spacing:.03em; border-bottom:1.3px solid #cbd5e1; padding-bottom:6px; margin:22px 0 10px; }
  table { width:100%; border-collapse:collapse; font-size:9pt; }
  th, td { border:1px solid #cbd5e1; padding:7px 8px; vertical-align:top; }
  th { background:#f1f5f9; text-align:left; font-weight:700; font-size:8.3pt; text-transform:uppercase; }
  tr:nth-child(even) td { background:#f8fafc; }
  .pdf-team-name { font-weight:800; white-space:nowrap; }
  .pdf-center { text-align:center; font-weight:700; }
  .pdf-overall { color:#1d4ed8; font-size:10pt; }
  .pdf-muted { color:#94a3b8; }
  .pdf-muted-sm { font-size:8pt; font-weight:400; color:#64748b; }
  .pdf-member-row { margin-bottom:4px; }
  .pdf-member-extra { color:#64748b; }
  .pdf-empty { text-align:center; color:#94a3b8; padding:24px; }
  .pdf-approval-section { margin-top:34px; page-break-inside:avoid; }
  .pdf-approval-block { border:1px solid #cbd5e1; border-radius:6px; padding:14px 16px; margin-bottom:14px; }
  .pdf-approval-block .pdf-role-title { font-weight:800; font-size:10.5pt; margin-bottom:8px; text-transform:uppercase; letter-spacing:.03em; }
  .pdf-approval-line { margin:9px 0; font-size:10pt; }
  .pdf-approval-line .pdf-fill { display:inline-block; min-width:240px; border-bottom:1px solid #334155; }
  .pdf-report-date { margin-top:22px; font-size:10.5pt; font-weight:700; }
</style>
</head>
<body>
  <div class="pdf-header">
    <h1>Academic Team Formation Overview</h1>
    <div class="subtitle">Auto-generated from live project and team-optimization data</div>
    <div class="pdf-meta-row">
      <div><strong>Project:</strong> ${escapeHtml(projectName)}<br><strong>Domain:</strong> ${escapeHtml(projectDomain)}</div>
      <div style="text-align:right;">
        <span class="pdf-badge">${teams.length} Teams Formed &bull; ${totalStudents} Students Allocated</span><br>
        <span style="font-size:9pt; color:#475569;">Team Harmony: ${harmony ? harmony + "%" : "—"}</span>
      </div>
    </div>
  </div>

  <div class="pdf-section-title">Project Information</div>
  <p style="font-size:10pt; color:#334155;">${escapeHtml(projectDesc)}</p>

  <div class="pdf-section-title">Teams Formed &mdash; ${escapeHtml(projectName)}</div>
  <table>
    <thead>
      <tr>
        <th style="width:13%;">Team</th>
        <th style="width:47%;">Allocated Student Members (Roll, Name, Role)</th>
        <th style="width:10%; text-align:center;">Skill Bal.</th>
        <th style="width:10%; text-align:center;">Role Match</th>
        <th style="width:10%; text-align:center;">Exp. Bal.</th>
        <th style="width:10%; text-align:center;">Overall</th>
      </tr>
    </thead>
    <tbody>${teamsRowsHtml}</tbody>
  </table>

  <div class="pdf-approval-section">
    <div class="pdf-section-title">Academic Approval</div>
    <div class="pdf-approval-block">
      <div class="pdf-role-title">HOD</div>
      <div class="pdf-approval-line">Name: <strong>${escapeHtml(hodName)}</strong></div>
      <div class="pdf-approval-line">Designation: Head of Department (${escapeHtml(admin.branch || admin.dept || "Department")})</div>
      <div class="pdf-approval-line">Signature: <span class="pdf-fill">&nbsp;</span></div>
    </div>
    <div class="pdf-approval-block">
      <div class="pdf-role-title">Project Coordinator / Admin</div>
      <div class="pdf-approval-line">Name: <strong>${escapeHtml(adminName)}</strong></div>
      <div class="pdf-approval-line">Designation: ${escapeHtml(adminDesignation)}</div>
      <div class="pdf-approval-line">Signature: <span class="pdf-fill">&nbsp;</span></div>
    </div>
    <div class="pdf-approval-block">
      <div class="pdf-role-title">Dean</div>
      <div class="pdf-approval-line">Name: <strong>${escapeHtml(deanName)}</strong></div>
      <div class="pdf-approval-line">Designation: Dean of Academic Affairs (${escapeHtml(collegeName)})</div>
      <div class="pdf-approval-line">Signature: <span class="pdf-fill">&nbsp;</span></div>
    </div>
    <div class="pdf-report-date">Date of Report: ${reportDate}</div>
  </div>
</body>
</html>`;

  const reportWindow = window.open("", "_blank", "width=900,height=1000");
  if (!reportWindow) {
    showToast("Please allow pop-ups for this site to generate the PDF report.", "error");
    return;
  }
  reportWindow.document.open();
  reportWindow.document.write(reportHtml);
  reportWindow.document.close();
  reportWindow.focus();

  const triggerPrint = () => {
    try { reportWindow.print(); } catch (err) { /* pop-up may already be closed */ }
  };
  if (reportWindow.document.readyState === "complete") {
    setTimeout(triggerPrint, 200);
  } else {
    reportWindow.onload = () => setTimeout(triggerPrint, 200);
  }
}

// ==========================================
// 18.1 TEAM HISTORY DASHBOARD
// ==========================================

let teamHistoryRecords = [];
let teamHistoryEventsBound = false;
let teamHistoryLoadToken = 0;

async function renderTeamHistoryView() {
  initTeamHistoryEvents();
  const listEl = document.getElementById("teamhistory-list");
  const countEl = document.getElementById("teamhistory-count");
  const loadToken = ++teamHistoryLoadToken;

  if (listEl) {
    listEl.innerHTML = `<div class="empty-state-desc" style="text-align:center; color: var(--text-muted); padding: 28px;">Loading team history...</div>`;
  }

  try {
    const res = await api.getTeamHistory();
    if (loadToken !== teamHistoryLoadToken) return; // a newer load superseded this one
    teamHistoryRecords = (res && Array.isArray(res.history)) ? res.history : [];
  } catch (err) {
    console.warn("Team History load warning:", err);
    if (loadToken !== teamHistoryLoadToken) return;
    teamHistoryRecords = [];
    if (listEl) {
      listEl.innerHTML = `<div class="empty-state-desc" style="text-align:center; color: var(--danger); padding: 28px;">Unable to load team history right now. Please try again.</div>`;
    }
    if (countEl) countEl.textContent = "0";
    return;
  }

  const searchInput = document.getElementById("teamhistory-search-input");
  renderTeamHistoryList(searchInput ? searchInput.value : "");
}

function renderTeamHistoryList(searchTerm = "") {
  const listEl = document.getElementById("teamhistory-list");
  const countEl = document.getElementById("teamhistory-count");
  if (!listEl) return;

  const term = (searchTerm || "").trim().toLowerCase();
  const records = term
    ? teamHistoryRecords.filter(r =>
        String(r.projectName || "").toLowerCase().includes(term) ||
        String(r.projectId || "").toLowerCase().includes(term))
    : teamHistoryRecords;

  if (countEl) countEl.textContent = String(teamHistoryRecords.length);

  if (!teamHistoryRecords.length) {
    listEl.innerHTML = `<div class="empty-state-desc" style="text-align:center; color: var(--text-muted); padding: 28px;">No team history yet. Generate optimal teams for a project (Team Optimization → Generate Optimal Teams) to see permanent records here.</div>`;
    return;
  }
  if (!records.length) {
    listEl.innerHTML = `<div class="empty-state-desc" style="text-align:center; color: var(--text-muted); padding: 28px;">No team history records match "${escapeHtml(searchTerm)}".</div>`;
    return;
  }

  listEl.innerHTML = records.map((rec, idx) => {
    const teams = Array.isArray(rec.teams) ? rec.teams : [];
    const teamsHtml = teams.map(team => {
      const membersHtml = (team.members || []).map(m => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:7px 10px; border-radius:var(--radius-sm); background:var(--bg-surface); margin-bottom:5px; border:1px solid var(--border-color); font-size:.82rem;">
          <div>
            <strong style="color:var(--text-primary);">${escapeHtml(m.name)}</strong>
            <span style="color:var(--text-muted);"> — ${escapeHtml(m.rollNo || "—")}</span>
            ${m.section ? `<span style="color:var(--text-muted);"> · ${escapeHtml(m.section)}</span>` : ""}
            ${m.branch ? `<span style="color:var(--text-muted);"> · ${escapeHtml(m.branch)}</span>` : ""}
            ${m.semester ? `<span style="color:var(--text-muted);"> · Sem ${escapeHtml(m.semester)}</span>` : ""}
          </div>
          <span class="badge badge-primary" style="font-size:.7rem;">${escapeHtml(m.assignedRole || m.preferredRole || "Core Contributor")}</span>
        </div>
      `).join("") || `<div style="font-size:.8rem; color:var(--text-muted);">No members recorded.</div>`;

      return `
        <div style="padding:12px; border:1px solid var(--border-color); border-radius:var(--radius-md); margin-bottom:10px; background:var(--bg-subtle);">
          <div style="font-weight:800; font-size:.9rem; color:var(--text-primary); margin-bottom:8px;">${escapeHtml(team.teamName)} <span style="font-weight:600; color:var(--text-muted); font-size:.76rem;">(${(team.members || []).length} members)</span></div>
          ${membersHtml}
        </div>
      `;
    }).join("");

    return `
      <div class="card teamhistory-record" style="padding:16px 18px;">
        <div class="teamhistory-record-header" data-idx="${idx}" style="display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap; cursor:pointer;">
          <div>
            <div style="font-weight:800; font-size:1rem; color:var(--text-primary);">${escapeHtml(rec.projectName)}</div>
            <div style="font-size:.78rem; color:var(--text-muted); margin-top:3px;">
              📅 ${escapeHtml(rec.generatedDate)} · 🕐 ${escapeHtml(rec.generatedTime)}
              ${rec.projectId ? ` · Project ID: ${escapeHtml(rec.projectId)}` : ""}
              ${rec.algorithm ? ` · ${escapeHtml(rec.algorithm)}` : ""}
            </div>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <span class="badge badge-primary">${rec.numTeams} Team${rec.numTeams === 1 ? "" : "s"}</span>
            <span class="badge badge-neutral">${rec.totalStudents} Student${rec.totalStudents === 1 ? "" : "s"}</span>
            <button type="button" class="btn btn-secondary teamhistory-delete-btn" data-history-id="${escapeHtml(rec.id)}" data-project-name="${escapeHtml(rec.projectName)}" title="Remove this record from Team History" style="padding:6px 10px; font-size:.75rem; white-space:nowrap;">
              🗑 Remove
            </button>
            <span class="teamhistory-toggle-icon" style="font-size:.9rem; color:var(--text-muted); transition:transform .15s;">▼</span>
          </div>
        </div>
        <div class="teamhistory-record-body" style="display:none; margin-top:14px; padding-top:14px; border-top:1px solid var(--border-color);">
          ${teamsHtml}
        </div>
      </div>
    `;
  }).join("");

  listEl.querySelectorAll(".teamhistory-record-header").forEach(header => {
    header.addEventListener("click", (event) => {
      // Clicking Remove must never toggle/expand the history record.
      if (event.target.closest(".teamhistory-delete-btn")) return;

      const body = header.parentElement.querySelector(".teamhistory-record-body");
      const icon = header.querySelector(".teamhistory-toggle-icon");
      if (!body) return;
      const isOpen = body.style.display !== "none";
      body.style.display = isOpen ? "none" : "block";
      if (icon) icon.style.transform = isOpen ? "rotate(0deg)" : "rotate(180deg)";
    });
  });

  listEl.querySelectorAll(".teamhistory-delete-btn").forEach(button => {
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();

      const historyId = button.dataset.historyId;
      const projectName = button.dataset.projectName || "this project";
      if (!historyId) return;

      const confirmed = window.confirm(
        `Remove "${projectName}" from Team History?\n\n` +
        `This removes only this saved Team History record. The actual project, students, generated teams, and other project data will remain unchanged.`
      );
      if (!confirmed) return;

      button.disabled = true;
      const originalText = button.innerHTML;
      button.innerHTML = "Removing…";

      try {
        await api.deleteTeamHistory(historyId);
        teamHistoryRecords = teamHistoryRecords.filter(r => String(r.id) !== String(historyId));

        const searchInput = document.getElementById("teamhistory-search-input");
        renderTeamHistoryList(searchInput ? searchInput.value : "");
      } catch (err) {
        console.error("Team History removal failed:", err);
        alert(err?.message || "Unable to remove this Team History record. Please try again.");
        button.disabled = false;
        button.innerHTML = originalText;
      }
    });
  });
}

function initTeamHistoryEvents() {
  if (teamHistoryEventsBound) return;
  teamHistoryEventsBound = true;
  const searchInput = document.getElementById("teamhistory-search-input");
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      renderTeamHistoryList(searchInput.value);
    });
  }
}

// ==========================================
// 19. GLOBAL NAVIGATION & SHORTCUTS
// ==========================================

function initGlobalNavigation() {
  document.querySelectorAll(".sidebar-nav .nav-item").forEach(item => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      const targetView = item.getAttribute("data-view");
      if (targetView) switchView(targetView);
    });
  });

  const quickGenNav = document.getElementById("btn-quick-generate-nav");
  if (quickGenNav) quickGenNav.addEventListener("click", () => switchView("optimizer"));

  const mainAddStudent = document.getElementById("btn-main-add-student");
  if (mainAddStudent) {
    mainAddStudent.addEventListener("click", () => {
      switchView("students");
      openStudentModal(null);
    });
  }

  const mainNewProj = document.getElementById("btn-main-new-project");
  if (mainNewProj) mainNewProj.addEventListener("click", () => switchView("project"));

  const quickCreateProj = document.getElementById("btn-quick-create-proj");
  if (quickCreateProj) quickCreateProj.addEventListener("click", () => switchView("project"));

  const quickAddStudent = document.getElementById("btn-quick-add-student");
  if (quickAddStudent) {
    quickAddStudent.addEventListener("click", () => {
      switchView("students");
      openStudentModal(null);
    });
  }

  const quickGenTeams = document.getElementById("btn-quick-gen-teams");
  if (quickGenTeams) quickGenTeams.addEventListener("click", () => switchView("optimizer"));

  const mainEditProj = document.getElementById("btn-main-edit-proj");
  if (mainEditProj) mainEditProj.addEventListener("click", () => switchView("project"));


  const resultsToExplain = document.getElementById("btn-results-to-explain");
  if (resultsToExplain) resultsToExplain.addEventListener("click", () => switchView("explain"));

  const resultsToReport = document.getElementById("btn-results-to-report");
  if (resultsToReport) resultsToReport.addEventListener("click", () => switchView("reports"));

  // Load sample dataset buttons
  const mainLoadSamples = document.getElementById("btn-main-load-samples");
  if (mainLoadSamples) {
    mainLoadSamples.addEventListener("click", () => {
      loadSampleProjectsAndCohort();
    });
  }

  const headerLoadSamples = document.getElementById("btn-header-sample-data");
  if (headerLoadSamples) {
    headerLoadSamples.addEventListener("click", () => {
      loadSampleProjectsAndCohort();
    });
  }

  const projLoadPresets = document.getElementById("btn-project-load-default-presets");
  if (projLoadPresets) {
    projLoadPresets.addEventListener("click", () => {
      loadDefaultPresets().then(() => renderProjectAnalysisView());
    });
  }
}

// ==========================================
// 20. SAMPLE DATASET COORDINATOR
// ==========================================

export async function loadSampleProjectsAndCohort() {
  // Use the same idempotent project loader for both demo and registered admin
  // accounts, then load the canonical sample student cohort. This prevents an
  // older global preset copy and a newer account-scoped copy from coexisting.
  if (state.isLoggedIn && state.currentAdmin?.role === "admin" && typeof api.loadSampleStudents === "function") {
    try {
      await loadDefaultPresets();
      await loadDefaultCohort();
      return;
    } catch (err) {
      console.error("Persistent sample dataset load failed:", err);
      showToast("Could not load the sample dataset. Please try again.", "error");
      return;
    }
  }

  // Offline/demo-preview fallback only. Replace the project catalog and
  // de-duplicate students by roll number so repeated clicks remain idempotent.
  state.projects = JSON.parse(JSON.stringify(PROJECT_PRESETS));
  state.activeProject = state.projects[0];
  state.teams = null;
  state.teamsByProject = {};
  state.lastResultMeta = null;
  const samples = JSON.parse(JSON.stringify(DEFAULT_STUDENTS));
  const byRoll = new Map((state.students || []).map(s => [String(s.rollNo || '').toUpperCase(), s]));
  for (const sample of samples) {
    const key = String(sample.rollNo || '').toUpperCase();
    const existing = byRoll.get(key);
    if (existing) Object.assign(existing, sample, { id: existing.id });
    else { state.students.push(sample); byRoll.set(key, sample); }
  }
  state.save();
  showToast("Curated 4 Capstone Projects & 20 Students loaded successfully!", "success");
  if (state.currentView === "main") renderMainDashboard();
  else if (state.currentView === "project") renderProjectAnalysisView();
  else if (state.currentView === "students") renderStudentsCohortView();
  else switchView(state.currentView || "main");
}

// ==========================================
// 20.1 ESCAPE HTML HELPER
// ==========================================

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ==========================================
// 20.2 STUDENT SKILL PORTFOLIO CONTROLLER
// ==========================================

let currentStudentSkills = [];

export async function renderMySkillsView() {
  const grid = document.getElementById("myskills-cards-grid");
  if (!grid) return;

  try {
    const res = await api.getStudentSkills();
    if (res && res.success) {
      currentStudentSkills = res.skills || [];
    }
  } catch (err) {
    console.error("Failed to fetch student skills:", err);
  }

  updateMySkillsKPIs();
  renderMySkillsList();
}

function updateMySkillsKPIs() {
  const countEl = document.getElementById("myskills-total-count");
  const highestProfEl = document.getElementById("myskills-highest-prof");
  const topSkillEl = document.getElementById("myskills-top-skill-name");
  const matchScoreEl = document.getElementById("myskills-project-match-score");
  const matchedCountEl = document.getElementById("myskills-matched-skills-count");
  const statusBadge = document.getElementById("myskills-status-badge");
  const assignedTeamEl = document.getElementById("myskills-assigned-team");
  const assignedRoleEl = document.getElementById("myskills-assigned-role");
  const simpleCountEl = document.getElementById("myskills-simple-count");

  const skills = currentStudentSkills;
  if (simpleCountEl) simpleCountEl.textContent = `${skills.length} skill${skills.length === 1 ? "" : "s"} saved`;
  if (countEl) countEl.textContent = skills.length;

  if (skills.length > 0) {
    const sorted = [...skills].sort((a, b) => (b.proficiency || 0) - (a.proficiency || 0));
    const top = sorted[0];
    if (highestProfEl) highestProfEl.textContent = `${top.proficiency || 0}/10`;
    if (topSkillEl) topSkillEl.textContent = top.skill_name || "-";
  } else {
    if (highestProfEl) highestProfEl.textContent = "0/10";
    if (topSkillEl) topSkillEl.textContent = "None added yet";
  }

  // Active Project Match calculation
  const activeProj = state.activeProject || (state.projects && state.projects[0]);
  if (activeProj && activeProj.requiredSkills && activeProj.requiredSkills.length > 0) {
    const studentSkillNames = new Set(skills.map(s => (s.skill_name || "").toLowerCase().trim()));
    const reqNames = activeProj.requiredSkills.map(r => (r.skill || r.name || "").toLowerCase().trim());
    let matchCount = 0;
    reqNames.forEach(rn => {
      if (studentSkillNames.has(rn)) matchCount++;
    });
    const matchPct = Math.round((matchCount / reqNames.length) * 100);
    if (matchScoreEl) matchScoreEl.textContent = `${matchPct}%`;
    if (matchedCountEl) matchedCountEl.textContent = `${matchCount} of ${reqNames.length} skills matched for "${activeProj.title || 'Active Project'}"`;
  } else {
    if (matchScoreEl) matchScoreEl.textContent = "N/A";
    if (matchedCountEl) matchedCountEl.textContent = "No active project criteria";
  }

  // Check assignment status from state.students
  const currentStudentObj = (state.students || []).find(s =>
    s.email?.toLowerCase() === state.currentAdmin?.email?.toLowerCase() ||
    s.name?.toLowerCase() === state.currentAdmin?.name?.toLowerCase()
  );

  if (currentStudentObj && currentStudentObj.assignmentStatus === "Assigned") {
    if (statusBadge) {
      statusBadge.className = "metric-badge success";
      statusBadge.textContent = "Assigned";
    }
    if (assignedTeamEl) assignedTeamEl.textContent = `Team #${currentStudentObj.assignedTeamId || '1'}`;
    if (assignedRoleEl) assignedRoleEl.textContent = currentStudentObj.assignedRole || "Core Developer";
  } else {
    if (statusBadge) {
      statusBadge.className = "metric-badge warning";
      statusBadge.textContent = "Available";
    }
    if (assignedTeamEl) assignedTeamEl.textContent = "Candidate Pool";
    if (assignedRoleEl) assignedRoleEl.textContent = "Ready for Optimization";
  }
}

function renderMySkillsList() {
  const grid = document.getElementById("myskills-cards-grid");
  if (!grid) return;

  const searchVal = (document.getElementById("myskills-search-input")?.value || "").toLowerCase().trim();
  const sortVal = document.getElementById("myskills-sort-select")?.value || "prof-desc";

  let filtered = currentStudentSkills.filter(s => {
    if (!searchVal) return true;
    return (s.skill_name || "").toLowerCase().includes(searchVal) ||
      (s.category || "").toLowerCase().includes(searchVal) ||
      (s.evidence || "").toLowerCase().includes(searchVal);
  });

  if (sortVal === "prof-desc") {
    filtered.sort((a, b) => (b.proficiency || 0) - (a.proficiency || 0));
  } else if (sortVal === "prof-asc") {
    filtered.sort((a, b) => (a.proficiency || 0) - (b.proficiency || 0));
  } else if (sortVal === "name-asc") {
    filtered.sort((a, b) => (a.skill_name || "").localeCompare(b.skill_name || ""));
  }

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 48px 20px; background: var(--bg-surface); border-radius: var(--radius-md); border: 1px dashed var(--border-color);">
        <div style="font-size: 2.2rem; margin-bottom: 10px;">🎯</div>
        <h4 style="color: var(--text-primary); margin-bottom: 6px;">No Skills Found</h4>
        <p style="color: var(--text-muted); font-size: 0.88rem; max-width: 440px; margin: 0 auto 16px auto;">
          ${searchVal ? 'No skills matched your search keyword.' : 'You have not added any skills to your portfolio yet. Add your verified competencies to enable optimal team formation.'}
        </p>
        <button class="btn btn-primary btn-sm" id="btn-empty-add-skill">
          <span>➕</span> Add Skill to Portfolio
        </button>
      </div>
    `;
    const emptyAdd = document.getElementById("btn-empty-add-skill");
    if (emptyAdd) emptyAdd.addEventListener("click", () => openMySkillModal(null));
    return;
  }

  const activeProj = state.activeProject || (state.projects && state.projects[0]);
  const reqSkillsSet = new Set((activeProj?.requiredSkills || []).map(r => (r.name || "").toLowerCase().trim()));

  grid.innerHTML = filtered.map(skill => {
    const prof = skill.proficiency || 5;
    const pct = prof * 10;
    const isRequired = reqSkillsSet.has((skill.skill_name || "").toLowerCase().trim());
    const profColor = prof >= 8 ? "var(--success)" : (prof >= 5 ? "var(--primary)" : "var(--warning)");
    const profLabel = prof >= 8 ? "Advanced / Expert" : (prof >= 5 ? "Intermediate" : "Beginner");

    return `
      <div class="card skill-portfolio-card" style="display: flex; flex-direction: column; justify-content: space-between; border-top: 3px solid ${profColor};">
        <div>
          <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin-bottom: 8px;">
            <div>
              <h3 style="font-size: 1.05rem; font-weight: 700; color: var(--text-primary); margin: 0 0 4px 0;">
                ${escapeHtml(skill.skill_name)}
              </h3>
              <span class="badge" style="background: rgba(37, 99, 235, 0.1); color: var(--primary); font-size: 0.72rem; padding: 2px 8px;">
                ${escapeHtml(skill.category || "Technical")}
              </span>
            </div>
            <div style="text-align: right;">
              <span style="font-size: 1.15rem; font-weight: 800; color: ${profColor};">${prof}/10</span>
              <div style="font-size: 0.7rem; color: var(--text-muted);">${profLabel}</div>
            </div>
          </div>

          <div style="background: var(--bg-subtle); height: 6px; border-radius: 999px; overflow: hidden; margin: 12px 0 10px 0;">
            <div style="background: ${profColor}; width: ${pct}%; height: 100%; border-radius: 999px; transition: width 0.4s ease;"></div>
          </div>

          ${isRequired ? `
            <div style="display: inline-flex; align-items: center; gap: 4px; font-size: 0.72rem; color: var(--success); font-weight: 700; background: rgba(16, 185, 129, 0.1); padding: 3px 8px; border-radius: 4px; margin-bottom: 10px;">
              <span>✓</span> Matched with Active Project
            </div>
          ` : ''}

          ${skill.evidence ? `
            <div style="font-size: 0.78rem; color: var(--text-secondary); background: var(--bg-subtle); padding: 8px 10px; border-radius: 6px; margin-top: 6px; line-height: 1.4;">
              <strong style="color: var(--text-primary);">Proof / Evidence:</strong> ${escapeHtml(skill.evidence)}
            </div>
          ` : ''}
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--border-color);">
          <button type="button" class="btn btn-secondary btn-sm btn-edit-my-skill" data-skill="${escapeHtml(skill.skill_name)}" data-prof="${prof}" data-cat="${escapeHtml(skill.category || '')}" data-ev="${escapeHtml(skill.evidence || '')}" style="font-size: 0.75rem; padding: 4px 10px;">
            <span>✏️</span> Edit
          </button>
          <button type="button" class="btn btn-danger btn-sm btn-delete-my-skill" data-skill="${escapeHtml(skill.skill_name)}" style="font-size: 0.75rem; padding: 4px 10px;">
            <span>🗑️</span> Remove
          </button>
        </div>
      </div>
    `;
  }).join("");

  grid.querySelectorAll(".btn-edit-my-skill").forEach(btn => {
    btn.addEventListener("click", () => {
      openMySkillModal({
        name: btn.getAttribute("data-skill"),
        proficiency: parseInt(btn.getAttribute("data-prof"), 10) || 5,
        category: btn.getAttribute("data-cat") || "Technical",
        evidence: btn.getAttribute("data-ev") || ""
      });
    });
  });

  grid.querySelectorAll(".btn-delete-my-skill").forEach(btn => {
    btn.addEventListener("click", async () => {
      const skillName = btn.getAttribute("data-skill");
      if (!confirm(`Are you sure you want to remove "${skillName}" from your portfolio?`)) return;
      try {
        await api.deleteStudentSkill(skillName);
        showToast(`"${skillName}" removed from portfolio.`, "info");
        await renderMySkillsView();
      } catch (err) {
        showToast(`Failed to delete skill: ${err.message}`, "error");
      }
    });
  });
}

function openMySkillModal(existing) {
  const modal = document.getElementById("modal-my-skill");
  if (!modal) return;

  const titleEl = document.getElementById("my-skill-modal-title");
  const nameInp = document.getElementById("my-skill-name-input");
  const slider = document.getElementById("my-skill-prof-slider");
  const valDisplay = document.getElementById("my-skill-prof-val-display");
  if (existing) {
    if (titleEl) titleEl.innerHTML = `<span>✏️</span> Edit Portfolio Skill`;
    if (nameInp) {
      nameInp.value = existing.name;
      nameInp.disabled = true;
    }
    if (slider) slider.value = existing.proficiency || 8;
    if (valDisplay) valDisplay.textContent = `${existing.proficiency || 8}/10`;
  } else {
    if (titleEl) titleEl.innerHTML = `<span>➕</span> Add Skill to Portfolio`;
    if (nameInp) {
      nameInp.value = "";
      nameInp.disabled = false;
      nameInp.focus();
    }
    if (slider) slider.value = 8;
    if (valDisplay) valDisplay.textContent = "8/10";
  }

  modal.classList.add("active");
  modal.setAttribute("aria-hidden", "false");
  // Focus after the overlay transition so a newly-created student can immediately type.
  window.setTimeout(() => {
    if (nameInp && !nameInp.disabled) {
      nameInp.focus({ preventScroll: true });
      nameInp.select();
    }
  }, 30);
}

function closeMySkillModal() {
  const modal = document.getElementById("modal-my-skill");
  if (modal) {
    modal.classList.remove("active");
    modal.setAttribute("aria-hidden", "true");
  }
}

export function initMySkillsEvents() {
  const openBtn = document.getElementById("btn-open-add-my-skill");
  if (openBtn) {
    openBtn.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      openMySkillModal(null);
    };
  }

  // Delegated fallback: keeps Add Skill working even if the view is re-rendered.
  // This is intentionally scoped to the exact button and does not affect other clicks.
  if (!window.__skillMatchAddSkillDelegated) {
    document.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target.closest("#btn-open-add-my-skill") : null;
      if (!target) return;
      event.preventDefault();
      event.stopPropagation();
      openMySkillModal(null);
    }, true);
    window.__skillMatchAddSkillDelegated = true;
  }

  const closeBtn = document.getElementById("close-my-skill-modal");
  if (closeBtn) closeBtn.addEventListener("click", closeMySkillModal);

  const cancelBtn = document.getElementById("btn-cancel-my-skill-modal");
  if (cancelBtn) cancelBtn.addEventListener("click", closeMySkillModal);

  const skillModal = document.getElementById("modal-my-skill");
  if (skillModal && !skillModal.dataset.bound) {
    skillModal.addEventListener("click", (event) => {
      if (event.target === skillModal) closeMySkillModal();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && skillModal.classList.contains("active")) {
        closeMySkillModal();
      }
    });
    skillModal.dataset.bound = "true";
  }

  const slider = document.getElementById("my-skill-prof-slider");
  const valDisplay = document.getElementById("my-skill-prof-val-display");
  if (slider && valDisplay) {
    slider.addEventListener("input", () => {
      valDisplay.textContent = `${slider.value}/10`;
    });
  }

  const form = document.getElementById("form-my-skill");
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const nameInp = document.getElementById("my-skill-name-input");
      const skillName = nameInp ? nameInp.value.trim() : "";
      const proficiency = slider ? parseInt(slider.value, 10) : 8;
      if (!skillName) {
        showToast("Please enter a skill name.", "warning");
        return;
      }

      try {
        const payload = {
          skill_name: skillName,
          category: "Technical",
          proficiency: proficiency,
          evidence: ""
        };
        const res = await api.saveStudentSkill(payload);
        if (res && res.success) {
          showToast(`Skill "${skillName}" saved to your portfolio!`, "success");
          closeMySkillModal();
          await renderMySkillsView();
        } else {
          showToast(res?.error || "Failed to save skill.", "error");
        }
      } catch (err) {
        showToast(`Error saving skill: ${err.message}`, "error");
      }
    });
  }

  const searchInput = document.getElementById("myskills-search-input");
  if (searchInput) searchInput.addEventListener("input", renderMySkillsList);

  const sortSelect = document.getElementById("myskills-sort-select");
  if (sortSelect) sortSelect.addEventListener("change", renderMySkillsList);
}

// ==========================================
// 20.3 PROJECT CATALOG CONTROLLER
// ==========================================

let catalogFilterDomain = "all";

export function renderProjectCatalogView() {
  const grid = document.getElementById("catalog-cards-grid");
  if (!grid) return;

  const projects = (state.projects && state.projects.length > 0) ? state.projects : PROJECT_PRESETS;
  const searchVal = (document.getElementById("catalog-search-input")?.value || "").toLowerCase().trim();

  let filtered = projects.filter(p => {
    if (catalogFilterDomain !== "all") {
      const pDom = (p.domain || "").toLowerCase();
      if (!pDom.includes(catalogFilterDomain.toLowerCase())) return false;
    }
    if (searchVal) {
      const inTitle = (p.title || "").toLowerCase().includes(searchVal);
      const inDesc = (p.description || "").toLowerCase().includes(searchVal);
      const inSkills = (p.requiredSkills || []).some(s => (s.name || "").toLowerCase().includes(searchVal));
      if (!inTitle && !inDesc && !inSkills) return false;
    }
    return true;
  });

  const countEl = document.getElementById("catalog-filtered-count");
  if (countEl) countEl.textContent = filtered.length;

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 48px 20px; background: var(--bg-surface); border-radius: var(--radius-md); border: 1px dashed var(--border-color);">
        <div style="font-size: 2.2rem; margin-bottom: 10px;">🔍</div>
        <h4 style="color: var(--text-primary); margin-bottom: 6px;">No Projects Match Your Filter</h4>
        <p style="color: var(--text-muted); font-size: 0.88rem;">Try selecting "All Domains" or clearing the search keyword.</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = filtered.map(p => {
    const reqCount = (p.requiredSkills || []).length;
    const teamSize = p.teamSize || 4;
    const domain = p.domain || "Computer Science";

    return `
      <div class="card project-catalog-card" style="display: flex; flex-direction: column; justify-content: space-between; transition: transform 0.2s, box-shadow 0.2s;">
        <div>
          <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; margin-bottom: 12px;">
            <span class="badge" style="background: rgba(37, 99, 235, 0.12); color: var(--primary); font-weight: 700; font-size: 0.75rem; padding: 3px 10px; border-radius: 999px;">
              📁 ${escapeHtml(domain)}
            </span>
            <span class="badge" style="background: rgba(16, 185, 129, 0.12); color: var(--success); font-weight: 700; font-size: 0.72rem; padding: 3px 8px; border-radius: 6px;">
              👥 Team of ${teamSize}
            </span>
          </div>

          <h3 style="font-size: 1.15rem; font-weight: 800; color: var(--text-primary); margin: 0 0 8px 0; line-height: 1.4;">
            ${escapeHtml(p.title)}
          </h3>

          <p style="font-size: 0.83rem; color: var(--text-secondary); line-height: 1.5; margin: 0 0 16px 0; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;">
            ${escapeHtml(p.description || "Capstone engineering project specification.")}
          </p>

          <div style="margin-bottom: 16px;">
            <div style="font-size: 0.75rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">
              Required Competencies (${reqCount}):
            </div>
            <div style="display: flex; flex-wrap: wrap; gap: 6px;">
              ${(p.requiredSkills || []).slice(0, 6).map(s => `
                <span style="font-size: 0.72rem; background: var(--bg-subtle); color: var(--text-primary); padding: 3px 8px; border-radius: 4px; border: 1px solid var(--border-color); font-weight: 600;">
                  ${escapeHtml(s.name || s)}
                </span>
              `).join("")}
              ${reqCount > 6 ? `<span style="font-size: 0.72rem; color: var(--text-muted); padding: 3px 6px;">+${reqCount - 6} more</span>` : ''}
            </div>
          </div>
        </div>

        <div style="display: flex; gap: 8px; margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--border-color); flex-wrap: wrap;">
          <button type="button" class="btn btn-secondary btn-sm btn-catalog-details" data-id="${p.id}" style="flex: 1; font-size: 0.78rem;">
            <span>📋</span> Details
          </button>
          <button type="button" class="btn btn-secondary btn-sm btn-catalog-analyze" data-id="${p.id}" style="flex: 1; font-size: 0.78rem;">
            <span>🔍</span> Analyze
          </button>
          <button type="button" class="btn btn-primary btn-sm btn-catalog-form" data-id="${p.id}" style="flex: 1; font-size: 0.78rem; font-weight: 700;">
            <span>⚡</span> Form Team
          </button>
        </div>
      </div>
    `;
  }).join("");

  grid.querySelectorAll(".btn-catalog-details").forEach(btn => {
    btn.addEventListener("click", () => {
      const pId = btn.getAttribute("data-id");
      const proj = projects.find(x => x.id === pId);
      if (proj) openProjectDetailsModal(proj);
    });
  });

  grid.querySelectorAll(".btn-catalog-analyze").forEach(btn => {
    btn.addEventListener("click", () => {
      const pId = btn.getAttribute("data-id");
      const proj = projects.find(x => x.id === pId);
      if (proj) {
        state.activeProject = proj;
        state.teams = (state.teamsByProject && state.teamsByProject[proj.id]) || null;
        state.lastResultMeta = state.teams ? state.lastResultMeta : null;
        state.save();
        switchView("project");
        showToast(`Loaded "${proj.title}" into Requirement Analyzer.`, "info");
      }
    });
  });

  grid.querySelectorAll(".btn-catalog-form").forEach(btn => {
    btn.addEventListener("click", () => {
      const pId = btn.getAttribute("data-id");
      const proj = projects.find(x => x.id === pId);
      if (proj) {
        state.activeProject = proj;
        state.teams = (state.teamsByProject && state.teamsByProject[proj.id]) || null;
        state.lastResultMeta = state.teams ? state.lastResultMeta : null;
        state.save();
        switchView("optimizer");
        showToast(`Selected "${proj.title}" for Team Optimization.`, "info");
      }
    });
  });
}

let activeCatalogProject = null;

function openProjectDetailsModal(project) {
  activeCatalogProject = project;
  const modal = document.getElementById("modal-project-details");
  if (!modal) return;

  const titleEl = document.getElementById("catalog-details-title");
  const bodyEl = document.getElementById("catalog-details-body");

  if (titleEl) {
    titleEl.innerHTML = `<span>📋</span> ${escapeHtml(project.title)}`;
  }

  if (bodyEl) {
    bodyEl.innerHTML = `
      <div style="margin-bottom: 16px;">
        <div style="display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap;">
          <span class="badge" style="background: rgba(37, 99, 235, 0.12); color: var(--primary); font-weight: 700; font-size: 0.78rem; padding: 4px 10px; border-radius: 999px;">
            Domain: ${escapeHtml(project.domain || "Computer Science")}
          </span>
          <span class="badge" style="background: rgba(16, 185, 129, 0.12); color: var(--success); font-weight: 700; font-size: 0.78rem; padding: 4px 10px; border-radius: 999px;">
            Target Team Size: ${project.teamSize || 4} Students
          </span>
          <span class="badge" style="background: rgba(245, 158, 11, 0.12); color: var(--warning); font-weight: 700; font-size: 0.78rem; padding: 4px 10px; border-radius: 999px;">
            Complexity: ${escapeHtml(project.difficulty || "Advanced Capstone")}
          </span>
        </div>
        <p style="font-size: 0.88rem; color: var(--text-secondary); line-height: 1.6; margin-bottom: 16px;">
          ${escapeHtml(project.description || "Academic Capstone Project Specification")}
        </p>
      </div>

      <h4 style="font-size: 0.95rem; font-weight: 700; color: var(--text-primary); margin-bottom: 10px;">
        Required Competencies & Importance Weights:
      </h4>
      <div class="table-container" style="margin-bottom: 16px;">
        <table class="data-table" style="font-size: 0.82rem;">
          <thead>
            <tr>
              <th>Competency Name</th>
              <th>Category</th>
              <th>Weight / Priority</th>
              <th>Min Required %</th>
            </tr>
          </thead>
          <tbody>
            ${(project.requiredSkills || []).map(s => `
              <tr>
                <td style="font-weight: 700; color: var(--text-primary);">${escapeHtml(s.name || s)}</td>
                <td><span class="badge" style="background: var(--bg-subtle); color: var(--text-muted);">${escapeHtml(s.category || "Technical")}</span></td>
                <td><span style="font-weight: 700; color: var(--primary);">${s.weight || 1.0}x</span></td>
                <td><strong>${s.minScore || 60}%</strong></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  modal.classList.add("active");
}

function closeProjectDetailsModal() {
  const modal = document.getElementById("modal-project-details");
  if (modal) modal.classList.remove("active");
}

export function initCatalogEvents() {
  const domainPills = document.querySelectorAll("#catalog-domain-pills .domain-pill");
  domainPills.forEach(pill => {
    pill.addEventListener("click", () => {
      domainPills.forEach(p => p.classList.remove("active"));
      pill.classList.add("active");
      catalogFilterDomain = pill.getAttribute("data-domain") || "all";
      renderProjectCatalogView();
    });
  });

  const searchInput = document.getElementById("catalog-search-input");
  if (searchInput) searchInput.addEventListener("input", renderProjectCatalogView);

  const closeBtn = document.getElementById("close-catalog-details-modal");
  if (closeBtn) closeBtn.addEventListener("click", closeProjectDetailsModal);

  const closeFooterBtn = document.getElementById("btn-close-catalog-details");
  if (closeFooterBtn) closeFooterBtn.addEventListener("click", closeProjectDetailsModal);

  const analyzeBtn = document.getElementById("btn-catalog-details-analyze");
  if (analyzeBtn) {
    analyzeBtn.addEventListener("click", () => {
      if (activeCatalogProject) {
        state.activeProject = activeCatalogProject;
        state.teams = (state.teamsByProject && state.teamsByProject[activeCatalogProject.id]) || null;
        state.lastResultMeta = state.teams ? state.lastResultMeta : null;
        state.save();
        closeProjectDetailsModal();
        switchView("project");
        showToast(`Loaded "${activeCatalogProject.title}" into Requirement Analyzer.`, "info");
      }
    });
  }

  const formTeamBtn = document.getElementById("btn-catalog-details-form-team");
  if (formTeamBtn) {
    formTeamBtn.addEventListener("click", () => {
      if (activeCatalogProject) {
        state.activeProject = activeCatalogProject;
        state.teams = (state.teamsByProject && state.teamsByProject[activeCatalogProject.id]) || null;
        state.lastResultMeta = state.teams ? state.lastResultMeta : null;
        state.save();
        closeProjectDetailsModal();
        switchView("optimizer");
        showToast(`Selected "${activeCatalogProject.title}" for Team Optimization.`, "info");
      }
    });
  }
}

// ==========================================
// 21. BOOTSTRAP INITIALIZATION
// ==========================================

// Attach to window for interactive inline triggers
window.SkillMatch = {
  state,
  switchView,
  showToast,
  loadDefaultPresets,
  loadDefaultCohort,
  loadSampleProjectsAndCohort
};

document.addEventListener("DOMContentLoaded", async () => {
  try {
    initTheme();
    initAuthFlow();
    initDemoChoiceModal();
    initTeacherModal();
    initGlobalNavigation();
    initProjectAnalysisEvents();
    initStudentCohortEvents();
    initOptimizerEvents();
    initResultsEvents();
    initExplainEvents();
    initAlgoBenchmarkEvents();
    initReportsEvents();
    initStorageManagementEvents();
    initPWAEvents();
    initMySkillsEvents();

    const authOverlay = document.getElementById("auth-view");
    const tabLogin = document.getElementById("tab-auth-login");

    // Restore the authenticated coordinator/session after a normal browser reload.
    // Do not clear the token, active account, workspace, current view or team data.
    await state.initSession();

    if (state.isLoggedIn && state.currentAdmin) {
      if (authOverlay) authOverlay.classList.add("hidden");
      updateAdminUI();
      switchView(state.currentView || "main");
    } else {
      if (authOverlay) authOverlay.classList.remove("hidden");
      if (tabLogin) tabLogin.click();
    }

    // Restore storage status badge
    updateStorageStatusIndicator();

    // Persist any last-minute changes before Chrome reloads/closes the page.
    const persistBeforePageExit = () => {
      if (state && state.isLoggedIn && state.currentAdmin) {
        state.save();
      }
    };
    window.addEventListener("beforeunload", persistBeforePageExit);
    window.addEventListener("pagehide", persistBeforePageExit);
  } catch (err) {
    console.error("Initialization error in SkillMatch AI:", err);
  }
});
