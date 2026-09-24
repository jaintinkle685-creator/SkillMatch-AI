"""
SkillMatch AI — Master Academic Server & REST API (Flask Architecture)
Analysis of Algorithms (CS-402) Capstone System.
Combines static web asset serving with persistent SQLite-backed REST API endpoints,
dual-role authentication (Student vs Admin), student skill portfolio management,
and backend AOA team formation algorithms.
"""

import os
import sys
import json
from functools import wraps
from flask import Flask, request, jsonify, send_from_directory, make_response
import database

PORT = 8000
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

app = Flask(__name__, static_folder=None)
app.config['JSON_SORT_KEYS'] = False

# Ensure database is initialized on server startup
database.init_db()
database.ensure_demo_account()

# ----------------- AUTHENTICATION HELPERS & DECORATORS -----------------

def get_current_user():
    """Extracts session token from Authorization header or cookie, and returns user dict."""
    auth_header = request.headers.get("Authorization", "")
    token = None
    if auth_header.startswith("Bearer "):
        token = auth_header[7:].strip()
    elif "skillmatch_token" in request.cookies:
        token = request.cookies.get("skillmatch_token")

    if not token:
        return None
    return database.get_user_by_token(token)

def login_required(f):
    """Requires valid session token."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        user = get_current_user()
        if not user:
            return jsonify({"success": False, "error": "Authentication required. Please sign in."}), 401
        return f(user, *args, **kwargs)
    return decorated_function

def admin_required(f):
    """Requires authenticated user with 'admin' role."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        user = get_current_user()
        if not user:
            return jsonify({"success": False, "error": "Authentication required. Please sign in."}), 401
        if user.get("role") != "admin":
            return jsonify({"success": False, "error": "Access denied: Admin privileges required."}), 403
        return f(user, *args, **kwargs)
    return decorated_function

@app.after_request
def add_cors_and_cache_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    if request.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response

# ----------------- AUTHENTICATION ROUTES -----------------

@app.route("/api/auth/register", methods=["POST"])
def api_register():
    body = request.get_json(silent=True) or {}
    email = body.get("email", "").strip()
    password = body.get("password", "")
    name = body.get("name", "").strip()

    if not email or not password or not name:
        return jsonify({"success": False, "error": "Email, password, and full name are required."}), 400

    if "@" not in email or "." not in email:
        return jsonify({"success": False, "error": "Please provide a valid email address."}), 400

    if len(password) < 4:
        return jsonify({"success": False, "error": "Password must be at least 4 characters long."}), 400

    try:
        extra_fields = {k: v for k, v in body.items() if k not in ("email", "password", "name")}
        user = database.register_user(email, password, name, **extra_fields)
        token, expires_at = database.create_session(user["id"])
        return jsonify({
            "success": True,
            "token": token,
            "expiresAt": expires_at,
            "user": user,
            "isNewUser": True,
            "message": f"Account successfully created as {user.get('role', 'student').capitalize()}!"
        }), 201
    except ValueError as ve:
        err_msg = str(ve)
        return jsonify({
            "success": False,
            "error": err_msg,
            "alreadyRegistered": "already registered" in err_msg.lower()
        }), 400
    except Exception as ex:
        return jsonify({"success": False, "error": f"Registration error: {str(ex)}"}), 500

@app.route("/api/auth/login", methods=["POST"])
def api_login():
    body = request.get_json(silent=True) or {}
    email = (body.get("email") or body.get("identifier") or "").strip()
    password = body.get("password", "")

    if not email or not password:
        return jsonify({"success": False, "error": "Please enter both email/ID and password."}), 400

    user = database.authenticate_user(email, password)
    if not user:
        if database.check_user_exists(email):
            return jsonify({
                "success": False,
                "error": "Incorrect password. Please verify and try again.",
                "wrongPassword": True
            }), 401
        else:
            return jsonify({
                "success": False,
                "error": "Account not found with this email or ID. Please check your credentials or register.",
                "notRegistered": True
            }), 401

    token, expires_at = database.create_session(user["id"])
    return jsonify({
        "success": True,
        "token": token,
        "expiresAt": expires_at,
        "user": user,
        "message": f"Signed in successfully as {user.get('name')}."
    })

