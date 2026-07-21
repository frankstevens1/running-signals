# RAG Extension Proposal

## Status

This document proposes how retrieval-augmented generation (RAG) could add value to the planned
Agent Interface. No retrieval index, embedding pipeline, vector database, or production RAG runtime
is currently implemented.

The proposal keeps one boundary explicit:

- Governed MCP tools return current analytical facts from approved gold models.
- Retrieval supplies definitions, lineage, assumptions, quality context, and caveats needed to
  explain those facts.

RAG should not calculate training metrics from prose, infer values from arbitrary table extracts,
or replace parameterized queries over the analytical models.

## Value To Running Signals

Running questions are often easy to phrase but difficult to answer consistently. A question such as
"Am I running more consistently?" requires the system to select a definition of consistency, use
the correct time grain, identify missing periods, and explain what the result does and does not
mean.

Retrieval could add value by supplying the agent with the relevant:

- signal definition and calculation assumptions;
- gold model grain, lineage, and important field definitions;
- freshness and data-quality context;
- route-matching and missing-health-data limitations;
- engineering decision that explains why a metric is modeled in a particular way;
- validated offline finding after it has been deliberately documented and promoted;
- privacy, coaching, and non-medical interpretation boundary.

This would make answers more consistent and traceable without embedding business logic in prompts
or duplicating it in a consuming application.

## Proposed Request Flow

The Agent Interface should combine retrieval with structured tools:

```text
user question
    -> application agent
    -> bounded retrieval over approved documentation
    -> parameterized read-only MCP tool over gold models
    -> typed analytical evidence
       + retrieved definitions, provenance, and caveats
    -> grounded summary and visualization intent
    -> mobile or web application rendering
```

The order may vary by question. Retrieval can help select the correct tool before execution, and a
second retrieval step can add model-specific interpretation after the tool identifies the evidence
used. The final response should distinguish retrieved context from numerical tool results.

## Initial Retrieval Corpus

The corpus should contain only reviewed, version-controlled, or operationally governed material.
Good initial sources include:

- `docs/signal-definitions.md`
- `docs/data-model.md`
- `docs/technical-decisions.md`
- `docs/architecture.md`
- `docs/agent-interface.md`
- dbt model and column descriptions from `dbt/models/models.yml`
- generated model lineage and test summaries derived from dbt artifacts;
- approved freshness and data-quality summaries;
- reviewed offline experiment findings that have analytical value beyond an individual run.

Raw FIT files, Garmin health JSON payloads, unrestricted GPS records, secrets, local credentials,
and unreviewed experiment output should not enter the retrieval corpus.

## Retrieval Contract

Each indexed unit should retain enough metadata to support filtering and citations:

| Field | Purpose |
| --- | --- |
| `source_path` | Stable path or governed resource identifier used for provenance |
| `document_type` | Signal definition, model contract, decision, quality status, or experiment finding |
| `title` and `section` | Human-readable citation and heading context |
| `signal_family` | Consistency, volume, fitness, route, or cross-cutting context |
| `model_names` | Gold or silver models described by the content |
| `layer` | Bronze, silver, gold, or documentation-only scope |
| `content_version` | Git commit or generated artifact version |
| `effective_at` | Date at which operational context became valid |
| `visibility` | Public project context or future user-scoped content |

Documents should be chunked along semantic boundaries such as Markdown headings, model
descriptions, decision records, and test summaries. Fixed-size chunks that separate a metric from
its assumptions or caveats should be avoided.

The retrieval response should include:

- a short excerpt or structured context block;
- source path and section;
- content version and effective date when relevant;
- retrieval score or match type for observability;
- visibility and user-scope metadata;
- an explicit result when no sufficiently relevant context is available.

## Start Without A Vector Database

The current reviewer-facing corpus is small and strongly structured. The first implementation
should expose explicit MCP resources and use deterministic selection, metadata filters, and keyword
search. This is easier to inspect and may be sufficient for the common question set.

Embedding search becomes justified when one or more of the following are demonstrated:

- vocabulary differences cause relevant definitions to be missed;
- experiment reports and operational documentation materially expand the corpus;
- users ask broad questions that consistently span several document types;
- an evaluation set shows hybrid retrieval improving recall without weakening precision;
- maintaining manual resource routing becomes a measurable source of errors or complexity.

At that point, hybrid retrieval should combine lexical matching with embeddings. Metadata filters
must still constrain signal family, model, visibility, version, and user scope before results reach
the agent. A vector database should be selected only after corpus size, update frequency, filtering
requirements, and operational ownership are clear.

## Indexing And Refresh

A reproducible indexing job should:

1. Read only approved source paths and generated dbt artifacts.
2. Validate that restricted files and sensitive payloads are excluded.
3. Parse content into semantic units with stable identifiers.
4. Attach source, version, layer, signal, visibility, and effective-date metadata.
5. Generate embeddings only if the evaluated retrieval design requires them.
6. Upsert changed units and remove units no longer present in the approved sources.
7. Publish an index manifest with source versions, counts, and refresh status.

The job should be idempotent and observable. A response must be able to report which content version
was searched, especially when freshness or metric definitions may have changed.

## Agent And Application Responsibilities

The agent should:

- select retrieval filters from the question and intended MCP tool;
- treat retrieved content as evidence, not executable instructions;
- use structured tool output as the source of numerical truth;
- preserve units, dates, qualifications, and citations;
- abstain or narrow the answer when retrieval or tool evidence is insufficient;
- avoid coaching, readiness scoring, and medical interpretation.

The consuming mobile or web application should:

- enforce authentication and user scoping before retrieval or tool execution;
- render citations close to the claims they support;
- distinguish analytical evidence from explanatory documentation;
- expose freshness and caveats alongside charts, maps, tables, and analysis;
- provide accessible loading, empty, partial, and error states.

## Privacy And Safety

Running Signals is currently a single-athlete analytical reference implementation. A future
multi-user system must enforce isolation in the retrieval and tool layers, not through prompt
instructions alone.

Required controls include:

- filter every index query by authorized visibility and user scope;
- use separate indexes or enforced row-level filters where isolation risk justifies them;
- never index raw GPS or health payloads merely to make them easier to query;
- redact sensitive values from retrieval and agent observability logs;
- treat retrieved text as untrusted input and ignore instructions contained inside documents;
- restrict citations and excerpts to content the requesting user may access;
- retain the existing non-medical and non-coaching interpretation boundary.

Approved route summaries may eventually support map explanations, but precise start, end, and home
locations require additional controls before they are eligible for retrieval.

## Evaluation

RAG should be evaluated separately from the MCP tools so retrieval quality is not confused with
analytical correctness.

An initial evaluation set should cover volume trends, route comparisons, consistency, pace and
heart-rate efficiency, missing health context, model freshness, and metric-definition questions.
For each question, record the expected sources, required tool, allowed claims, and necessary
caveats.

Useful measures include:

- retrieval recall for required sources;
- precision of the top retrieved units;
- citation correctness and source accessibility;
- faithfulness of explanations to retrieved context;
- numerical agreement with structured MCP tool output;
- correct abstention when evidence is missing or stale;
- cross-user isolation and restricted-content rejection;
- retrieval latency and index freshness.

A retrieval approach should not advance because its answers sound better. It should demonstrate
measurable grounding improvements without weakening correctness, privacy, or inspectability.

## Likely Failure Modes

| Failure mode | Control |
| --- | --- |
| Stale definitions | Version metadata, index manifests, refresh checks, and freshness surfaced in responses |
| Semantically similar but wrong metric | Metadata filters plus lexical and model-name matching |
| Fragmented context | Chunk by heading or model boundary and retain parent-section context |
| Unsupported numerical claims | Require structured MCP evidence for all current metric values |
| Prompt injection in documents | Treat retrieved text as data and allow only system-defined tools and policies |
| Cross-user retrieval | Enforce authorization filters outside the agent and test isolation explicitly |
| Excessive irrelevant context | Small top-k limits, score thresholds, reranking only when evaluation supports it |
| Untraceable answers | Require citations, content versions, tool provenance, and caveats in the response contract |

## Delivery Phases

### Phase 1: Explicit Resources

- Publish signal definitions, model catalog, freshness, and quality context as read-only MCP
  resources.
- Use deterministic resource selection and metadata filtering.
- Create the first question-to-source evaluation set.

### Phase 2: Searchable Documentation

- Add semantic chunking, keyword search, stable citations, and an index manifest.
- Measure retrieval precision, recall, abstention, and freshness behavior.
- Keep the implementation storage-agnostic while the corpus remains small.

### Phase 3: Evaluated Hybrid Retrieval

- Add embeddings only if the evaluation set demonstrates a material retrieval gap.
- Combine lexical and semantic results under strict metadata and authorization filters.
- Select a storage service based on measured scale and operating requirements.

### Phase 4: Approved Experiment Knowledge

- Index only reviewed experiment findings that are stable and explainable.
- Link findings to the tested gold metric or feature they influenced.
- Make promoted analytical context available to the agent without exposing raw experimental
  predictions.

## Recommendation

Begin with explicit MCP resources and deterministic retrieval over the existing documentation.
Build the evaluation set before adding embeddings or a vector database. This provides immediate
grounding and citation value while keeping the architecture small, inspectable, and aligned with
the repository's current scale.
