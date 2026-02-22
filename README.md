# RankGEO

A tool for marketing agencies to improve GEO (search visibility) for client websites. It analyzes a site’s content, generates realistic user search prompts, and scores how often the site appears when those prompts are run through a search-backed LLM.

## Stack

- **Frontend:** Next.js (React, TypeScript)
- **Backend:** NestJS (TypeScript)
- **Package manager:** pnpm

## Setup

1. **Install dependencies**
  ```bash
   pnpm install
  ```
2. **Configure the API**
  In `apps/api/`, create a `.env` file with your OpenAI API key (required for analysis and GEO score):

## Run

From the project root:

- **API (port 3001):** `pnpm run dev:api`
- **Web app (port 3000):** `pnpm run dev:web`

Run both in separate terminals, then open [http://localhost:3000](http://localhost:3000). Enter a website URL, run analysis, then use “Get GEO score” to see the visibility score and related prompts.

## Build

- `pnpm run build:api` — build the API
- `pnpm run build:web` — build the Next.js app

