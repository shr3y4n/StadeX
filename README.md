# StadeX — Venue Operations Platform
### FIFA World Cup 2026 GenAI Hackathon Submission

StadeX is a multi-agent generative AI venue operations system designed to manage fan navigation, predict crowd congestion, and auto-dispatch staff alerts in real-time. It coordinates three specialized AI agents via a central router to keep stadium gates flowing and ensure instant assistance across languages.

---

## 🚀 Live Links
* **Fan Web App**: [stadex.onrender.com](https://stadex.onrender.com)
* **Staff Control Room**: [stadex.onrender.com/staff](https://stadex.onrender.com/staff)

---

## 📸 Interface Preview

### 1. Fan Assistant & Map Panel
This is where fans interact with StadeX. 
* **User Input (The Problem)**: The fan types a query or clicks the Microphone button to describe a problem (e.g., *"Where is Section 112?"*, *"Which gate has the shortest queue?"*, or asks in a foreign language like Spanish: *"¿Dónde está el baño?"*).
* **AI Output (The Solution)**: The system detects the language, answers in the fan's native tongue, reads live telemetry to find the optimal path, and **dynamically lights up the target gate on the interactive SVG stadium map** with a pulsing neon route highlight.

> **[INSERT SCREENSHOT OF FAN CHAT & MAP PATH HIGHLIGHT HERE]**
> *(Recommended filename: fan-app-screenshot.png)*

### 2. Staff Control Room Telemetry
This is where stadium operators manage flow.
* Displays live capacity meters and queue wait times for all 6 gates, updating every 3 seconds.
* **GenAI Alerts**: When a gate's occupancy crosses the critical threshold (85%), StadeX automatically routes telemetry data to the **Crowd Intelligence Agent** to generate direct, actionable staff commands (e.g., *"Gate B is at 88% and rising. Direct overflow traffic to Gate C immediately"*). Staff can resolve and clear alerts in real-time.

> **[INSERT SCREENSHOT OF STAFF DASHBOARD & ACTIVE ALERTS FEED HERE]**
> *(Recommended filename: staff-dashboard-screenshot.png)*

---

## 🛠️ System Architecture

StadeX is built as a unified full-stack Node.js + React system using Claude API tool-routing:

```
Fan App ───┐                    ┌── Navigation Agent (Map routing & FAQs)
           ├──> Orchestrator ───┼── Crowd Agent (Wait times & Staff Alerts)
Staff Dash ┘        │           └── Language Agent (Auto-translation & Speech)
                     │
                     v
             Live Data Feed (Shared gate occupancy & queues)
```

1. **The Orchestrator**: Intercepts fan and staff requests. Instead of general-purpose chatting, it uses Claude's tool-calling protocol to route the message to the single best specialist agent.
2. **Navigation Agent**: Grounded in venue structural data (`gates.json`, `policies.json`). Directs fans, explains stadium policies, and highlights entry paths.
3. **Crowd Intelligence Agent**: Monitors live occupancy numbers. Generates concise, 2-sentence staff alert dispatches to resolve bottlenecks before kickoff.
4. **Language Agent**: Integrates with the browser's Web Speech API to auto-detect language inputs, translate them, and read responses back aloud.

*Note: StadeX has a built-in **High-Fidelity Mock Mode** that activates automatically if no Anthropic API key is supplied, ensuring the application remains 100% functional and demoable offline.*

---

## 💻 Tech Stack
* **Frontend**: React, Vite, Tailwind CSS, Lucide Icons, Web Speech API (Speech Recognition & Speech Synthesis).
* **Backend**: Node.js, Express, CORS, Dotenv.
* **LLM Core**: Anthropic Claude API (`claude-3-5-sonnet-20241022`).

---

## ⚙️ Running Locally

### Prerequisites
* **Node.js** (v18 or higher)
* **Git**

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/shr3y4n/StadeX.git
   cd StadeX
   ```
2. Set up backend environment config (Optional, mock fallback operates automatically if left blank):
   Create `server/.env` and add:
   ```env
   ANTHROPIC_API_KEY=your_anthropic_api_key_here
   PORT=3001
   ```

### Quick Launch (Windows)
We have included a launch script that boots the backend API, Fan App, and Staff Dashboard in separate windows:
```powershell
./start_all.ps1
```
* Access the **Fan App** at `http://localhost:5173`
* Access the **Staff Dashboard** at `http://localhost:5174`

---

## 🏆 Presentation Script (90-Second Hackathon Demo)
1. **Explain the Pain Point**: *"Stadium entry gates clog, staff are blind, and foreign fans get lost."*
2. **Voice & Map Demo**: Open the **Fan App**, switch language to Spanish, and click the mic: *"¿Dónde está la Puerta C?"*. Show StadeX replying in Spanish while the SVG map immediately highlights Gate C.
3. **Shortest Queue Demo**: Ask in English: *"Which gate has the shortest line?"*. Show StadeX comparing live gate capacities to direct you to Gate C.
4. **Control Room Sync**: Place the **Staff Dashboard** side-by-side. Watch the gate capacity dials update every 3 seconds. Point to Gate B turning red; within seconds, show the AI-generated operational alert telling staff to redirect traffic. Resolve it in one click.
5. **Close**: *"One code repository, one orchestrator, routing specialists in real-time grounded in live data. That is StadeX."*
