// SkillMatch AI — Frontend REST API Client
// Connects UI actions to the persistent SQLite backend server.

const API_BASE = "";

class ApiClient {
  constructor() {
    this.token = localStorage.getItem("skillmatch_auth_token") || null;
    // Serialize workspace writes so an autosave can never race a project delete.
    this._workspaceSaveQueue = Promise.resolve();
  }

  setToken(token) {
    this.token = token;
    if (token) {
      localStorage.setItem("skillmatch_auth_token", token);
    } else {
      localStorage.removeItem("skillmatch_auth_token");
    }
  }

  getToken() {
    return this.token || localStorage.getItem("skillmatch_auth_token");
  }

  async request(endpoint, options = {}) {
    const headers = {
      "Content-Type": "application/json",
      ...(options.headers || {})
    };

    const token = this.getToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    try {
      const response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers
      });

      const data = await response.json();
      if (!response.ok) {
        const error = new Error(data.error || `HTTP error ${response.status}`);
        error.status = response.status;
        error.data = data;
        error.alreadyRegistered = Boolean(data.alreadyRegistered);
        error.notRegistered = Boolean(data.notRegistered);
        error.wrongPassword = Boolean(data.wrongPassword);
        throw error;
      }
      return data;
    } catch (err) {
      console.error(`API Error [${endpoint}]:`, err);
      throw err;
    }
  }

  // Auth Endpoints
  async register(userData) {
    const res = await this.request("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(userData)
    });
    if (res.token) {
      this.setToken(res.token);
    }
    return res;
  }

  async login(email, password) {
    const res = await this.request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
    if (res.token) {
      this.setToken(res.token);
    }
    return res;
  }

  async demoLogin() {
    const res = await this.request("/api/auth/demo-login", {
      method: "POST",
      body: JSON.stringify({})
    });
    if (res.token) {
      this.setToken(res.token);
    }
    return res;
  }

  async studentDemoLogin() {
    const res = await this.request("/api/auth/student-demo-login", {
      method: "POST",
      body: JSON.stringify({})
    });
    if (res.token) {
      this.setToken(res.token);
    }
    return res;
  }

  async getMe() {
    return await this.request("/api/auth/me");
  }

  async logout() {
    try {
      await this.request("/api/auth/logout", { method: "POST" });
    } catch (_) {}
    this.setToken(null);
  }

  async updateProfile(profileData) {
    return await this.request("/api/auth/profile", {
      method: "POST",
      body: JSON.stringify(profileData)
    });
  }

  // Student Individual Skill Portfolio
  async getStudentSkills() {
    return await this.request("/api/student/skills");
  }

  async saveStudentSkill(skillData) {
    return await this.request("/api/student/skills", {
      method: "POST",
      body: JSON.stringify(skillData)
    });
  }

  async deleteStudentSkill(skillName) {
    return await this.request(`/api/student/skills/${encodeURIComponent(skillName)}`, {
      method: "DELETE"
    });
  }

  // Workspace & Demo Choice
  async getWorkspace() {
    return await this.request("/api/workspace");
  }

  async setDemoChoice(choice) {
    return await this.request("/api/workspace/demo-choice", {
      method: "POST",
      body: JSON.stringify({ choice })
    });
  }

  async saveWorkspace(workspaceData) {
    // Serialize workspace writes. The UI calls save() frequently, and concurrent
    // SQLite writers were the direct cause of intermittent "database is locked"
    // failures when Remove Project was clicked during an autosave.
    const run = () => this.request("/api/workspace", {
      method: "POST",
      body: JSON.stringify(workspaceData)
    });
    const next = this._workspaceSaveQueue.catch(() => {}).then(run);
    this._workspaceSaveQueue = next.catch(() => {});
    return await next;
  }

  async flushWorkspaceSaves() {
    // Wait until every previously queued workspace write has completed before
    // a destructive/normalizing operation such as loading the sample cohort.
    // Without this barrier, an older localStorage snapshot could arrive after
    // the backend cleanup and recreate the 20 legacy sample rows.
    await this._workspaceSaveQueue.catch(() => {});
  }

  // Projects
  async saveProject(projectData) {
    return await this.request("/api/projects", {
      method: "POST",
      body: JSON.stringify(projectData)
    });
  }

  async deleteProject(projectId) {
    // Let any already-queued autosave finish before taking the delete write lock.
    await this._workspaceSaveQueue.catch(() => {});
    return await this.request(`/api/projects/${encodeURIComponent(String(projectId))}`, {
      method: "DELETE"
    });
  }

  // Students
  async getAdminCohortStudents() {
    return await this.request("/api/admin/cohort-students");
  }

  async loadSampleStudents() {
    return await this.request("/api/admin/cohort/load-sample-students", {
      method: "POST",
      body: JSON.stringify({})
    });
  }

  async saveStudent(studentData) {
    return await this.request("/api/students", {
      method: "POST",
      body: JSON.stringify(studentData)
    });
  }

  async deleteStudent(studentId) {
    return await this.request(`/api/students/${studentId}`, {
      method: "DELETE"
    });
  }

  async adminSaveStudentSkill(studentId, skillData) {
    return await this.request(`/api/admin/students/${encodeURIComponent(studentId)}/skills`, {
      method: "POST",
      body: JSON.stringify(skillData)
    });
  }

  async adminDeleteStudentSkill(studentId, skillName) {
    return await this.request(`/api/admin/students/${encodeURIComponent(studentId)}/skills/${encodeURIComponent(skillName)}`, { method: "DELETE" });
  }

  async analyzeCohortRoles() {
    return await this.request("/api/admin/cohort/analyze-roles", { method: "POST", body: JSON.stringify({}) });
  }

  // Teams & Assignment Tracking
  async generateTeamsBackend(projectId, teamSize, algorithm = "greedy_set_cover") {
    return await this.request("/api/teams/generate", {
      method: "POST",
      body: JSON.stringify({ projectId, teamSize, algorithm })
    });
  }

  async saveTeams(projectId, teams, algorithm) {
    return await this.request("/api/teams/save", {
      method: "POST",
      body: JSON.stringify({ projectId, teams, algorithm })
    });
  }

  async releaseProjectAssignments(projectId) {
    return await this.request(`/api/teams/release/${projectId}`, {
      method: "POST"
    });
  }

  // Team History
  async getTeamHistory(search = "") {
    const qs = search ? `?search=${encodeURIComponent(search)}` : "";
    return await this.request(`/api/team-history${qs}`);
  }

  async deleteTeamHistory(historyId) {
    return await this.request(`/api/team-history/${encodeURIComponent(historyId)}`, {
      method: "DELETE"
    });
  }

  // Reports
  async getReport(projectId) {
    return await this.request(`/api/reports/${projectId}`);
  }

  async saveReport(reportData) {
    return await this.request("/api/reports", {
      method: "POST",
      body: JSON.stringify(reportData)
    });
  }

  // Student NLP Extraction
  async extractStudentSkills(profilePayload) {
    return await this.request("/api/students/extract-skills", {
      method: "POST",
      body: JSON.stringify(profilePayload)
    });
  }
}

export const api = new ApiClient();
