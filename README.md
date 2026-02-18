# Coded

<div>
  <img src="./image.png" alt="image" width="100%">
</div>

**Coded** is a lightweight, self-hosted online judge platform built with Next.js, SQLite, and Docker. It lets users set programming problems, submit solutions, and receive instant automated verdicts — all in isolated, sandboxed containers.


## Features

### Authentication
- Email and password-based login and signup
- Session management via HTTP-only signed cookies
- Role-based access control (`solver`, `setter`, `admin`)

### Problem Management
- Create problems with a title, statement, time limit, memory limit, and optional deadline
- Set problems as **public** (visible to all) or **private** (visible to specific users by email)
- Add any number of testcases — mark some as samples shown to solvers, keep others hidden for scoring
- Assign point weights to hidden testcases for flexible scoring

### Online Judge
- Supports **C**, **C++**, and **Python**
- Code is compiled and executed inside isolated Docker containers
- Per-submission compile logs and test result logs
- Time limit and memory limit enforcement
- Automatic scoring based on weighted testcases

### Submissions
- Full submission history per user
- Score breakdown (earned / total)
- Execution time tracking

### Activity Dashboard (Setters & Admins)
- View all problems you've created with solver and submission counts
- Expand any problem to see a per-user submission summary
- Edit problem details, update visibility settings, clear submissions, or delete problems
- View submitted source code directly in browser

### Admin Panel
- Manage the setter allowlist — add or remove emails
- Registered users are upgraded/downgraded instantly; unregistered emails take effect on signup

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Styling | Tailwind CSS v4, shadcn/ui |
| Database | SQLite (via sqlite3) |
| Execution | Docker (via child_process) |
| Auth | Custom HMAC-signed session tokens |
| Languages | C, C++, Python |

## Project Structure

```
coded/
├── app/
│   ├── api/              # API routes (auth, problems, submissions, judge, activity, admin)
│   ├── components/       # Shared UI components (NavigationBar, DataTable, SubmissionsTable)
│   ├── activity/         # Setter activity dashboard
│   ├── admin/setters/    # Admin panel for managing setter permissions
│   ├── problems/         # Problem list and individual problem/submission pages
│   ├── set/              # Problem creation page
│   ├── submissions/      # User submission history
│   ├── login/            # Login page
│   └── signup/           # Signup page
├── components/ui/        # shadcn/ui components
├── docker/               # Dockerfiles for C, C++, and Python judges
├── hooks/                # React hooks (useCurrentUser)
├── lib/
│   ├── auth.ts           # Password hashing, token creation/verification
│   ├── datetime.ts       # Date formatting utilities
│   ├── docker.ts         # Container runner
│   ├── judge.ts          # Judging engine
│   └── constants/
│       └── languages.ts  # Language configs (Docker images, compile/run commands)
├── proxy.ts              # Edge middleware for route protection
├── schema.sql            # Database schema
└── setup.sh              # One-command setup script
```

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Docker](https://www.docker.com/)
- `npm` (or `pnpm` / `yarn`)
- `sqlite3` CLI (for database initialization)

### Setup

```bash
chmod +x setup.sh
./setup.sh
```

This script will:
1. Build the `judge-c`, `judge-cpp`, and `judge-python` Docker images (if not already built)
2. Initialize `database.db` from `schema.sql` (if it doesn't exist)
3. Build and start the Next.js application

The app will be available at [http://localhost:3000](http://localhost:3000).

### Manual Steps (if needed)

```bash
# Build Docker images
docker build -t judge-c docker/c
docker build -t judge-cpp docker/cpp
docker build -t judge-python docker/python

# Initialize database
sqlite3 database.db < schema.sql

# Install dependencies
npm install

# Start development server
npm run dev
```

## User Roles

| Role | Capabilities |
|---|---|
| `solver` | Browse problems, submit solutions, view own submissions |
| `setter` | All solver capabilities + create problems, view activity dashboard |
| `admin` | All setter capabilities + manage setter allowlist, view all problems/activity |

The first admin must be set directly in the database. Setters are managed through the Admin panel at `/admin/setters`.

## Supported Languages

| Language | Extensions | Docker Image |
|---|---|---|
| C | `.c` | `judge-c` (gcc:13) |
| C++ | `.cpp`, `.cc`, `.cxx` | `judge-cpp` (gcc:13) |
| Python | `.py` | `judge-python` (python:3.11-slim) |

## Configuration

| Environment Variable | Default | Description |
|---|---|---|
| `AUTH_SECRET` | `coded-production` | Secret key used to sign session tokens. **Change this in production.** |

## Security Notes

- All code execution happens inside Docker containers with no network access, limited PIDs, and enforced memory/CPU limits.
- Sessions use HMAC-signed tokens stored in HTTP-only cookies.
- Passwords are hashed with `scrypt` and a random salt.
- Route protection is handled at the edge via Next.js middleware.