@app.route("/api/auth/demo-login", methods=["POST"])
def api_demo_login():
    """1-click Instant Demo Access as Faculty Coordinator (Prof. Rajesh Sharma)."""
    demo_user = database.authenticate_user(database.DEFAULT_DEMO_EMAIL, database.DEFAULT_DEMO_PASSWORD)
    if not demo_user:
        database.ensure_demo_account()
        demo_user = database.authenticate_user(database.DEFAULT_DEMO_EMAIL, database.DEFAULT_DEMO_PASSWORD)

    token, expires_at = database.create_session(demo_user["id"])
    return jsonify({
        "success": True,
        "token": token,
        "expiresAt": expires_at,
        "user": demo_user,
        "message": "Welcome, Demo Coordinator (Prof. Rajesh Sharma)!"
    })

@app.route("/api/auth/student-demo-login", methods=["POST"])
def api_student_demo_login():
    """1-click Instant Demo Access as Student (neutral sample student)."""
    std_user = database.authenticate_user(database.DEFAULT_STUDENT_EMAIL, database.DEFAULT_STUDENT_PASSWORD)
    if not std_user:
        database.ensure_demo_account()
        std_user = database.authenticate_user(database.DEFAULT_STUDENT_EMAIL, database.DEFAULT_STUDENT_PASSWORD)

    token, expires_at = database.create_session(std_user["id"])
    return jsonify({
        "success": True,
        "token": token,
        "expiresAt": expires_at,
        "user": std_user,
        "message": "Welcome, Demo Student (Aarav Sharma)!"
    })

@app.route("/api/auth/logout", methods=["POST"])
def api_logout():
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        database.delete_session(auth_header[7:].strip())
    return jsonify({"success": True, "message": "Signed out successfully."})

@app.route("/api/auth/me", methods=["GET"])
@login_required
def api_me(user):
    return jsonify({"success": True, "user": user})

@app.route("/api/auth/profile", methods=["POST"])
@login_required
def api_update_profile(user):
    body = request.get_json(silent=True) or {}
    updated_user = database.update_user_profile(user["id"], body)
    return jsonify({"success": True, "user": updated_user, "message": "Profile updated successfully."})

# ----------------- STUDENT SKILLS PORTFOLIO -----------------

@app.route("/api/student/skills", methods=["GET"])
@login_required
def api_get_student_skills(user):
    skills = database.get_student_skills(user["id"])
    return jsonify({"success": True, "skills": skills})

@app.route("/api/student/skills", methods=["POST"])
@login_required
def api_save_student_skill(user):
    body = request.get_json(silent=True) or {}
    skill_name = body.get("skill") or body.get("skillName") or body.get("name") or body.get("skill_name")
    proficiency = body.get("proficiency", 7)
    evidence = body.get("evidence", "")

    if not skill_name:
        return jsonify({"success": False, "error": "Skill name is required."}), 400

    updated_skills = database.save_or_update_student_skill(user["id"], skill_name, proficiency, evidence)
    return jsonify({
        "success": True,
        "message": f"Skill '{skill_name}' updated successfully in portfolio.",
        "skills": updated_skills
    })

@app.route("/api/student/skills/<path:skill_name>", methods=["DELETE"])
@login_required
def api_delete_student_skill(user, skill_name):
    updated_skills = database.delete_student_skill(user["id"], skill_name)
    return jsonify({
        "success": True,
        "message": f"Skill '{skill_name}' removed from portfolio.",
        "skills": updated_skills
    })

# ----------------- WORKSPACE & PROJECTS -----------------

@app.route("/api/workspace", methods=["GET"])
@login_required
def api_get_workspace(user):
    data = database.get_workspace_data(user["id"])
    return jsonify({"success": True, "workspace": data})

