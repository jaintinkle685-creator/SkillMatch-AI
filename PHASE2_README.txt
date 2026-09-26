SkillMatch AI - Phase 2

Implemented:
- Demo Coordinator login guarantees the curated sample workspace (4 projects + 20 students) is available.
- Project Analysis uses a local semantic AI inference engine based on project name, domain, description, evidence phrases, domain context and role blueprints.
- Project Analysis now derives required skills, target levels, project domains and team roles automatically.
- Project Analysis matches inferred requirements against the students currently loaded from the authenticated workspace/database and displays the best student matches.
- Skill Gap Audit was removed from the visible navigation and dashboard flow.
- Team Optimization was preserved.

No external AI API or key is required for the local semantic inference engine.
