<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Lost & Found — Project Rules

## Stack

- **Framework**: Next.js 16 (App Router) — full-stack monolith, no separate backend.
- **Language**: TypeScript, strict mode.
- **Styling**: Tailwind CSS v4 (via `@import "tailwindcss"` in `globals.css`).
- **Linting**: ESLint 9 with `eslint-config-next`.
- **UI**: shadcn/ui (to be installed later).
- **React Compiler**: enabled in `next.config.ts` (`reactCompiler: true`).

## Architecture Principles

1. **Full-stack monolith** — all backend logic lives in Next.js (Route Handlers, Server Actions, Server Components). Do NOT introduce Express, NestJS, FastAPI, or another backend framework. Do NOT create a separate backend repository.
2. **Server Components by default** — prefer Server Components. Use Client Components only when client-side interactivity, state, or browser APIs are required.
3. **AWS on the server** — all AWS SDK calls (Cognito, DynamoDB, S3, Rekognition, SNS) and the OpenRouter API key must run in server-side code only (Route Handlers, Server Actions, or Server Components). Never place privileged AWS logic in client components.
4. **Secrets never exposed** — never hardcode credentials. Use environment variables. Non-`NEXT_PUBLIC_` variables are server-only. Never expose AWS credentials or the OpenRouter API key to the browser.
5. **AWS modules isolated** — keep AWS SDK integrations in dedicated server-side modules under `src/lib/aws/`. UI components must not import AWS SDK code directly.
6. **Business logic separate from UI** — keep domain/business logic in `src/lib/`, not inside React components.
7. **Validate all external input** — validate user input at the boundary (Route Handlers / Server Actions) before it reaches AWS or AI services.
8. **Strict TypeScript** — no `any` unless there is a strong technical reason. Use `server-only` to guard server-only modules.
9. **Small, reusable functions** — avoid unnecessary abstractions and premature optimization.
10. **Explainable** — keep the architecture simple enough to describe in an internship/graduation report.

## AWS Services

| Service            | Purpose                                                 |
| ------------------ | ------------------------------------------------------- |
| Amazon Cognito     | Authentication & authorization                          |
| Amazon DynamoDB    | Application data (item reports, matches, notifications) |
| Amazon S3          | Image/object storage                                    |
| Amazon Rekognition | Image analysis (labels, moderation)                     |
| Amazon SNS         | Notifications                                           |
| OpenRouter         | AI-assisted semantic matching                           |

## Environment Variables

- `.env.local` is git-ignored (already in `.gitignore`).
- Server-only secrets: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `OPENROUTER_API_KEY`, etc.
- Public variables (rare): prefix with `NEXT_PUBLIC_` only when genuinely safe for browser exposure.
- `.env` files live at the project root, not inside `src/`.

## Development Workflow (Milestones)

1. **Architecture** — project structure, domain model, DynamoDB access patterns.
2. **UI foundation** — landing page, shadcn/ui setup, Tailwind theme.
3. **Authentication** — Cognito integration, protected routes.
4. **Lost/Found reports** — report creation forms and validation.
5. **S3 image upload** — presigned URLs or direct server upload.
6. **DynamoDB persistence** — item report storage with designed access patterns.
7. **Search & browsing** — query and filter lost/found reports.
8. **Rekognition** — image analysis for visual labels/features.
9. **AI-assisted matching** — multi-signal matching with OpenRouter semantic scoring.
10. **SNS notifications** — match notifications to users.
11. **Dashboard** — user's reports, matches, profile management.
12. **Testing, security & deployment** — tests, security review, AWS deployment.

## Directory Structure (target)

```
src/
├── app/
│   ├── (auth)/
│   ├── dashboard/
│   ├── lost/
│   ├── found/
│   ├── matches/
│   ├── notifications/
│   ├── profile/
│   ├── api/
│   │   ├── items/
│   │   ├── matches/
│   │   ├── upload/
│   │   └── notifications/
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── ui/
│   ├── items/
│   ├── matches/
│   ├── notifications/
│   └── layout/
├── lib/
│   ├── aws/
│   │   ├── dynamodb.ts
│   │   ├── s3.ts
│   │   ├── rekognition.ts
│   │   ├── cognito.ts
│   │   └── sns.ts
│   ├── ai/
│   │   └── matching.ts
│   ├── validations/
│   └── utils/
├── types/
└── hooks/
```

Create directories only when their functionality is actually implemented.
