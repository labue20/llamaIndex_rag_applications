# Dokkiman

PDF tools as a web app (dokkiman.com): chat with PDFs (AI), PDF↔Word, split,
compress, edit, e-sign (sign yourself or send for signature), a Document
Manager, plans and billing (Stripe), and an admin portal.

## Layout

- `dokkiman/server/`: Flask API (`flask_demo.py` plus blueprints `billing`,
  `signature_requests`, `folders`, `account`, `admin`). SQLite accounts DB
  (`db.py`). PDF work uses PyMuPDF (`fitz`), with one `*_service.py` per tool.
  Word→PDF uses LibreOffice. The document index and AI chat run in a separate
  process (`index_server.py`, port 5602), reached through `manager`.
- `dokkiman/web/`: React (Create React App). One folder per tool in
  `src/features/<tool>/` (components, styles, tests next to the code), shared
  code in `src/shared/`. Routes are in `src/routes.js`, and the tool list for
  the homepage is in `src/features/home/tools.js`.
- `dokkiman/deploy/`: production setup (Caddy, systemd, `deploy.sh`).
- `start_services.sh` runs the API (5601) and the index server (5602) locally.
  The web dev server runs on 3000.

## Tests

- Backend: `cd dokkiman/server && .venv/bin/python -m pytest -q`
- Frontend: `cd dokkiman/web && CI=true npx react-scripts test --watchAll=false`
- Lint: `cd dokkiman/web && npx eslint src --max-warnings=0`

Every change comes with tests: pytest for each route and service, and Jest +
Testing Library for components (query by role and label, as a user would).
Tests fake the network (`global.fetch = jest.fn(...)`); nothing calls real
services.

## Rules that matter in review

**Security**
- Every API route needs a login, except auth endpoints and the paths in
  `GUEST_PATHS` (`server/auth.py`). A new tool that guests may try must be
  added there, and must use `@limit_conversions` (`plans.py`) so usage limits
  apply.
- Admin routes go in `admin.py`, which checks `is_admin` for every request.
- A user may only see or change their own documents, folders and signature
  requests. Check ownership on every route that takes an id.
- Never log or return secrets, tokens, passwords or full documents. Settings
  and keys come from the environment (`config.py`, `server/.env`), never code.
- Validate uploads (`validate_pdf_file`, size limit `MAX_UPLOAD_MB`). Use
  `secure_filename` for any name that goes into a path or a download name.
- Text from documents, signers and AI answers is untrusted. Render it as text,
  never as HTML.
- The site's Content Security Policy blocks `fetch()` of `data:` URLs. Convert
  them with `dataUrlToBlob` (`src/shared/utils`).

**Behavior**
- Error messages are shown to users: plain language, say what to do next, no
  stack traces or internal names. Services raise their own error type (e.g.
  `SplitError`, `EditError`) whose message is safe to show; routes turn it into
  a 400. Anything else is logged and returns a general 500 message.
- Plan limits (documents, questions, conversions, signature requests) are
  enforced on the server in `plans.py`. The browser only displays them.
- Positions on PDF pages are fractions of the page as shown (0–1), so they work
  for any page size and rotation. Rotated pages must be handled.
- Layouts must work on phones (about 390px wide) as well as desktop.

**Code style**
- Match the code around it: short doc comments that explain why, small
  functions, BEM class names in SCSS (`block__element--modifier`).
- New tools follow the existing ones (for a one-file tool, `split-pdf` and
  `compress-pdf`): a `*_service.py`, a route in `flask_demo.py`, a feature
  folder, an entry in `App.js`, `routes.js` and `home/tools.js`.

## Workflow

- Work on `dev`. Changes reach `master` (production) through a pull request,
  which Claude reviews (`.github/workflows/claude-review.yml`) and the Tests
  workflow checks. Deploying from `master` is a separate, manual step.
  Deploy with `dokkiman/deploy/release.sh` (from your machine): it runs
  `deploy.sh` on the server and tags the live commit `deploy-YYYY-MM-DD`.
