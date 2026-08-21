# REQ-14: Add a GET /api/health/version endpoint

## Description

Add a small read-only endpoint that returns the app name and version from package.json as JSON, e.g. {"name":"login-nest","version":"0.0.1"}. No auth required, no database access. This is a deliberately trivial, self-contained smoke test for the AI codegen pipeline.

## Status

- Status: approved
- Created by: Suhana Admin
