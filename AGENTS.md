<!-- intent-skills:start -->

## Skill Loading

Before editing files for a substantial task:

- Run `bunx @tanstack/intent@latest list` from the workspace root to see available local skills.
- If a listed skill matches the task, run `bunx @tanstack/intent@latest load <package>#<skill>` before changing files.
- Use the loaded `SKILL.md` guidance while making the change.
- Monorepos: when working across packages, run the skill check from the workspace root and prefer the local skill for the package being changed.
- Multiple matches: prefer the most specific local skill for the package or concern you are changing; load additional skills only when the task spans multiple packages or concerns.

<!-- intent-skills:end -->

# CastleCare Project Direction

CastleCare is being rewritten from a previous Next.js application into a simpler TanStack Start monorepo. Preserve the product direction, but do not copy Next.js implementation habits into new code.

## Current Product Scope

- Focus now on public pages, the admin dashboard, and the customer dashboard.
- The active public services are lawn care, laundry, and window washing.
- Omit the Homes route, Homes configurator, and broader home-service marketplace surface for now. Do not reintroduce `/homes` until the product scope changes.
- The earn/provider onboarding route exists as a reference and future worker flow, but it is not the current implementation focus.
- `apps/driver` is the dedicated native driver app (Expo). Staff/driver flows belong there; customers use the web app (desktop and mobile web). There is no customer-facing native app.
- Core public flows are marketing pages, service discovery, authentication, booking, checkout, and post-booking customer status.
- Dashboards should be practical application surfaces, not marketing pages: prioritize clear navigation, scannable data, and fast task completion.

## Architecture Preferences

- Web app: TanStack Start with React 19, TanStack Router, TanStack Query, TanStack Form, Tailwind CSS v4, Base UI/shadcn-style components where already established.
- API app: Hono in `apps/server`, organized as a larger Hono application with small route modules mounted through `app.route()`.
- Database: PostgreSQL with Drizzle in `packages/db`.
- Auth: Better Auth in `packages/auth`.
- Validation: Zod for API inputs, form validation, env validation, and shared schemas when practical.
- Prefer TanStack libraries when they fit the problem before adding a competing client-side state, routing, data, or form library.
- Store currency as integer cents across database rows, API payloads, Stripe payloads, tests, and UI calculations.

## TanStack Start Migration Rules

- Reference the official migration guide when porting old components: https://tanstack.com/start/v0/docs/framework/react/migrate-from-next-js
- Reference the official SEO guide when adding public service pages: https://raw.githubusercontent.com/tanstack/router/main/docs/start/framework/react/guide/seo.md
- TanStack Start is isomorphic by default. Put server-only behavior behind `createServerFn`, server route handlers, Hono API handlers, or explicit server-only modules.
- Do not add `"use server"` or `"use client"` directives from the old Next.js app.
- Use TanStack Router file routes and route APIs. Dynamic params use `$param` filenames and typed `params`, not Next.js bracket routes.
- Use route `head` metadata instead of Next.js metadata exports.
- Validate search params with TanStack Router `validateSearch` and Zod when they affect data loading or UI state.
- When copying components from the old Next.js app, place route-specific components in grouped folders such as `apps/web/src/components/earn`, replace `next/link` with TanStack Router `Link`, replace `next/image` with the project's current media pattern, and update asset paths to `apps/web/public`.

## Booking And Checkout Direction

- `/book` must stay available without authentication.
- Keep booking forms multi-step, rounded, mobile-friendly, and validated with Zod at each step.
- Prefer TanStack Form for durable form implementation work; the public route may also use TanStack Router search params for prefilled service, address, date, and time state.
- Booking data should collect selected services, address, date/time, contact name, phone, email, SMS consent, service-specific questions, selected products, subscription intent, and checkout preference.
- Every scheduled service should reserve a 2-hour appointment window. Public time slots currently run from 6am to 8pm.
- Service-specific questions:
  - Lawn care: grass height (`low`, `medium`, `tall`).
  - Laundry: with or without bedding.
  - Window washing: stories (`1`, `2`, `3`), rough window estimate, and optional photos.
- Product selection should behave like an accordion: each selected service gets a product panel, selecting an item closes/progresses to the next panel.
- Show combo subscriptions only when the selected services qualify. Current combo names are Bi-Weekly Royal Duo, Monthly Castle Care, and Crown Estate Trio.
- Keep the checkout step UI-first until schema/API work is in place. It should model the $50 deposit and the three payment choices: deposit plus invoice later, pay in full today, or deposit plus cash later.
- Stripe work later should include a dashboard sync/edit flow for products, prices, deposit amount, subscriptions, and checkout payload generation. Use integer cents everywhere.

