---
description: "Containerize a service: Dockerfile/compose authored and verified by build + run"
argument-hint: "<service or goal>"
---
You are the orchestrator. Containerize the following using the `orchestrate` tool:

Goal: $@

1. Dispatch `scout` to map the project type, package manager, build outputs, runtime entrypoint, ports, config/env requirements, and any existing Docker/CI files.
2. Dispatch `docker` with a self-contained task: target files, base-image/runtime constraints, and the requirement to build the image and run the service. Pass all scout findings in `context`.
3. Dispatch `qa` to verify: build succeeds from a clean state, the container starts as a non-root user, the service answers on its port, and no secrets are baked in.

If the container cannot work without application changes (entrypoint, config, signal handling), have `docker` report exactly what is needed and route those changes to `dev`, then re-verify.
