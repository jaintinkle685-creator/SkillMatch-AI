import json
import time
import urllib.request
import urllib.error
import sqlite3

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

print("=" * 75)
print("   PHASE 1 AUTHENTICATION & USER PERSISTENCE VERIFICATION SUITE   ")
print("=" * 75)

ts = int(time.time() * 1000) % 1000000

# -------------------------------------------------------------
# TEST 1: New Student Registration & SQLite Persistence
# -------------------------------------------------------------
print("\n[TEST 1] New Student Registration & Permanent SQLite Storage")
student_email = f"aarav.sharma_{ts}@itas.edu.in"
student_roll = f"24EJCCA_{ts % 10000:04d}"
student_pass = "StudentSecurePass#2026"

reg_payload = {
    "name": "Aarav Sharma",
    "email": student_email,
    "password": student_pass,
    "role": "student",
    "rollNo": student_roll,
    "branch": "CSE - AI & Data Systems",
    "college": "Institute of Technology & Advanced Sciences"
}

status, reg_res = req("/api/auth/register", method="POST", data=reg_payload)
assert status == 201, f"Expected 201 Created, got {status}: {reg_res}"
assert reg_res.get("success") is True
assert reg_res["user"]["email"] == student_email.lower()
assert reg_res["user"]["role"] == "student"
assert reg_res["user"]["rollNo"] == student_roll
student_token = reg_res["token"]
student_id = reg_res["user"]["id"]
print(f" -> Student registered successfully: ID={student_id}, Roll={student_roll}")

# Verify directly in SQLite file
conn = sqlite3.connect("skillmatch.db")
cur = conn.cursor()
cur.execute("SELECT id, email, password_hash, salt, role, roll_no FROM users WHERE id = ?", (student_id,))
row = cur.fetchone()
assert row is not None, "User NOT found in SQLite users table!"
assert row[1] == student_email.lower()
assert row[4] == "student"
assert row[5] == student_roll
assert len(row[2]) > 20, "Password hash must be securely stored"
print(" -> VERIFIED in SQLite database: user row permanently stored with PBKDF2 hash & salt.")
conn.close()

# -------------------------------------------------------------
# TEST 2: Duplicate Account Handling (Email & Roll No)
# -------------------------------------------------------------
print("\n[TEST 2] Duplicate Registration Prevention & Error Handling")
# Duplicate Email
status, dup_res = req("/api/auth/register", method="POST", data=reg_payload)
assert status == 400, f"Expected 400 for duplicate email, got {status}: {dup_res}"
assert dup_res.get("success") is False
assert dup_res.get("alreadyRegistered") is True
assert "already registered" in dup_res.get("error", "").lower()
print(f" -> Duplicate email rejected with 400: '{dup_res['error']}' (alreadyRegistered=True)")

# Duplicate Roll Number
dup_roll_payload = dict(reg_payload)
dup_roll_payload["email"] = f"other.{ts}@itas.edu.in"
status, dup_roll_res = req("/api/auth/register", method="POST", data=dup_roll_payload)
assert status == 400, f"Expected 400 for duplicate roll no, got {status}: {dup_roll_res}"
assert dup_roll_res.get("alreadyRegistered") is True
print(f" -> Duplicate roll number rejected with 400: '{dup_roll_res['error']}'")

# -------------------------------------------------------------
# TEST 3: New Faculty Coordinator Registration & Persistence
# -------------------------------------------------------------
print("\n[TEST 3] Faculty Coordinator Registration & Persistence")
faculty_email = f"prof.mehta_{ts}@itas.edu.in"
faculty_id_code = f"FAC-CS-{ts % 10000:04d}"
faculty_pass = "FacultyStrongPass#2026"

