STUDENT COHORT FIX
==================

This build fixes the Student Cohort dashboard so registered student accounts are
loaded directly from the authoritative SQLite cohort records.

IMPORTANT:
- Keep your existing skillmatch.db if you already have student/admin/project data.
- Replace the project files with these files, but DO NOT delete your existing skillmatch.db.
- Start the project normally with RUN_PROJECT.bat.
- Open Student Cohort after logging in as the admin. The roster is refreshed directly
  from the database when the dashboard opens.

The fix adds:
- /api/admin/cohort-students authoritative cohort endpoint
- direct SQLite cohort lookup using coordinator_id/cohort_code
- defensive creation of a missing student profile for an existing registered student
- frontend refresh of the admin Student Cohort dashboard

No team-generation algorithm or unrelated UI functionality was changed.
