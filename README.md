# Blueprint: long-task-flow

Self-contained TechDemos blueprint (engine schemaVersion 1).

- `blueprint.json` — DAG topology
- `meta.json` — skill provenance (originalRef → newRef mapping)
- `skills/<name>/SKILL.md` — bundled claude skills
- `opencode-skills/<name>/SKILL.md` — bundled opencode skills

Run via the harness UI (🗺️ 蓝图 panel) or the `/_blueprint/*` HTTP API.
