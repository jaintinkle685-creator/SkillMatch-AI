# SkillMatch AI — Final Project

Academic Student Skill Matching & Optimal Team Formation System (CS-402 AOA).

## Run on Windows

1. Install Python 3.10+ with **Add Python to PATH** enabled.
2. Double-click `RUN_PROJECT.bat`.
3. The launcher automatically installs the required Flask dependency from `requirements.txt` if it is missing.
4. Open `http://127.0.0.1:8000` if Chrome does not open automatically.

## Demo accounts

### Demo Coordinator
- Email: `rajesh.sharma@itas.edu.in`
- Password: `admin123`

### Demo Student
- Email: `demo.student@itas.edu.in`
- Password: `student123`

Demo accounts are sample data only. They are excluded from the Admin Management real-account list.

## New accounts

New registrations are stored in the SQLite database (`skillmatch.db`) and start with a clean workspace. Student registrations receive an empty student profile so the My Skills Portfolio can save skills immediately.

## Shared Student Skill Registry

- Every newly registered student account automatically gets a persistent student profile in SQLite.
- When a student adds or updates skills in **My Skills Portfolio**, those proficiency values are stored in the same student record.
- Any faculty/admin account can see all registered student accounts in **Student Cohort** after signing in.
- Admins can use the **🛠️ Manage Skills** button beside a registered student to add or update that student's skills directly.
- Admin edits are synchronized back to the student's own **My Skills Portfolio** and are used by the team-matching engine.

## Main workflow

Coordinator:
Project Analysis → Student Cohort → Skill Gap Audit → Team Optimization → Team Results → Explain & What-If → AOA Algorithm Analysis → Academic Report.

Student:
My Skills Portfolio only.

Project Catalog has been removed from the user interface.

## Notes

- Team Optimization algorithms were preserved.
- Reports are generated from the current project/audit/team state.
- Browser Print / Save as PDF uses the system print dialog.


## Account Persistence (Final Build)
- Registered accounts are stored in the project-local `skillmatch.db` SQLite database.
- `RUN_PROJECT.bat` always starts the server from this project directory and stops a stale process on port 8000 first, preventing another copy of SkillMatch AI from serving a different database.
- Closing Chrome and restarting the project does not delete registered accounts.


## Deployment note

This project uses a Python Flask backend and SQLite for persistent accounts, projects,
students and teams. GitHub can be used to store the source code and release ZIP, but
**GitHub Pages cannot run this backend**. For a teacher demonstration, run
`RUN_PROJECT.bat` on Windows. For a public web deployment, use a Python-capable host
that supports Flask and persistent storage (and configure the database accordingly).

## Final QA guarantees

- Demo/sample projects are account-scoped and idempotent: loading them repeatedly keeps exactly four sample projects per account.
- The built-in demo account and a registered coordinator cannot overwrite each other's sample projects.
- Sample students remain account-scoped and are loaded idempotently.
- Team formation remains project-scoped and persisted in SQLite.
- Team Overview PDF export reads the currently authenticated coordinator's HOD, coordinator and Dean details.
