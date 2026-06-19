# mlx-ranker (fork of llm-checker) — Agent Guide

This project extends [llm-checker](https://github.com/Pavelevich/llm-checker) (v3.6.0, JavaScript/Node.js) with **MLX backend support for Apple Silicon**. The fork is at `github.com/jimicze/llm-checker` (branch `main`). MLX features are fully implemented — see `docs/superpowers/plans/2026-06-19-mlx-backend-for-llm-checker.md`.

---

## 1. Commands

### All Commands

```bash
# HW detection + engine comparison
node bin/enhanced_cli.js hw-detect

# Compatibility check (auto-detect runtime)
node bin/enhanced_cli.js check --runtime mlx

# Model recommendations with 4D scoring
node bin/enhanced_cli.js recommend --runtime mlx --category coding

# Generate MLX/oMLX/Direct configuration
node bin/enhanced_cli.js config --model mlx-community/Qwen2.5-0.5B-Instruct-4bit

# Save oMLX config
node bin/enhanced_cli.js config --model mlx-community/Qwen2.5-0.5B-Instruct-4bit --runtime omlx --save

# Run inference with MLX
node bin/enhanced_cli.js ai-run --runtime mlx --prompt "Hello"

# List installed MLX models (from HF cache)
node bin/enhanced_cli.js installed --runtime mlx

# Sync all 5,477 MLX models from HuggingFace
node bin/enhanced_cli.js mlx-sync --all --save

# Smart recommendations
node bin/enhanced_cli.js smart-recommend --runtime mlx

# AI check
node bin/enhanced_cli.js ai-check --runtime mlx

# Help
node bin/enhanced_cli.js config --help
```

### Testing

```bash
# Run all MLX tests (Jest)
npx jest tests/mlx-*
npx jest tests/config-generator*
npx jest tests/mlx-edge-cases.test.js

# Run all tests
node tests/run-all-tests.js

# Run single test
npx jest tests/mlx-client.test.js --verbose

# All 114 MLX tests
npx jest tests/mlx-* tests/apple-silicon-mlx.test.js tests/config-generator* tests/mlx-*-edge-cases.test.js tests/mlx-edge-cases.test.js
```

### Scripts (in package.json)

```json
"scripts": {
  "dev": "node bin/enhanced_cli.js",
  "test": "node tests/run-all-tests.js",
  "test:mlx": "npx jest tests/mlx-*",
  "test:hw": "node tests/hardware-detector-regression.js",
  "hw-detect": "node bin/enhanced_cli.js hw-detect",
  "recommend": "node bin/enhanced_cli.js recommend",
  "mlx-sync": "node bin/enhanced_cli.js mlx-sync --all --save"
}
```

---

## 2. Repository Structure

### Current (Fork — llm-checker v3.6.0 + MLX)

```
mlx-ranker/
├── src/
│   ├── index.js                       ← Main LLMChecker class
│   ├── hardware/
│   │   ├── detector.js                ← Hardware detection orchestration
│   │   ├── unified-detector.js        ← Cross-platform dispatch
│   │   └── backends/
│   │       ├── apple-silicon.js       ← Apple Silicon (M1-M4) — MODIFIED for MLX
│   │       ├── cuda-detector.js
│   │       ├── rocm-detector.js
│   │       ├── intel-detector.js
│   │       └── cpu-detector.js
│   ├── mlx/                           ← NEW: all MLX-specific code
│   │   ├── client.js                  ← MLX execution (oMLX API + direct)
│   │   ├── model-catalog.js           ← MLX model discovery & seed catalog
│   │   └── index.js                   ← Barrel export
│   ├── config/
│   │   └── generator.js               ← NEW: multi-engine config generation
│   ├── ollama/
│   │   └── client.js                  ← Ollama HTTP client (reference pattern)
│   ├── models/
│   │   ├── deterministic-selector.js  ← 4D scoring engine
│   │   ├── scoring-config.js          ← Scoring weights
│   │   ├── moe-assumptions.js         ← MoE runtime profiles (has MLX!)
│   │   └── speculative-decoding-estimator.js
│   ├── runtime/
│   │   └── runtime-support.js         ← Runtime commands (has MLX!)
│   ├── utils/
│   │   └── token-speed-estimator.js   ← TPS estimation (has Apple Silicon profiles)
│   ├── calibration/
│   │   └── ...
│   ├── policy/
│   │   └── ...
│   ├── ai/                            ← AI model selector
│   ├── data/
│   │   └── model-database.js          ← SQLite catalog
│   ├── provenance/
│   │   └── model-provenance.js
│   └── ui/                            ← CLI theming
├── bin/
│   ├── cli.js                         ← Legacy CLI entry
│   ├── enhanced_cli.js                ← Main CLI (5589 lines!)
│   └── mcp-server.mjs                 ← MCP server (1368 lines)
├── tests/                             ← Jest + raw node tests
│   ├── run-all-tests.js               ← Test runner
│   ├── hardware-detector-regression.js
│   ├── mlx-client.test.js             ← NEW
│   ├── mlx-model-catalog.test.js      ← NEW
│   ├── config-generator.test.js       ← NEW
│   └── mlx-integration.test.js        ← NEW
├── docs/
│   ├── guides/
│   │   ├── usage-guide.md
│   │   └── mlx-guide.md               ← NEW
│   └── superpowers/plans/
├── package.json
├── README.md
└── LICENSE
```

---

## 3. Architecture Overview

### Current Architecture (llm-checker v3.6.0)

```
User Input (CLI / MCP)
    │
    ▼
Commander.js CLI (bin/enhanced_cli.js — 5589 lines)
    │
    ▼
LLMChecker class (src/index.js — 2513 lines)
    │
    ├── HardwareDetector → detects CPU/GPU/RAM/OS
    │   └── Backends: apple-silicon, cuda, rocm, intel, cpu
    │
    ├── ExpandedModelsDatabase → SQLite model catalog
    │
    ├── DeterministicModelSelector → 4D scoring (Quality, Speed, Fit, Context)
    │   └── runtime-agnostic — accepts runtime parameter
    │
    ├── OllamaClient → HTTP client to localhost:11434
    │
    ├── ConfigGenerator (NEW) → generates MLX/omlx/Ollama configs
    │
    └── MLXClient (NEW) → MLX execution (oMLX API + direct)
```

### MLX Backend Extension (Implemented)

```
CLI (--runtime mlx flag, auto-detect on Apple Silicon)
    │
    ▼
LLMChecker
    │
    ├── AppleSiliconDetector.mlxAvailable()  ← detects Python mlx_lm package
    ├── MLXModelCatalog                      ← 5,477 synced models from HF
    │   ├── getModelByHardware(mem, useCase)  ← with 4D scoring
    │   └── searchHuggingface(query)          ← cursor-based pagination
    ├── MLXClient                            ← oMLX API + direct subprocess
    │   ├── Mode A (oMLX API): POST :8000/v1/chat/completions
    │   └── Mode B (Direct): python3 -m mlx_lm generate ...
    └── ConfigGenerator                      ← MLX, oMLX, Ollama, llama.cpp
        ├── generateMLXRunCommand()           ← mlx_lm.generate with --kv-bits
        ├── generateMLXServerCommand()        ← mlx_lm.server port 8080
        ├── generateOMLXSetupCommand()        ← full model_settings.json
        ├── generateOllamaModelfile()          ← Ollama Modelfile
        └── generateLLamaCppCommand()         ← llama-cli command
```

### Key Design Decisions

- **MLX models not in SQLite** — Separate catalog (`src/mlx/model-catalog.js`) with curated seed + optional HuggingFace API queries. The SQLite schema is Ollama-registry-specific.
- **oMLX as primary MLX path** — OpenAI-compatible API makes integration trivial. Direct mode is fallback for users who don't want a server.
- **All MLX new code is optional** — Graceful fallback if MLX not installed. `--runtime ollama` (default) works identically to upstream.
- **ConfigGenerator is engine-agnostic** — Generates configs for MLX, oMLX, Ollama, and llama.cpp from the same use-case presets.

### Boundaries & Restrictions

- `src/mlx/` MUST NOT import from `src/ollama/` — they are sibling backends
- `src/config/generator.js` MAY import from `src/mlx/` but NOT from `src/ollama/`
- `src/hardware/backends/apple-silicon.js` SHOULD remain focused on detection only
- `bin/enhanced_cli.js` (5589 lines) is the megafile — prefer adding code to `src/` modules rather than bloating it further
- MCP tools for MLX go in `bin/mcp-server.mjs`, following existing patterns

---

## 4. Code Style & Conventions

### Language & Runtime
- **JavaScript (Node.js 16+)** — llm-checker is 97% JavaScript, some Python scripts
- **CommonJS** modules (`require` / `module.exports`)
- **MCP server** uses ES modules (`.mjs` extension) — `import` / `export`

### Import Style (upstream convention)

```javascript
// Third-party first
const chalk = require('chalk');
const { Command } = require('commander');

// Internal modules
const HardwareDetector = require('./hardware/detector');
const { normalizeRuntime } = require('./runtime/runtime-support');

// Lazy requires inside methods (upstream pattern)
_getOllamaClient() {
    if (!this.ollamaClient) {
        const OllamaClient = require('./ollama/client');
        this.ollamaClient = new OllamaClient();
    }
    return this.ollamaClient;
}
```

### Naming Conventions

| Convention | Example | Notes |
|---|---|---|
| Files: `kebab-case.js` | `apple-silicon.js`, `runtime-support.js` | Upstream standard |
| Classes: `PascalCase` | `class MLXClient`, `class AppleSiliconDetector` | |
| Methods: `camelCase` | `checkAvailability()`, `getLocalModels()` | |
| Constants: `UPPER_SNAKE` | `SUPPORTED_RUNTIMES`, `MLX_MODES` | |
| Async: `async/await` | `async checkAvailability() { ... }` | No raw promises or callbacks |
| Private-ish: underscore prefix | `this._pendingCheck = null` | Not truly private, convention only |

### Error Handling Pattern

```javascript
// Upstream style: throw descriptive Error objects
async function getLocalModels() {
    const availability = await this.checkAvailability();
    if (!availability.available) {
        throw new Error(`MLX not available: ${availability.error}`);
    }
    try {
        // ... operation ...
    } catch (error) {
        throw new Error(`Failed to do X: ${error.message}`);
    }
}

// Availability checks return status objects, not throw
async checkAvailability() {
    if (this.isAvailable !== null && Date.now() - this.lastCheck < this.cacheTimeout) {
        return this.isAvailable;
    }
    // ...
    return { available: true, version: '...' };
}
```

### Comments
- Upstream code is sparsely commented — do NOT add comments unless the logic is genuinely non-obvious
- JSDoc-style comments on class methods are acceptable for public API

### Module Size
- Upstream has a megafile problem (`src/index.js` at 2513 lines, `bin/enhanced_cli.js` at 5589 lines)
- NEW modules SHOULD be focused: target <300 lines per file
- MLX code: `client.js`, `model-catalog.js` — keep each <400 lines

### Testing Pattern
- New MLX code: Jest (`describe`/`test`/`expect`)
- Existing llm-checker tests: raw Node.js assertion scripts
- Follow Jest conventions for all NEW tests

---

## 5. Testing

### Test Framework
- **Existing tests:** Raw Node.js scripts run with `node tests/...`
- **NEW MLX tests:** **Jest** (already in llm-checker devDependencies)
- **Runner:** `node tests/run-all-tests.js` for existing, `npx jest` for new

### Test Organization

```bash
tests/
├── run-all-tests.js                    # Orchestrator (runs all other test scripts)
├── hardware-detector-regression.js     # Hardware detection tests
├── mlx-client.test.js                  # NEW: Jest tests for MLXClient
├── mlx-model-catalog.test.js           # NEW: Jest tests for MLXModelCatalog
├── config-generator.test.js            # NEW: Jest tests for ConfigGenerator
├── apple-silicon-mlx.test.js           # NEW: Jest tests for MLX detection
└── mlx-integration.test.js             # NEW: Jest integration tests
```

### Writing a New MLX Test

```javascript
const MLXClient = require('../src/mlx/client');

describe('MLXClient', () => {
    // Arrange: create instance with controlled options
    const client = new MLXClient({ mode: 'direct' });

    test('normalizeBaseURL adds /v1', () => {
        // Act
        const result = client.normalizeBaseURL('localhost:8000');
        // Assert
        expect(result).toBe('http://localhost:8000/v1');
    });
});
```

### What Should Be Tested
- **Unit tests for MLXClient:** URL normalization, error classification, token calculation, availability caching
- **Unit tests for ConfigGenerator:** All use-case presets, run command generation for each engine
- **Unit tests for MLXModelCatalog:** Seed model integrity, hardware filtering, memory estimation, quantization mapping
- **Integration tests:** Full pipeline (HW detection → model recommendation → config generation) — verify coherence, not external connectivity
- **Do NOT test:** Actual oMLX server connectivity (need mock/stub), actual mlx_lm subprocess execution

### Fixture Conventions
- No test fixtures used yet. If needed, use `tests/fixtures/` directory with JSON data files.
- For mock hardware profiles, create test data inline or in `tests/fixtures/hardware/`.

---

## 6. Workflow Rules

### Can Do Automatically (No Need to Ask)
- Create, modify, or delete files under `src/mlx/`, `src/config/`, `tests/` (new tests), `.opencode/`
- Edit `src/hardware/backends/apple-silicon.js` to add MLX detection methods
- Edit `bin/enhanced_cli.js` to add `--runtime` flag and MLX dispatch functions
- Edit `bin/mcp-server.mjs` to add MLX MCP tools
- Edit `src/index.js` to wire in MLX modules
- Run tests, check output, fix failures
- Run `npm install` (but not `npm install <new-package>`)
- Format, refactor, rename within existing patterns
- Update `AGENTS.md`, `.opencode/LEARNINGS.md`, `.opencode/PROGRESS.md`, `.opencode/MEMORY.md`
- Edit markdown documentation

### Must Ask First
- Adding new npm dependencies (ask if they're appropriate)
- Modifying CI configuration (`.github/`, etc.)
- Deleting files or directories
- Editing `src/index.js` (the 2513-line megafile) — prefer creating new modules
- Modifying the scoring system (`deterministic-selector.js`, `scoring-config.js`)
- Modifying the SQLite database schema (`src/data/model-database.js`)
- Rebasing or force-pushing
- Any change that breaks existing tests
- Adding a new system dependency (Python package, system binary)

### Must Never Do
- Commit API keys, tokens, passwords, or secrets
- Commit large binary files (>10MB)
- Force push to `main` branch
- Modify `LICENSE` file
- Generate or commit model weight files
- Add code that calls external APIs without error handling and timeouts
- Use synchronous filesystem operations in request paths
- Modify `node_modules/` or commit it
- Remove `console.log` debugging without adding proper logging first

---

## 7. Environment & Dependencies

### Required Runtimes

| Tool | Version | Notes |
|---|---|---|
| Node.js | >= 16.0.0 | Required by llm-checker |
| npm | >= 8.0.0 | Ships with Node |
| Python 3 | >= 3.10 | Only needed for MLX direct mode / mlx-lm |

### macOS-Specific Requirements

- **Apple Silicon** required for MLX backend
- macOS 14.0+ (Sonoma) recommended
- For MLX direct mode: `pip install -U mlx-lm`
- For oMLX mode: `brew install omlx` (after we implement support)

### Installing Dependencies

```bash
# Clone llm-checker (after forking)
git remote add upstream https://github.com/Pavelevich/llm-checker.git
git pull upstream main

# Install node dependencies
npm install

# Install optional SQLite support (needed for search/sync commands)
npm install --include=optional

# Install MLX (if using direct mode on Apple Silicon)
pip install -U mlx-lm
```

### Environment Variables (llm-checker upstream)

| Variable | Default | Description |
|---|---|---|
| `OLLAMA_HOST` | `http://localhost:11434` | Ollama server URL |
| `OLLAMA_BASE_URL` | — | Ollama URL alias (backwards compat) |
| `LLM_CHECKER_VRAM_GB` | — | Override detected VRAM |
| `LLM_CHECKER_RAM_GB` | — | Override detected RAM |
| `LLM_CHECKER_NO_GPU` | — | Disable GPU detection |
| `LLM_CHECKER_OFFLINE` | — | Fully offline mode |
| `LLM_CHECKER_LOG_LEVEL` | `info` | Log verbosity |

### Environment Variables (NEW — MLX)

| Variable | Default | Description |
|---|---|---|
| `MLX_HOST` | `http://localhost:8000` | oMLX server URL |
| `MLX_MODE` | `omlx` | `omlx` (API) or `direct` (subprocess) |
| `MLX_MODEL_DIR` | `~/.mlx/models` | Local MLX model directory |
| `OMLX_HOST` | `http://localhost:8000` | oMLX alias |

### Gotchas

- **Rosetta 2:** If Python runs under Rosetta on Apple Silicon, MLX won't detect Metal. Always use native ARM Python.
- **macOS wired memory limit:** For very large models (>70% of RAM), you may need: `sudo sysctl iogpu.wired_limit_mb=N`
- **oMLX port conflict:** oMLX defaults to 8000, which may conflict with other services. Set `OMLX_HOST` to change.
- **mlx_lm subprocess:** `mlx_lm.generate` writes logs to stderr, output to stdout. The `_generateDirect` method may need stderr filtering in practice.
- **`systeminformation` npm package:** Used for hardware detection. Can be slow (1-3 seconds) on first call — this is expected.

---

## 8. Agent Execution Strategy

### Parallel Execution (mandatory)
- **Always spin up subagents for independent tasks and maximize parallel execution.** Never do sequentially what can be done in parallel. Examples: searching multiple directories, running lint and tests simultaneously, reading unrelated files.
- **Launch multiple subagents in a single message** when tasks are independent. Do not wait for one to finish before starting another.

### Subagent Nesting
- **General subagents MUST delegate further and maximize parallel execution** when they receive compound tasks. A General subagent should spin up Explore subagents for read-only research and additional General subagents for independent write tasks.
- **Explore subagents are leaf nodes.** They cannot spawn further subagents. Use them as fast, focused readers.
- **Nesting hierarchy:**
  ```
  Primary (Build/Plan/Orchestrator)
    -> General (can read + write + spawn further subagents)
         -> Explore (read-only, leaf node)
         -> General (recursive — can spawn more if needed)
    -> Explore (read-only, leaf node)
  ```

### Tool Preferences
- **Prefer `task` tool over reading large files directly.** Use task with `explore` subagent for codebase searches, file discovery, and context gathering. This preserves the primary agent's context window.
- **Avoid triggering compaction.** Keep conversations lean by delegating aggressively. Compaction loses context — prevention is better than recovery.
- **Prefer Read tool over Grep for small files (<100 lines).** Use Grep for pattern searches across the codebase.

### Context Preservation
- **Delegate exploration to subagents.** Use Explore subagents for codebase searches, file discovery, and context gathering. This preserves the primary agent's context window for reasoning and code changes.
- **Minimize primary context usage.** Offload research, large file reads, and multi-step investigations to subagents. The primary agent should focus on planning, decision-making, and writing code.
- **Read only what you need.** When reading upstream llm-checker files, read specific line ranges rather than entire files. Use `grep` + `read` offset/limit for targeted reads.

### Implementation Priority (from plan)
When implementing from the plan at `docs/superpowers/plans/2026-06-19-mlx-backend-for-llm-checker.md`, follow this order:

```
Task 0: Fork & repo setup
  ↓
Task 1: src/mlx/client.js (MLX execution client)
  ↓
Task 2: Apple Silicon detection enhancement
  ↓
Task 3: CLI --runtime flag and dispatch
  ↓
Task 4: src/config/generator.js (config generator)
  ↓
Task 5: src/mlx/model-catalog.js (model catalog)
  ↓
Task 6: Wire all into LLMChecker class
  ↓
Task 7: MCP tools
  ↓
Task 8: Integration tests
  ↓
Task 9: Documentation & PR
  ↓
Task 10: Final verification
```

---

## 9. Persistent Memory

These files maintain context across agent sessions. Always read them at the start of a session and update them as you work.

| File | Purpose | Update when |
|------|---------|-------------|
| [.opencode/LEARNINGS.md](.opencode/LEARNINGS.md) | Bugs, errors, lessons learned | Resolving an issue or discovering a gotcha |
| [.opencode/PROGRESS.md](.opencode/PROGRESS.md) | Task tracking & history | Starting, completing, or pausing work |
| [.opencode/MEMORY.md](.opencode/MEMORY.md) | Decisions, patterns, preferences | Making decisions or discovering patterns |