## Auth Direction

- Better Auth should use email/password auth when account finalization is implemented.
- For Vercel previews and production domains, configure Better Auth dynamic base URL with an explicit `allowedHosts` allowlist for `callcastlecare.com`, local development hosts, and `*.vercel.app`.
- Booking completion should offer account finalization; the app may create the customer account from booking details when the backend flow is ready.

## Hono API Standards

- Follow the Hono docs before changing API structure:
  - Full docs for agents: https://hono.dev/llms-full.txt
  - Best practices: https://hono.dev/docs/guides/best-practices
  - Larger apps: https://hono.dev/docs/guides/best-practices#building-a-larger-application
- Use Hono's larger-application pattern: create individual route files such as `routes/checkout.ts`, `routes/orders.ts`, `routes/media.ts`, and mount them from the app entry with `app.route("/checkout", checkoutRoutes)`.
- Avoid Rails-style controller extraction when Hono can infer types directly from handlers beside route definitions. If reusable handlers are needed, use `hono/factory` helpers so inference is preserved.
- Use `@hono/zod-openapi` and `stoker` for documented API routes. Stoker is the preferred helper layer for status codes, phrases, OpenAPI response helpers, default validation hooks, and common middleware. Reference: https://github.com/w3cj/stoker
- New API endpoints should define request and response schemas with Zod/OpenAPI helpers at the route boundary.
- Keep API route files focused by domain. Shared middleware, OpenAPI configuration, and common schemas can live in small support modules when duplication becomes real.

## Structured Logging

- Structured logging should be ready wherever functionality is added.
- Use `evlog` instead of ad hoc `console.log` calls in application code.
- In Hono handlers, use the logger from request context, enrich it with useful business context, and let errors include enough structured detail to debug without reading stack traces alone.
- Security-sensitive events such as auth, billing, admin actions, media access, order status changes, dispatch decisions, and payouts should be modeled as audit-worthy structured events.
- Before changing logging patterns, load the local `review-logging-patterns` skill.

## Testing Expectations

- Write tests when writing functionality.
- Use Vitest for unit, schema, pricing, API handler, and utility coverage.
- Use Playwright for public page, booking, auth, dashboard, and other end-to-end user flows.
- API tests should exercise validation failures as well as success paths.
- Form tests should cover Zod validation for required fields, invalid values, and boundary cases.

## Git And Delivery Workflow

- Work on a feature branch. Use the `codex/` branch prefix unless the user requests another branch name.
- For meaningful changes, create or link a GitHub issue before implementation, add it to the project board, and keep board status current as work moves from planned to in progress to review.
- Open changes as pull requests. Prefer small, reviewable PRs with a clear summary, tests run, and linked issue.
- Vercel owns CI/CD and deployments. Do not invent a parallel deployment process unless the user asks.
- Before asking for review, run the relevant local checks and note any checks that could not be run.

## Local Skill Directory

Before substantial edits, run the intent skill check above. In addition, use the checked-in `.agents/skills` directory as local project guidance:

- Product context: read `.agents/product-marketing.md` before marketing, onboarding, pricing, SEO, or conversion work.
- API and backend: `hono`, `better-auth-best-practices`, `postgres`, `neki`
- Maps, location, and routing: `google-maps-platform`; load the official Google subskills it references before changing Places, Address Validation, Static Maps, Routes, or Route Optimization code.
- Logging and observability: `review-logging-patterns`, `analyze-logs`
- Web UI and components: `shadcn`, `web-design-guidelines`, `vercel-react-best-practices`, `vercel-composition-patterns`
- Marketing strategy: `product-marketing`, `marketing-plan`, `marketing-ideas`, `marketing-psychology`, `customer-research`, `competitors`, `competitor-profiling`
- Copy and conversion: `copywriting`, `copy-editing`, `cro`, `signup`, `onboarding`, `offers`, `pricing`, `ab-testing`
- SEO and content: `seo-audit`, `ai-seo`, `schema`, `site-architecture`, `programmatic-seo`, `content-strategy`
- Launch, campaigns, and retention: `launch`, `emails`, `sms`, `ads`, `ad-creative`, `analytics`, `referrals`, `lead-magnets`, `churn-prevention`, `community-marketing`, `co-marketing`, `public-relations`
- Sales and GTM: `revops`, `sales-enablement`, `cold-email`, `prospecting`, `directory-submissions`
- Media and creative: `image`, `video`, `social`, `influencer-marketing`
- Mobile app: `expo-dev-client`, `expo-tailwind-setup`, `heroui-native`, `vercel-react-native-skills`
- Monorepo and quality: `turborepo`, `ultracite`
- Deployment: `deploy-to-vercel`