@app.route("/api/workspace", methods=["POST"])
@login_required
def api_save_workspace(user):
    body = request.get_json(silent=True) or {}
    try:
        workspace = database.save_workspace_snapshot(user["id"], body)
        return jsonify({"success": True, "workspace": workspace, "message": "Workspace saved successfully."})
    except Exception as ex:
        return jsonify({"success": False, "error": f"Workspace save error: {str(ex)}"}), 500

@app.route("/api/workspace/demo-choice", methods=["POST"])
@login_required
def api_set_demo_choice(user):
    body = request.get_json(silent=True) or {}
    raw_choice = body.get("choice")
    if raw_choice is None:
        load_demo = bool(body.get("loadDemo", False))
    elif isinstance(raw_choice, bool):
        load_demo = raw_choice
    elif str(raw_choice).lower().strip() in ("yes", "true", "loaded", "1"):
        load_demo = True
    elif str(raw_choice).lower().strip() in ("no", "false", "skipped", "0"):
        load_demo = False
    else:
        return jsonify({"success": False, "error": "Invalid choice. Must be 'yes' or 'no'."}), 400

    stored_choice = "loaded" if load_demo else "skipped"
    database.set_demo_choice(user["id"], stored_choice)
    if load_demo:
        database.seed_demo_data_for_user(user["id"])

    workspace = database.get_workspace_data(user["id"])
    return jsonify({
        "success": True,
        "demoChoice": stored_choice,
        "workspace": workspace,
        "message": "Demo data loaded!" if load_demo else "Started with blank workspace."
    })

@app.route("/api/stats", methods=["GET"])
@login_required
def api_get_stats(user):
    data = database.get_workspace_data(user["id"])
    return jsonify({"success": True, "stats": data["stats"]})

@app.route("/api/projects", methods=["GET"])
@login_required
def api_get_projects(user):
    data = database.get_workspace_data(user["id"])
    return jsonify({"success": True, "projects": data.get("projects", [])})

@app.route("/api/projects", methods=["POST"])
@login_required
def api_save_project(user):
    body = request.get_json(silent=True) or {}
    proj_id = database.save_or_update_project(user["id"], body)
    workspace = database.get_workspace_data(user["id"])
    return jsonify({"success": True, "projectId": proj_id, "workspace": workspace})

@app.route("/api/projects/<path:project_id>", methods=["DELETE"])
@login_required
def api_delete_project(user, project_id):
    try:
        database.delete_project(user["id"], project_id)
        workspace = database.get_workspace_data(user["id"])
        return jsonify({"success": True, "workspace": workspace, "message": "Project removed successfully."})
    except ValueError as ex:
        return jsonify({"success": False, "error": str(ex)}), 404
    except Exception as ex:
        app.logger.exception("Project deletion failed for user=%s project=%s", user.get("id"), project_id)
        return jsonify({"success": False, "error": f"Project removal failed: {str(ex)}"}), 500

# ----------------- STUDENTS COHORT -----------------

@app.route("/api/admin/cohort/load-sample-students", methods=["POST"])
@admin_required
def api_load_sample_students(user):
    try:
        database.load_sample_students_for_admin(user["id"])
        workspace = database.get_workspace_data(user["id"])
        students = workspace.get("students", []) if isinstance(workspace, dict) else []
        return jsonify({
            "success": True,
            "students": students,
            "count": len(students),
            "workspace": workspace,
            "message": "Standard 20 sample students loaded without duplicates."
        })
    except ValueError as ve:
        return jsonify({"success": False, "error": str(ve)}), 403
    except Exception as ex:
        app.logger.exception("Sample student loading failed for admin=%s", user.get("id"))
        return jsonify({"success": False, "error": f"Unable to load sample students: {str(ex)}"}), 500

