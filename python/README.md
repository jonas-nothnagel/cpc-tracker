# Python Pipeline

LLM-powered analysis pipeline for policy coherence assessment.

## Setup

```bash
# Install uv (if not already installed)
curl -LsSf https://astral.sh/uv/install.sh | sh

# Create virtual environment and install dependencies
cd python
uv venv
source .venv/bin/activate
uv pip install -e ".[dev]"
```

## Configuration

Copy `.env.example` from the project root to `.env` and set your API keys:

```bash
cp ../.env.example ../.env
# Edit ../.env with your OPENROUTER_API_KEY
```

## Running the Pipeline

```bash
cd python
source .venv/bin/activate
python -m src.run_analysis
```

This runs:
1. Thematic classification (NBS + themes)
2. Theme-filtered pair generation
3. Target decomposition (Agent 1)
4. Pairwise alignment assessment (Agent 2)
5. Saves results to `output/`

## Converting Results

After running the pipeline, convert JSON outputs to TypeScript:

```bash
python -m src.convert_to_ts
```

Generates `mongolia-classifications.ts` and `mongolia-alignment.ts` in `src/data/`.

## Files

- `src/classify.py` - Thematic classification
- `src/align.py` - Target decomposition + alignment
- `src/run_analysis.py` - Main orchestrator
- `src/convert_to_ts.py` - JSON to TypeScript converter
- `src/llm.py` - Async LLM client with caching
- `src/config.py` - Configuration
