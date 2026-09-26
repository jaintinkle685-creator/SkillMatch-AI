import json
import time
import urllib.request
import urllib.error
import sqlite3
import sys

BASE_URL = "http://127.0.0.1:8000"

def req(path, method="GET", data=None, token=None):
    url = f"{BASE_URL}{path}"
    headers = {}
    body = None
    if data is not None:
        headers["Content-Type"] = "application/json"
        body = json.dumps(data).encode("utf-8")
    if token:
        headers["Authorization"] = f"Bearer {token}"
    r = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r) as resp:
            resp_body = resp.read().decode("utf-8")
            return resp.status, json.loads(resp_body) if (resp_body.startswith("{") or resp_body.startswith("[")) else resp_body
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8")
        return e.code, json.loads(err_body) if (err_body.startswith("{") or err_body.startswith("[")) else err_body

print("=" * 70)
print("   AOA CAPSTONE SYSTEM — END-TO-END VERIFICATION & AUDIT SUITE    ")
print("=" * 70)

# TEST 1: Unauthenticated access protection
print("\n--- [TEST 1] Unauthenticated Access Protection ---")
status, res = req("/api/auth/me")
assert status == 401, f"Expected 401 for unauthenticated /api/auth/me, got {status}: {res}"
print("[PASS] 1.1 Unauthenticated /api/auth/me returns 401 Unauthorized")

status, res = req("/api/admin/users")
assert status == 401, f"Expected 401 for unauthenticated /api/admin/users, got {status}: {res}"
print("[PASS] 1.2 Unauthenticated /api/admin/users returns 401 Unauthorized")

status, res = req("/api/student/skills")
assert status == 401, f"Expected 401 for unauthenticated /api/student/skills, got {status}: {res}"
print("[PASS] 1.3 Unauthenticated /api/student/skills returns 401 Unauthorized")

# TEST 2: Demo Logins (Student & Coordinator)
print("\n--- [TEST 2] Demo Logins (Student & Coordinator) ---")
status, student_login = req("/api/auth/student-demo-login", method="POST", data={})
assert status == 200, f"Student demo login failed: {student_login}"
student_token = student_login["token"]
student_user = student_login["user"]
assert student_user["role"] == "student", f"Expected role='student', got {student_user['role']}"
assert "Aarav Sharma" in student_user["name"], f"Expected Aarav Sharma, got {student_user['name']}"
print(f"[PASS] 2.1 Demo Student Login: {student_user['name']} (Role: {student_user['role']}, Roll: {student_user.get('rollNo')})")

status, admin_login = req("/api/auth/demo-login", method="POST", data={})
assert status == 200, f"Admin demo login failed: {admin_login}"
admin_token = admin_login["token"]
admin_user = admin_login["user"]
assert admin_user["role"] == "admin", f"Expected role='admin', got {admin_user['role']}"
print(f"[PASS] 2.2 Demo Coordinator Login: {admin_user['name']} (Role: {admin_user['role']})")

# TEST 3: Role-Based Access Control (RBAC 403 Enforced)
print("\n--- [TEST 3] Role-Based Access Control & 403 Forbidden Protection ---")
status, res = req("/api/admin/users", token=student_token)
assert status == 403, f"Expected 403 for student accessing admin users, got {status}: {res}"
print("[PASS] 3.1 Student blocked from /api/admin/users with 403 Forbidden")

status, res = req("/api/admin/stats", token=student_token)
assert status == 403, f"Expected 403 for student accessing admin stats, got {status}: {res}"
print("[PASS] 3.2 Student blocked from /api/admin/stats with 403 Forbidden")

status, res = req("/api/admin/reset-cohort", method="POST", data={}, token=student_token)
assert status == 403, f"Expected 403 for student resetting cohort, got {status}: {res}"
print("[PASS] 3.3 Student blocked from /api/admin/reset-cohort with 403 Forbidden")

status, admin_users_res = req("/api/admin/users", token=admin_token)
assert status == 200, f"Admin failed to access /api/admin/users: {admin_users_res}"
assert "users" in admin_users_res, "Expected 'users' key in admin users response"
print(f"[PASS] 3.4 Coordinator authorized for /api/admin/users (Found {len(admin_users_res['users'])} users)")

status, admin_stats_res = req("/api/admin/stats", token=admin_token)
assert status == 200, f"Admin failed to access /api/admin/stats: {admin_stats_res}"
assert "stats" in admin_stats_res
print(f"[PASS] 3.5 Coordinator authorized for /api/admin/stats: {admin_stats_res['stats']}")

# TEST 4: Student Skill Portfolio CRUD in SQLite
print("\n--- [TEST 4] Student Skill Portfolio CRUD Operations (SQLite Persistent) ---")
status, skills_res = req("/api/student/skills", token=student_token)
assert status == 200, f"Failed to get student skills: {skills_res}"
initial_skills = skills_res.get("skills", [])
print(f"[PASS] 4.1 Loaded {len(initial_skills)} preloaded skills for Aarav Sharma")