@app.route("/api/admin/cohort-students", methods=["GET"])
@admin_required
def api_get_admin_cohort_students(user):
    try:
        students = database.get_admin_cohort_students(user["id"])
        return jsonify({
            "success": True,
            "students": students,
            "count": len(students),
            "cohortCode": user.get("cohortCode") or user.get("cohort_code") or ""
        })
    except ValueError as ve:
        return jsonify({"success": False, "error": str(ve)}), 403
    except Exception as ex:
        app.logger.exception("Authoritative cohort lookup failed for admin=%s", user.get("id"))
        return jsonify({"success": False, "error": f"Unable to load student cohort: {str(ex)}"}), 500

@app.route("/api/students", methods=["GET"])
@login_required
def api_get_students(user):
    data = database.get_workspace_data(user["id"])
    return jsonify({"success": True, "students": data.get("students", [])})

@app.route("/api/students", methods=["POST"])
@login_required
def api_save_student(user):
    body = request.get_json(silent=True) or {}
    std_id = database.save_or_update_student(user["id"], body)
    workspace = database.get_workspace_data(user["id"])
    return jsonify({"success": True, "studentId": std_id, "workspace": workspace})

@app.route("/api/admin/students/<student_id>/skills", methods=["POST"])
@admin_required
def api_admin_save_student_skill(user, student_id):
    body = request.get_json(silent=True) or {}
    skill_name = body.get("skill") or body.get("skillName") or body.get("name")
    proficiency = body.get("proficiency", 7)
    evidence = body.get("evidence", "")
    try:
        skills = database.admin_save_student_skill(user["id"], student_id, skill_name, proficiency, evidence)
        return jsonify({
            "success": True,
            "message": f"Skill '{str(skill_name).strip()}' saved for the student.",
            "skills": skills
        })
    except ValueError as ve:
        return jsonify({"success": False, "error": str(ve)}), 400
    except Exception as ex:
        return jsonify({"success": False, "error": f"Unable to save student skill: {str(ex)}"}), 500

@app.route("/api/admin/students/<student_id>/skills/<path:skill_name>", methods=["DELETE"])
@admin_required
def api_admin_delete_student_skill(user, student_id, skill_name):
    try:
        skills = database.admin_delete_student_skill(user["id"], student_id, skill_name)
        return jsonify({"success": True, "skills": skills, "message": f"Skill '{skill_name}' removed from the student."})
    except ValueError as ve:
        return jsonify({"success": False, "error": str(ve)}), 400
    except Exception as ex:
        return jsonify({"success": False, "error": f"Unable to remove student skill: {str(ex)}"}), 500

@app.route("/api/admin/cohort/analyze-roles", methods=["POST"])
@admin_required
def api_admin_analyze_roles(user):
    try:
        results = database.analyze_admin_cohort_roles(user["id"])
        return jsonify({"success": True, "count": len(results), "results": results})
    except Exception as ex:
        return jsonify({"success": False, "error": str(ex)}), 500

@app.route("/api/students/<student_id>", methods=["DELETE"])
@login_required
def api_delete_student(user, student_id):
    database.delete_student(user["id"], student_id)
    workspace = database.get_workspace_data(user["id"])
    return jsonify({"success": True, "workspace": workspace})

# ----------------- BACKEND TEAM FORMATION ALGORITHM -----------------

@app.route("/api/teams/generate", methods=["POST"])
@login_required
def api_generate_teams_backend(user):
    """Executes Greedy Set Cover team formation directly on the Python SQLite backend."""
    body = request.get_json(silent=True) or {}
    project_id = body.get("projectId")
    team_size = body.get("teamSize")
    algorithm = body.get("algorithm", "greedy_set_cover")

    if not project_id:
        return jsonify({"success": False, "error": "projectId is required."}), 400

    try:
        result = database.run_backend_team_formation(user["id"], project_id, team_size, algorithm)
        return jsonify(result)
    except Exception as ex:
        return jsonify({"success": False, "error": f"Algorithm execution error: {str(ex)}"}), 500

