# Interview Prep AI

An agentic AI system that researches company-specific interview trends, conducts a personalized mock interview, evaluates your answers in real time, and delivers a comprehensive session review.

## Architecture

```
┌─────────────────────────────┐
│        Orchestrator          │  Central routing brain
│  - Judges research quality   │  - Re-enters after research and evaluation
│  - Decides interview scope   │  - Routes dynamically based on scores/quality
│  - Replans based on evals    │
└────────────┬────────────────┘
             │
┌────────────▼────────────────┐
│       Research Agent         │  Searches Glassdoor, Blind, LeetCode, etc.
└────────────┬────────────────┘
             │ (thin? → retry with broader search)
┌────────────▼────────────────┐
│       Interview Agent        │  Generates tailored questions per topic
│    + Human-in-the-loop       │  Pauses for your answer via LangGraph interrupt
└────────────┬────────────────┘
             │
┌────────────▼────────────────┐
│      Evaluation Agent        │  Scores 0–10, gives strengths/weaknesses
└────────────┬────────────────┘
             │ (score < threshold? → retry | 3 fails → skip & flag)
┌────────────▼────────────────┐
│        Critic Agent          │  End-of-session review + study plan
└────────────┬────────────────┘
             │
┌────────────▼────────────────┐
│      Persistent Memory       │  SQLite via LangGraph checkpointer
└─────────────────────────────┘
```

## Setup

### 1. Clone and install dependencies

```bash
git clone <repo>
cd InterviewAgenticAI
pip install -r requirements.txt
```

### 2. Configure environment variables

```bash
cp .env.example .env
# Edit .env and add your keys
```

You need:
- **OPENAI_API_KEY** — from [platform.openai.com](https://platform.openai.com)
- **TAVILY_API_KEY** — from [tavily.com](https://tavily.com) (free tier available)

### 3. Run the interview

```bash
python main.py
```

## How It Works

1. **You provide** the company name and target role
2. **Research Agent** runs multiple targeted searches to find interview trends, typical questions, and focus areas for that specific company/role
3. **Orchestrator** evaluates the research quality:
   - Thin results? → Broadens the search automatically
   - ML-heavy company? → Flags ML-focused interview topics
   - Generic/unknown company? → Falls back to role-based topic list
4. **Interview Agent** asks one question per approved topic, with context from prior answers
5. **You answer** in the CLI (press Enter twice to submit)
6. **Evaluation Agent** scores your answer (0–10) with detailed feedback
7. **Orchestrator** decides:
   - Score ≥ 6 → pass, next topic
   - Score < 6, attempt < 3 → retry same topic
   - 3 failed attempts → skip and flag for study
8. **Critic Agent** delivers a full session review with an overall score, key gaps, and a prioritized study plan

## Configuration

| Variable | Default | Description |
|---|---|---|
| `OPENAI_MODEL` | `gpt-4o` | OpenAI model to use |
| `PASS_SCORE_THRESHOLD` | `6.0` | Minimum score to pass a topic |
| `MAX_TOPIC_ATTEMPTS` | `3` | Max retries before skipping a topic |
| `RESEARCH_MAX_RETRIES` | `2` | Max research attempts before fallback |

## Project Structure

```
InterviewAgenticAI/
├── main.py                    # CLI entry point
├── requirements.txt
├── .env.example
└── src/
    ├── config.py              # Centralized configuration
    ├── state.py               # LangGraph state definition
    ├── graph.py               # LangGraph workflow assembly
    ├── agents/
    │   ├── research_agent.py  # Web research + synthesis
    │   ├── orchestrator.py    # Routing intelligence
    │   ├── interview_agent.py # Question generation + interrupt
    │   ├── evaluation_agent.py# Answer scoring
    │   └── critic_agent.py    # Session review
    ├── tools/
    │   └── search.py          # Tavily search wrappers
    └── memory/                # (extensible memory utilities)
```