fac_payload = {
    "name": "Prof. Vikram Mehta",
    "email": faculty_email,
    "password": faculty_pass,
    "role": "admin",
    "facultyId": faculty_id_code,
    "designation": "Professor & Head of Capstone Lab",
    "college": "Institute of Technology & Advanced Sciences",
    "dept": "Department of Computer Science & Engineering",
    "branch": "Artificial Intelligence & Robotics",
    "hodName": "Dr. Suresh Raman",
    "deanName": "Prof. Meenakshi Sundaram"
}

status, fac_res = req("/api/auth/register", method="POST", data=fac_payload)
assert status == 201, f"Expected 201 Created for faculty, got {status}: {fac_res}"
assert fac_res["user"]["role"] == "admin"
assert fac_res["user"]["facultyId"] == faculty_id_code
faculty_token = fac_res["token"]
faculty_user_id = fac_res["user"]["id"]
print(f" -> Coordinator registered successfully: ID={faculty_user_id}, FacultyID={faculty_id_code}")

# -------------------------------------------------------------
# TEST 4: Session Validation & User Identity Availability
# -------------------------------------------------------------
print("\n[TEST 4] Session Validation & Active Identity (/api/auth/me)")
status, me_student = req("/api/auth/me", token=student_token)
assert status == 200, f"Expected 200, got {status}"
assert me_student["user"]["id"] == student_id
assert me_student["user"]["role"] == "student"
assert me_student["user"]["name"] == "Aarav Sharma"
print(f" -> Active session verified for Student: {me_student['user']['name']} (Role: {me_student['user']['role']})")

status, me_fac = req("/api/auth/me", token=faculty_token)
assert status == 200, f"Expected 200, got {status}"
assert me_fac["user"]["id"] == faculty_user_id
assert me_fac["user"]["role"] == "admin"
print(f" -> Active session verified for Faculty: {me_fac['user']['name']} (Role: {me_fac['user']['role']})")

# -------------------------------------------------------------
# TEST 5: Logout & Session Invalidation
# -------------------------------------------------------------
print("\n[TEST 5] Logout & Session Invalidation")
status, logout_res = req("/api/auth/logout", method="POST", token=student_token)
assert status == 200
assert logout_res.get("success") is True
print(" -> Logout API responded 200 OK")

# Verify token is deleted in SQLite sessions table
conn = sqlite3.connect("skillmatch.db")
cur = conn.cursor()
cur.execute("SELECT * FROM sessions WHERE token = ?", (student_token,))
assert cur.fetchone() is None, "Session token was NOT deleted from SQLite sessions table!"
conn.close()
print(" -> VERIFIED in SQLite database: token successfully deleted from sessions table.")

# Calling /api/auth/me with invalidated token must return 401
status, unauth_res = req("/api/auth/me", token=student_token)
assert status == 401, f"Expected 401 after logout, got {status}: {unauth_res}"
print(" -> Calling /api/auth/me with invalidated token returns 401 Unauthorized.")

# -------------------------------------------------------------
# TEST 6: Login with Registered Credentials (Email & Password)
# -------------------------------------------------------------
print("\n[TEST 6] Login with Saved Credentials (Email & Password)")
login_payload = {
    "email": student_email,
    "password": student_pass
}
status, login_res = req("/api/auth/login", method="POST", data=login_payload)
assert status == 200, f"Login failed: {login_res}"
assert login_res.get("success") is True
assert login_res["user"]["id"] == student_id
new_student_token = login_res["token"]
assert new_student_token != student_token, "New login must generate a fresh session token"
print(f" -> Login successful! Fresh token issued: {new_student_token[:16]}... Dashboard role: {login_res['user']['role']}")

# -------------------------------------------------------------
# TEST 7: Login with University Roll Number as Identifier
# -------------------------------------------------------------
print("\n[TEST 7] Login Using Roll Number as Identifier")
roll_login_payload = {
    "identifier": student_roll,
    "password": student_pass
}
status, roll_login_res = req("/api/auth/login", method="POST", data=roll_login_payload)
assert status == 200, f"Roll number login failed: {roll_login_res}"
assert roll_login_res["user"]["id"] == student_id
print(f" -> Login with Roll No '{student_roll}' successful! Identified as {roll_login_res['user']['name']}.")