@app.route("/api/teams/save", methods=["POST"])
@login_required
def api_save_teams(user):
    body = request.get_json(silent=True) or {}
    project_id = body.get("projectId")
    teams = body.get("teams", [])
    algo_name = body.get("algorithm", "Multi-Objective Optimization")

    if not project_id:
        return jsonify({"success": False, "error": "projectId is required."}), 400

    database.save_teams_and_assignments(user["id"], project_id, teams, algo_name)
    workspace = database.get_workspace_data(user["id"])
    return jsonify({
        "success": True,
        "message": f"Successfully formed and assigned {len(teams)} teams.",
        "workspace": workspace
    })

@app.route("/api/teams/release/<project_id>", methods=["POST"])
@login_required
def api_release_teams(user, project_id):
    database.release_project_assignments(user["id"], project_id)
    workspace = database.get_workspace_data(user["id"])
    return jsonify({
        "success": True,
        "message": "Students unassigned and returned to available pool.",
        "workspace": workspace
    })

# ----------------- REPORTS -----------------

@app.route("/api/reports/<project_id>", methods=["GET"])
@login_required
def api_get_report(user, project_id):
    conn = database.get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM reports WHERE user_id = ? AND project_id = ?", (user["id"], project_id))
    row = cur.fetchone()
    conn.close()
    return jsonify({"success": True, "report": dict(row) if row else None})

@app.route("/api/reports", methods=["POST"])
@login_required
def api_save_report(user):
    body = request.get_json(silent=True) or {}
    project_id = body.get("projectId")
    if not project_id:
        return jsonify({"success": False, "error": "projectId is required."}), 400

    rep_id = database.save_report_details(user["id"], project_id, body)
    return jsonify({"success": True, "reportId": rep_id, "message": "Report details saved."})

# ----------------- ADMIN OVERSIGHT & SECURITY -----------------

@app.route("/api/admin/users", methods=["GET"])
@admin_required
def api_admin_get_users(admin_user):
    users = database.get_all_users()
    return jsonify({"success": True, "users": users})

@app.route("/api/admin/users/role", methods=["POST"])
@admin_required
def api_admin_update_role(admin_user):
    body = request.get_json(silent=True) or {}
    user_id = body.get("userId")
    new_role = body.get("role")
    if not user_id or not new_role:
        return jsonify({"success": False, "error": "userId and role are required."}), 400

    updated = database.update_user_role(user_id, new_role)
    return jsonify({"success": True, "user": updated, "message": f"User role updated to {new_role}."})

@app.route("/api/admin/users/<user_id>", methods=["DELETE"])
@admin_required
def api_admin_delete_user(admin_user, user_id):
    if user_id == admin_user["id"]:
        return jsonify({"success": False, "error": "Cannot delete your own admin account."}), 400
    database.delete_user(user_id)
    return jsonify({"success": True, "message": "User deleted successfully."})

@app.route("/api/admin/stats", methods=["GET"])
@admin_required
def api_admin_get_stats(admin_user):
    stats = database.get_system_admin_stats()
    return jsonify({"success": True, "adminStats": stats, "stats": stats})

@app.route("/api/admin/reset-cohort", methods=["POST"])
@admin_required
def api_admin_reset_cohort(admin_user):
    database.seed_demo_data_for_user(admin_user["id"])
    workspace = database.get_workspace_data(admin_user["id"])
    return jsonify({"success": True, "message": "Academic demo cohort re-seeded.", "workspace": workspace})

# ----------------- STATIC ASSETS & SINGLE PAGE APP -----------------

@app.route("/", methods=["GET"])
def serve_index():
    return send_from_directory(BASE_DIR, "index.html")

@app.route("/<path:filename>", methods=["GET"])
def serve_static(filename):
    file_path = os.path.join(BASE_DIR, filename)
    if os.path.isfile(file_path):
        return send_from_directory(BASE_DIR, filename)
    # SPA fallback to index.html
    return send_from_directory(BASE_DIR, "index.html")

def run_server(port=PORT):
    print(f"[*] SkillMatch AI Flask Server running at http://127.0.0.1:{port}")
    print(f"[*] SQLite Database: {database.DB_FILE}")
    app.run(host="127.0.0.1", port=port, debug=False)

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else PORT
    run_server(port)
