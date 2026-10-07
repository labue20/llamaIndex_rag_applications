# Dokkiman

## Running the tests

Tests never call OpenAI or touch your real accounts, index or uploads. They also run automatically on every push (see `.github/workflows/tests.yml`).

**Backend** (from `dokkiman/server`):

```bash
.venv/bin/pip install -r requirements-dev.txt   # first time only
.venv/bin/python -m pytest
```

**Frontend** (from `dokkiman/web`):

```bash
CI=true npm test -- --watchAll=false
```

## Deployment

See [docs/DEPLOY_AWS_LIGHTSAIL.md](docs/DEPLOY_AWS_LIGHTSAIL.md) for running the app on an AWS Lightsail server with HTTPS. The scripts and configs are in `dokkiman/deploy/`.