Load the most specific matching skill before making changes in that area, then follow its `SKILL.md` and referenced files.

# Ultracite Code Standards

This project uses **Ultracite**, a zero-config preset that enforces strict code quality standards through automated formatting and linting.

## Quick Reference

- **Format code**: `bun x ultracite fix`
- **Check for issues**: `bun x ultracite check`
- **Diagnose setup**: `bun x ultracite doctor`

Oxlint + Oxfmt (the underlying engine) provides robust linting and formatting. Most issues are automatically fixable.

---

## Core Principles

Write code that is **accessible, performant, type-safe, and maintainable**. Focus on clarity and explicit intent over brevity.

### Type Safety & Explicitness

- Use explicit types for function parameters and return values when they enhance clarity
- Prefer `unknown` over `any` when the type is genuinely unknown
- Use const assertions (`as const`) for immutable values and literal types
- Leverage TypeScript's type narrowing instead of type assertions
- Use meaningful variable names instead of magic numbers - extract constants with descriptive names

### Modern JavaScript/TypeScript

- Use arrow functions for callbacks and short functions
- Prefer `for...of` loops over `.forEach()` and indexed `for` loops
- Use optional chaining (`?.`) and nullish coalescing (`??`) for safer property access
- Prefer template literals over string concatenation
- Use destructuring for object and array assignments
- Use `const` by default, `let` only when reassignment is needed, never `var`

### Async & Promises

- Always `await` promises in async functions - don't forget to use the return value
- Use `async/await` syntax instead of promise chains for better readability
- Handle errors appropriately in async code with try-catch blocks
- Don't use async functions as Promise executors

### React & JSX

- Use function components over class components
- Call hooks at the top level only, never conditionally
- Specify all dependencies in hook dependency arrays correctly
- Use the `key` prop for elements in iterables (prefer unique IDs over array indices)
- Nest children between opening and closing tags instead of passing as props
- Don't define components inside other components
- Use semantic HTML and ARIA attributes for accessibility:
  - Provide meaningful alt text for images
  - Use proper heading hierarchy
  - Add labels for form inputs
  - Include keyboard event handlers alongside mouse events
  - Use semantic elements (`<button>`, `<nav>`, etc.) instead of divs with roles

### Error Handling & Debugging

- Remove `console.log`, `debugger`, and `alert` statements from production code
- Throw `Error` objects with descriptive messages, not strings or other values
- Use `try-catch` blocks meaningfully - don't catch errors just to rethrow them
- Prefer early returns over nested conditionals for error cases

### Code Organization

- Keep functions focused and under reasonable cognitive complexity limits
- Extract complex conditions into well-named boolean variables
- Use early returns to reduce nesting
- Prefer simple conditionals over nested ternary operators
- Group related code together and separate concerns

### Security

- Add `rel="noopener"` when using `target="_blank"` on links
- Avoid `dangerouslySetInnerHTML` unless absolutely necessary
- Don't use `eval()` or assign directly to `document.cookie`
- Validate and sanitize user input

### Performance

- Avoid spread syntax in accumulators within loops
- Use top-level regex literals instead of creating them in loops
- Prefer specific imports over namespace imports
- Avoid barrel files (index files that re-export everything)
- Use the project's established image/media component patterns instead of raw `<img>` tags when reusable sizing, loading, or optimization behavior exists

### Framework-Specific Guidance

**TanStack Start:**

- Use route `head` options for metadata and SEO
- Use `createServerFn` or Hono API routes for server-only work
- Use TanStack Router loaders and TanStack Query for data loading/caching where appropriate

**React 19+:**

- Use ref as a prop instead of `React.forwardRef`

**Solid/Svelte/Vue/Qwik:**

- Use `class` and `for` attributes (not `className` or `htmlFor`)

---

## Testing

- Write assertions inside `it()` or `test()` blocks
- Avoid done callbacks in async tests - use async/await instead
- Don't use `.only` or `.skip` in committed code
- Keep test suites reasonably flat - avoid excessive `describe` nesting

## When Oxlint + Oxfmt Can't Help

Oxlint + Oxfmt's linter will catch most issues automatically. Focus your attention on:

1. **Business logic correctness** - Oxlint + Oxfmt can't validate your algorithms
2. **Meaningful naming** - Use descriptive names for functions, variables, and types
3. **Architecture decisions** - Component structure, data flow, and API design
4. **Edge cases** - Handle boundary conditions and error states
5. **User experience** - Accessibility, performance, and usability considerations
6. **Documentation** - Add comments for complex logic, but prefer self-documenting code

---

Most formatting and common issues are automatically fixed by Oxlint + Oxfmt. Run `bun x ultracite fix` before committing to ensure compliance.
