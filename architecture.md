# Project Architecture

This document outlines the architecture and module responsibilities for the Route Optimization and Scheduling backend.

## Architecture Diagram

```mermaid
graph TD
    classDef client fill:#3b82f6,stroke:#1d4ed8,stroke-width:2px,color:#fff;
    classDef api fill:#10b981,stroke:#047857,stroke-width:2px,color:#fff;
    classDef core fill:#8b5cf6,stroke:#6d28d9,stroke-width:2px,color:#fff;
    classDef ext fill:#f59e0b,stroke:#b45309,stroke-width:2px,color:#fff;
    classDef db fill:#ef4444,stroke:#b91c1c,stroke-width:2px,color:#fff;

    Client[Frontend Client / App]:::client -->|HTTP POST\n/optimize| Main[main.py\nFastAPI Application]:::api
    Client -->|HTTP POST\n/save-schedule| Main
    Client -->|HTTP POST\n/login| Main

    subgraph Backend Core System
        Main -->|Input Validation| Models[models.py\nPydantic Schemas]:::core
        Main -->|Token Mgmt| Auth[auth.py\nJWT Authentication]:::core
        Main -->|Route Matrix Request| Scheduler[scheduler.py\nRouting Engine]:::core
        Scheduler -->|Penalty Scoring| Optimizer[optimizer.py\nEvaluator]:::core
        
        Scheduler -->|Time/Distance Geo Matrix| ORS[OpenRouteService API]:::ext
        Main -->|Turn-by-turn Polyline Path| ORS
        
        Main <-->|Read / Write| DB[database.py\nMongoDB Engine]:::db
    end

    DB <--> Mongo[(MongoDB Database)]:::db
    Scheduler --> Engine[Google OR-Tools\nConstraint CP Solver]:::ext
    Engine -.->|Optimized Sequences| Scheduler
```

## Module Descriptions

1. **`main.py` (The Orchestrator)**
   The core entry point of the FastAPI application. It defines all the accessible API endpoints (`/optimize`, `/generate-frequency`, `/save-schedule`, `/login`, etc.). Under the hood, it receives data from the frontend and coordinates calling the other internal files to perform routing, validate security, fetch map polylines, and talk to the database.

2. **`scheduler.py` (The Solver Engine)**
   The heavy-lifting module where the actual complex mathematical operations occur. 
   * It builds abstract data models out of raw coordinates.
   * It connects to the external `OpenRouteService (ORS)` API to calculate real-world street transit times.
   * It spins up the `Google OR-Tools pywrapcp` router to calculate the optimal way to deploy buses to specific nodes so penalties are minimized based on the user's `optimize_for` constraints. 
   * It enforces time windows securely.

3. **`optimizer.py` (The Evaluator)**
   A lightweight, focused scoring module. Once a schedule has been finalized by `scheduler.py`, this module iterates through all assigned stops and calculates the total "penalty" scale. It evaluates if a sequence arrived too early or too late, assigns penalty points, and returns the final score summarizing how effective the routing solution was.

4. **`models.py` (Data Structures & Blueprints)**
   This module handles input validation using Pydantic. It ensures that any data coming from the frontend is strictly typed. It defines objects like the `ScheduleRequest` (requiring coordinates and node tolerances) and `UserCreate` (preventing malformed email addresses). If frontend data breaks these rules, it rejects the request before it crashes the engine.

5. **`database.py` (Persistence Layer)**
   A clean isolation layer managing the connection strings and cursor objects to MongoDB. It defines the collections (like `users_collection` and `schedules_collection`) so that `main.py` can fetch or save records asynchronously without worrying about database initialization nuances.

6. **`auth.py` (Security & User Identity)**
   Handles all authentication procedures. It securely hashes passwords so they aren't stored in plain-text, verifies logins, and generates JSON Web Tokens (JWT) using `datetime` expirations. It provides dependency injection (like `get_current_user`) so endpoints in `main.py` lock out unauthorized users seamlessly.
