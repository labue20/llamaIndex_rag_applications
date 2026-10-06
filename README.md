# llamaIndex_rag_applications

## Running the tests

Tests never call OpenAI or touch your real accounts, index or uploads. They also run automatically on every push (see `.github/workflows/tests.yml`).

**Backend** (from `llama_index_web_app/server`):

```bash
.venv/bin/pip install -r requirements-dev.txt   # first time only
.venv/bin/python -m pytest
```

**Frontend** (from `llama_index_web_app/rag-web-app`):

```bash
CI=true npm test -- --watchAll=false
```
