# Coded

Coded is a lightweight online coding judge platform built with Next.js, SQLite, and Docker. It allows users to set problems, submit solutions, and get evaluated automatically in isolated Docker environments. Think of it as a minimal, self-hosted competitive programming system—designed for speed, clarity, and control. Coded focuses on the essentials: secure authentication, flexible problem definitions, weighted testcases, and deterministic judging across multiple languages. Each submission is compiled and executed inside a sandboxed container, ensuring fairness, reproducibility, and safety. Whether you’re building an internal coding platform, running practice contests, or experimenting with online judge architectures, Coded provides a clean, hackable foundation without unnecessary abstractions.

## Features

- **Authentication**
  - Email/password login & signup
  - Session-based auth using HTTP-only cookies
- **Problem Management**
  - Create public/private problems
  - Custom time & memory limits
  - Sample and weighted testcases
- **Online Judge**
  - Supports **C**, **C++**, and **Python**
  - Code execution inside Docker containers
  - Compile/runtime logs
- **Submissions & Scoring**
  - Per-problem scoring based on testcase weights
  - Execution time tracking
  - Submission history
- **Modern UI**
  - Built with **Tailwind CSS** + **shadcn/ui**
  - Dark mode support
- **Edge Middleware**
  - Route protection based on authentication state

## Tech Stack

- **Frontend / Backend**: Next.js (App Router)
- **Styling**: Tailwind CSS, shadcn/ui
- **Database**: SQLite
- **Judging Engine**: Docker + dockerode
- **Languages Supported**:
  - C
  - C++
  - Python

## Getting Started

### Prerequisites

- **Node.js 18+**
- **Docker**
- **npm** (or pnpm/yarn)

```bash
chmod +x setup.sh
./setup.sh
```