# Add new skill
test_skill = {
    "skill_name": "Kubernetes Orchestration",
    "category": "Cloud/DevOps",
    "proficiency": 9,
    "evidence": "Certified Kubernetes Administrator (CKA), deployed microservices cluster."
}
status, add_res = req("/api/student/skills", method="POST", data=test_skill, token=student_token)
assert status == 200, f"Failed to add skill: {add_res}"
print(f"[PASS] 4.2 Added new skill: '{test_skill['skill_name']}' (Proficiency: {test_skill['proficiency']}/10)")

# Verify skill was added
status, skills_res2 = req("/api/student/skills", token=student_token)
current_skills = skills_res2.get("skills", [])
matching = [s for s in current_skills if s["skill_name"] == test_skill["skill_name"]]
assert len(matching) == 1, f"Expected 1 matching skill, got {len(matching)}"
assert matching[0]["proficiency"] == 9
assert matching[0]["evidence"] == test_skill["evidence"]
print(f"[PASS] 4.3 Verified persistent retrieval: '{matching[0]['skill_name']}' with proficiency 9/10")

# Delete skill
status, del_res = req(f"/api/student/skills/{urllib.parse.quote(test_skill['skill_name'])}", method="DELETE", token=student_token)
assert status == 200, f"Failed to delete skill: {del_res}"
print(f"[PASS] 4.4 Deleted skill: '{test_skill['skill_name']}'")

status, skills_res3 = req("/api/student/skills", token=student_token)
after_del = skills_res3.get("skills", [])
assert not any(s["skill_name"] == test_skill["skill_name"] for s in after_del), "Skill was not deleted!"
print(f"[PASS] 4.5 Verified deletion: skill successfully removed from SQLite database")

# TEST 5: Python Backend Greedy Set Cover Algorithm
print("\n--- [TEST 5] Python Backend Greedy Set Cover Algorithm Execution ---")
team_payload = {
    "projectId": "proj-01",
    "teamSize": 4,
    "algorithm": "greedy_set_cover"
}
status, team_res = req("/api/teams/generate", method="POST", data=team_payload, token=admin_token)
assert status == 200, f"Backend team formation failed: {team_res}"
assert team_res.get("success") is True
assert len(team_res.get("teams", [])) >= 1, "Expected at least 1 formed team"
team1 = team_res["teams"][0]
print(f"[PASS] 5.1 Executed Greedy Set Cover on Python Backend in {team_res.get('execution_time_ms', 0)} ms")
print(f"       Formed Team: '{team1['name']}', Members: {len(team1['members'])}, Skill Coverage: {team1.get('skill_coverage_percent', 0)}%")
assert team1.get("skill_coverage_percent", 0) >= 80, f"Skill coverage too low: {team1.get('skill_coverage_percent')}%"

# Inspect role allocation
for m in team1["members"]:
    print(f"       - {m['name']} ({m.get('rollNo', 'N/A')}): Assigned Role -> {m.get('assignedRole')}")

# TEST 6: User Registration Dual-Role Flow
print("\n--- [TEST 6] User Registration Flow (Student vs Coordinator) ---")
ts = int(time.time())
new_student_data = {
    "name": "Kavya Patel",
    "email": f"kavya.{ts}@itas.edu.in",
    "password": "studentPassword123!",
    "role": "student",
    "rollNo": f"24EJCCA{ts % 1000}",
    "branch": "CSE-AI",
    "skills": "Python:8, React:7, NLP:8"
}
status, reg_std = req("/api/auth/register", method="POST", data=new_student_data)
assert status in (200, 201), f"Student registration failed: {reg_std}"
assert reg_std["user"]["role"] == "student"
assert reg_std["user"]["rollNo"] == new_student_data["rollNo"]
print(f"[PASS] 6.1 Registered Student: {reg_std['user']['name']} (Role: {reg_std['user']['role']}, Roll: {reg_std['user']['rollNo']})")

new_admin_data = {
    "name": "Dr. Ananya Roy",
    "email": f"ananya.{ts}@itas.edu.in",
    "password": "adminPassword123!",
    "role": "admin",
    "facultyId": f"FAC-CSE-{ts % 1000}",
    "college": "Institute of Technology & Advanced Sciences",
    "dept": "Department of Computer Science & Engineering",
    "branch": "CSE-AI",
    "designation": "Associate Professor",
    "hodName": "Dr. S. K. Gupta",
    "deanName": "Prof. M. R. Venkat"
}
status, reg_adm = req("/api/auth/register", method="POST", data=new_admin_data)
assert status in (200, 201), f"Admin registration failed: {reg_adm}"
assert reg_adm["user"]["role"] == "admin"
print(f"[PASS] 6.2 Registered Coordinator: {reg_adm['user']['name']} (Role: {reg_adm['user']['role']})")

print("\n" + "=" * 70)
print("   ALL END-TO-END QA TESTS PASSED CLEANLY! [100% OPERATIONAL]   ")
print("=" * 70)