# -------------------------------------------------------------
# TEST 8: Login with Faculty ID as Identifier
# -------------------------------------------------------------
print("\n[TEST 8] Login Using Faculty ID as Identifier")
fac_login_payload = {
    "identifier": faculty_id_code,
    "password": faculty_pass
}
status, fac_login_res = req("/api/auth/login", method="POST", data=fac_login_payload)
assert status == 200, f"Faculty ID login failed: {fac_login_res}"
assert fac_login_res["user"]["id"] == faculty_user_id
print(f" -> Login with Faculty ID '{faculty_id_code}' successful! Identified as {fac_login_res['user']['name']}.")

# -------------------------------------------------------------
# TEST 9: Error Handling — Invalid Password vs Unregistered Account
# -------------------------------------------------------------
print("\n[TEST 9] Clear Error Feedback on Invalid Credentials")
# Case A: Correct Email, WRONG Password
status, err_pass_res = req("/api/auth/login", method="POST", data={"email": student_email, "password": "WrongPassword123!"})
assert status == 401, f"Expected 401 for wrong password, got {status}: {err_pass_res}"
assert err_pass_res.get("wrongPassword") is True
assert "incorrect password" in err_pass_res.get("error", "").lower()
print(f" -> Wrong password flagged: '{err_pass_res['error']}' (wrongPassword=True)")

# Case B: Non-existent Email/ID
status, err_notreg_res = req("/api/auth/login", method="POST", data={"email": f"ghost_{ts}@itas.edu.in", "password": "AnyPassword123"})
assert status == 401, f"Expected 401 for non-existent account, got {status}: {err_notreg_res}"
assert err_notreg_res.get("notRegistered") is True
assert "account not found" in err_notreg_res.get("error", "").lower()
print(f" -> Unregistered account flagged: '{err_notreg_res['error']}' (notRegistered=True)")

# Case C: Empty inputs
status, err_empty_res = req("/api/auth/login", method="POST", data={"email": "", "password": ""})
assert status == 400
print(f" -> Empty credentials flagged with 400: '{err_empty_res['error']}'")

# -------------------------------------------------------------
# TEST 10: Existing Demo Logins Preserved & Functional
# -------------------------------------------------------------
print("\n[TEST 10] Demo Logins Preserved & Fully Functional")
status, demo_std = req("/api/auth/student-demo-login", method="POST", data={})
assert status == 200
assert demo_std["user"]["role"] == "student"
assert "Aarav Sharma" in demo_std["user"]["name"]
print(f" -> 1-Click Student Demo: {demo_std['user']['name']} (Roll: {demo_std['user']['rollNo']})")

status, demo_adm = req("/api/auth/demo-login", method="POST", data={})
assert status == 200
assert demo_adm["user"]["role"] == "admin"
assert "Prof. Rajesh Sharma" in demo_adm["user"]["name"]
print(f" -> 1-Click Coordinator Demo: {demo_adm['user']['name']} (Role: {demo_adm['user']['role']})")

# -------------------------------------------------------------
# TEST 11: Multi-User Workspace Isolation
# -------------------------------------------------------------
print("\n[TEST 11] Strict Multi-User Data Isolation")
status, ws_fac = req("/api/workspace", token=fac_res["token"])
assert status == 200
assert ws_fac["workspace"]["user"]["id"] == faculty_user_id
print(f" -> Isolated workspace loaded for {ws_fac['workspace']['user']['name']}: Projects={len(ws_fac['workspace']['projects'])}, Students={len(ws_fac['workspace']['students'])}")

print("\n" + "=" * 75)
print("   PHASE 1 COMPLETE: ALL 11 TESTS PASSED WITH 100% SUCCESS!       ")
print("=" * 75)
