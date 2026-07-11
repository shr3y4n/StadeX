import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '../shared/data');

// Helper to read JSON data safely
const readJsonFile = (filename) => {
  try {
    const filePath = path.join(DATA_DIR, filename);
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`Error reading ${filename}:`, error);
    return null;
  }
};

// Initialize Anthropic client if key is available
const apiKey = process.env.ANTHROPIC_API_KEY;
let anthropic = null;
if (apiKey && apiKey.trim() !== '' && !apiKey.includes('your_key_here')) {
  anthropic = new Anthropic({ apiKey });
} else {
  console.warn('⚠️ ANTHROPIC_API_KEY is not set. Running in High-Fidelity MOCK mode.');
}

// ----------------------------------------------------
// Agent System Prompts (as defined in build guide)
// ----------------------------------------------------

const ORCHESTRATOR_SYSTEM = `You are the routing orchestrator for a FIFA World Cup 2026 stadium AI system.
You do not answer questions directly. For every incoming message, decide which
specialist agent should handle it and call exactly one of these tools:

- navigation_agent: for questions about finding seats, gates, restrooms, food,
  merchandise, or getting around the stadium.
- crowd_agent: for questions about current wait times, congestion, gate status,
  or for generating operational alerts for staff.
- language_agent: for messages in a non-English language, or explicit requests
  for translation.

If the message could fit more than one agent, pick the single best match.
Never answer the user's question yourself — always route to a tool.`;

const NAVIGATION_SYSTEM = `You are the Navigation Agent for a FIFA World Cup 2026 stadium AI copilot.
You help fans get around the stadium quickly and clearly.

Rules:
- Give short, concrete, walkable directions using the named gates and zones
  provided — do not invent gates or locations that aren't in the data.
- If multiple routes are viable, recommend the one with lower current
  occupancy from the live data, and briefly say why.
- Keep responses under 60 words unless the user asks for more detail.
- End with one concrete next action (e.g. "Head to Gate C, then follow signs
  to Section 114").`;

const CROWD_SYSTEM = `You are the Crowd Intelligence Agent for a FIFA World Cup 2026 stadium.
You have two modes depending on who is asking:

FAN MODE: Answer fan questions about current wait times or congestion in
plain, reassuring language, using the live gate occupancy/queue data provided.
Suggest an alternative if their preferred gate is congested.

STAFF MODE (used by the alert generator): Given live occupancy data, write a
short operational alert (max 2 sentences) that states the problem, predicts
the near-term trend, and recommends one specific staff action. Be direct and
actionable, like a message a control-room operator would want to read in
2 seconds. Example tone: "Gate 4 at 91% and rising — recommend opening Gate 6
overflow lane now to prevent bottleneck by kickoff."

Never fabricate numbers not present in the provided data.`;

const LANGUAGE_SYSTEM = `You are the Language Agent for a FIFA World Cup 2026 stadium AI copilot.
You receive a fan's message, which may be in any language, plus their
declared target language (or auto-detect if not given).

- Detect the input language.
- Understand the fan's underlying question (it will usually be about
  navigation, wait times, or general stadium info).
- Respond entirely in the fan's target language, in a warm, helpful,
  concise tone appropriate for a live translated conversation.
- If the question requires stadium-specific facts you don't have, say so
  honestly in their language rather than guessing.`;

// ----------------------------------------------------
// Mock Agent Responder (Fallback)
// Token overlap fuzzy-matching search (Lightweight RAG alternative)
const calculateFuzzyScore = (query, target) => {
  const queryWords = query.toLowerCase().split(/\W+/).filter(w => w.length > 2);
  const targetWords = target.toLowerCase().split(/\W+/).filter(w => w.length > 2);
  if (queryWords.length === 0) return 0;
  
  let matches = 0;
  for (const qw of queryWords) {
    for (const tw of targetWords) {
      if (tw.includes(qw) || qw.includes(tw)) {
        matches++;
        break;
      }
    }
  }
  return matches / queryWords.length;
};

// ----------------------------------------------------
const handleMockRouting = (message, role, declaredLanguage) => {
  const msg = message.toLowerCase();
  const gates = readJsonFile('gates.json') || [];
  const status = readJsonFile('gateStatus.json') || {};
  const transit = readJsonFile('transit.json') || [];
  const policies = readJsonFile('policies.json') || [];

  // 1. Language detection / matching
  const isSpanish = msg.includes('baño') || msg.includes('dónde') || msg.includes('puerta') || msg.includes('hola') || msg.includes('gracias') || declaredLanguage?.toLowerCase() === 'spanish' || declaredLanguage?.toLowerCase() === 'es';
  const isFrench = msg.includes('où') || msg.includes('porte') || msg.includes('toilette') || msg.includes('bonjour') || msg.includes('merci') || declaredLanguage?.toLowerCase() === 'french' || declaredLanguage?.toLowerCase() === 'fr';
  const isPortuguese = msg.includes('onde') || msg.includes('porta') || msg.includes('banheiro') || msg.includes('olá') || msg.includes('obrigado') || declaredLanguage?.toLowerCase() === 'portuguese' || declaredLanguage?.toLowerCase() === 'pt';
  const isChinese = msg.includes('在') || msg.includes('门') || msg.includes('厕所') || msg.includes('你好') || msg.includes('谢谢') || declaredLanguage?.toLowerCase() === 'mandarin' || declaredLanguage?.toLowerCase() === 'zh';
  const isArabic = msg.includes('أين') || msg.includes('بوابة') || msg.includes('مرحاض') || msg.includes('شكرا') || declaredLanguage?.toLowerCase() === 'arabic' || declaredLanguage?.toLowerCase() === 'ar';

  if (isSpanish || isFrench || isPortuguese || isChinese || isArabic) {
    let reply = "";
    if (isSpanish) {
      if (msg.includes('baño') || msg.includes('sanitario')) {
        reply = "El baño más cercano está justo detrás de la Sección 112 (Consecución Principal) o la Sección 124. Dirígete hacia la puerta de acceso sur (Puerta C) y sigue los carteles indicativos.";
      } else if (msg.includes('puerta') || msg.includes('linea') || msg.includes('cola') || msg.includes('espera')) {
        reply = "Actualmente la Puerta C tiene la menor ocupación (38%) con solo 3 minutos de espera. Te sugiero ingresar por allí. Evita la Puerta B, que está al 88% de capacidad.";
      } else {
        reply = "¡Hola! Bienvenidos a la Copa Mundial de la FIFA 2026. ¿En qué puedo ayudarte hoy con respecto al transporte, la navegación o las puertas de entrada?";
      }
    } else if (isFrench) {
      if (msg.includes('toilette') || msg.includes('bain')) {
        reply = "Les toilettes les plus proches se trouvent juste derrière la section 112 (hall principal) ou la section 124. Dirigez-vous vers la Porte C et suivez les panneaux.";
      } else {
        reply = "Bonjour! Bienvenue à la Coupe du Monde de la FIFA 2026. Comment puis-je vous aider aujourd'hui pour vous orienter dans le stade ?";
      }
    } else if (isPortuguese) {
      reply = "Olá! Bem-vindo à Copa do Mundo FIFA 2026. Para o trajeto mais rápido, a Portão C tem apenas 3 minutos de espera. Como posso te ajudar mais?";
    } else if (isChinese) {
      reply = "你好！欢迎来到2026年美加墨世界杯。目前C通道（Gate C）排队时间最短，仅需3分钟。请问有什么可以帮您？";
    } else if (isArabic) {
      reply = "مرحباً بك في كأس العالم FIFA 2026. البوابة C لديها أقصر خط انتظار حالياً (3 دقائق). كيف يمكنني مساعدتك اليوم؟";
    }

    return {
      agent_used: 'language_agent',
      reply,
      data: { detected_language: isSpanish ? 'Spanish' : isFrench ? 'French' : isPortuguese ? 'Portuguese' : isChinese ? 'Chinese' : 'Arabic' }
    };
  }

  // 2. Crowd Agent routing (wait times, lines, capacity)
  if (msg.includes('line') || msg.includes('wait') || msg.includes('queue') || msg.includes('shortest') || msg.includes('crowd') || msg.includes('congestion') || msg.includes('busy')) {
    // Find shortest line gate
    let shortestGate = null;
    let shortestTime = Infinity;
    Object.keys(status).forEach(key => {
      if (status[key].queue_len_min < shortestTime) {
        shortestTime = status[key].queue_len_min;
        shortestGate = key;
      }
    });

    const gateDetails = gates.find(g => g.id === shortestGate);
    const reply = `Currently, ${gateDetails ? gateDetails.name : 'Gate ' + shortestGate} has the shortest queue at only ${shortestTime} minutes (${status[shortestGate]?.occupancy_pct}% capacity). Gate B is currently heavily congested at ${status['B']?.occupancy_pct || 88}% capacity. I recommend heading to Gate ${shortestGate} for faster entry.`;

    return {
      agent_used: 'crowd_agent',
      reply,
      data: {
        gateStatus: status,
        recommended_gate: shortestGate
      }
    };
  }

  // 3. Navigation Agent routing (seats, directions, locations)
  if (msg.includes('where') || msg.includes('direction') || msg.includes('find') || msg.includes('seat') || msg.includes('restroom') || msg.includes('bathroom') || msg.includes('food') || msg.includes('merch') || msg.includes('parking') || msg.includes('gate') || msg.includes('section')) {
    let targetGate = 'C'; // Default to least crowded
    let reason = "it has the lowest queue wait time (3 mins).";

    if (msg.includes('100') || msg.includes('115') || msg.includes('north')) {
      targetGate = 'A';
    } else if (msg.includes('200') || msg.includes('215') || msg.includes('east')) {
      targetGate = 'B';
    } else if (msg.includes('116') || msg.includes('130') || msg.includes('south')) {
      targetGate = 'C';
    } else if (msg.includes('216') || msg.includes('230') || msg.includes('west')) {
      targetGate = 'D';
    } else if (msg.includes('vip') || msg.includes('suite')) {
      targetGate = 'E';
    }

    // Check if the suggested gate is super crowded, redirect to C
    if (status[targetGate] && status[targetGate].occupancy_pct > 80 && targetGate !== 'C') {
      reason = `Gate ${targetGate} is highly congested (${status[targetGate].occupancy_pct}% capacity). We suggest entering through Gate C instead, which is at ${status['C']?.occupancy_pct}% capacity and is a short walk away.`;
      targetGate = 'C';
    } else {
      reason = `Gate ${targetGate} is closest. It is currently at ${status[targetGate]?.occupancy_pct}% capacity with a ${status[targetGate]?.queue_len_min} min wait.`;
    }

    const gateInfo = gates.find(g => g.id === targetGate);
    const reply = `To reach your area, use ${gateInfo ? gateInfo.name : 'Gate ' + targetGate} (${gateInfo ? gateInfo.location : ''}). ${reason} Head to Gate ${targetGate}, then follow the colour-coded walkway signs directly to your section.`;

    return {
      agent_used: 'navigation_agent',
      reply,
      data: {
        recommended_gate: targetGate,
        gates,
        gateStatus: status
      }
    };
  }

  // 4. Fuzzy RAG search across policies (Feature 2)
  let bestPolicy = null;
  let highestScore = 0;
  for (const p of policies) {
    // Weight category match twice as high as general rule text match
    const score = (calculateFuzzyScore(msg, p.category) * 2.0) + calculateFuzzyScore(msg, p.rule);
    if (score > highestScore) {
      highestScore = score;
      bestPolicy = p;
    }
  }

  if (bestPolicy && highestScore > 0.25) {
    return {
      agent_used: 'navigation_agent',
      reply: `Regarding stadium policy for "${bestPolicy.category}": ${bestPolicy.rule} Please follow staff instructions on-site.`,
      data: { policies }
    };
  }

  // General default fallback
  return {
    agent_used: 'navigation_agent',
    reply: "Welcome to StadeX. I can guide you through the stadium, check wait times for gates, provide directions, explain transit options, or translate. How can I assist you today?",
    data: { gates }
  };
};

// ----------------------------------------------------
// Real Claude Agent Runner
// ----------------------------------------------------
const callAgent = async (systemPrompt, userMessage, contextData) => {
  if (!anthropic) {
    throw new Error('Claude SDK not initialized');
  }

  const promptContent = `
Context Data:
${JSON.stringify(contextData, null, 2)}

User Message:
"${userMessage}"
`;

  const response = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 300,
    system: systemPrompt,
    messages: [{ role: 'user', content: promptContent }]
  });

  return response.content[0].text;
};

// Main routing function
export const processMessage = async ({ message, role = 'fan', language }) => {
  // If no Claude API key, use mock responder
  if (!anthropic) {
    return handleMockRouting(message, role, language);
  }

  try {
    const gates = readJsonFile('gates.json') || [];
    const gateStatus = readJsonFile('gateStatus.json') || {};
    const transit = readJsonFile('transit.json') || [];
    const policies = readJsonFile('policies.json') || [];

    const fullContext = { gates, gateStatus, transit, policies };

    // Orchestrator Tool Definitions
    const tools = [
      {
        name: 'navigation_agent',
        description: 'Handles navigation, seat finding, directions, restrooms, food/merch locations, policies, and route recommendations.',
        input_schema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'The exact navigation or directions question' }
          },
          required: ['query']
        }
      },
      {
        name: 'crowd_agent',
        description: 'Handles wait times, gate queue lengths, stadium congestion, occupancy percentages, and crowd-related queries.',
        input_schema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'The wait times or queue occupancy question' }
          },
          required: ['query']
        }
      },
      {
        name: 'language_agent',
        description: 'Translates and answers queries that are in non-English languages, or when translation is requested.',
        input_schema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'The user query in its original language' },
            target_language: { type: 'string', description: 'The language to translate and respond in' }
          },
          required: ['query']
        }
      }
    ];

    // First call to the Orchestrator
    const orchestratorResponse = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 150,
      system: ORCHESTRATOR_SYSTEM,
      messages: [{ role: 'user', content: message }],
      tools: tools,
      tool_choice: { type: 'any' } // Force calling at least one routing tool
    });

    const toolCall = orchestratorResponse.content.find(c => c.type === 'tool_use');

    if (!toolCall) {
      console.warn('Orchestrator did not return a tool call, falling back to mock router');
      return handleMockRouting(message, role, language);
    }

    const { name: toolName, input: toolInput } = toolCall;
    console.log(`[Orchestrator] Routed request to: ${toolName}`);

    let agentResponseText = '';

    if (toolName === 'navigation_agent') {
      agentResponseText = await callAgent(
        NAVIGATION_SYSTEM,
        toolInput.query || message,
        { gates, gateStatus, policies }
      );

      // Attempt to extract recommended gate for mapping
      let recommendedGate = null;
      const cleanReply = agentResponseText.toUpperCase();
      for (const g of gates) {
        if (cleanReply.includes(`GATE ${g.id}`) || cleanReply.includes(` ${g.id} `) || cleanReply.includes(`GATE ${g.name.toUpperCase()}`)) {
          recommendedGate = g.id;
          break;
        }
      }
      if (!recommendedGate) {
        // Fallback check
        const match = agentResponseText.match(/Gate ([A-F])/i);
        if (match) recommendedGate = match[1].toUpperCase();
      }

      return {
        agent_used: 'navigation_agent',
        reply: agentResponseText,
        data: {
          recommended_gate: recommendedGate,
          gates,
          gateStatus
        }
      };
    } else if (toolName === 'crowd_agent') {
      agentResponseText = await callAgent(
        CROWD_SYSTEM + `\nCurrently acting in: ${role.toUpperCase()} MODE.`,
        toolInput.query || message,
        { gateStatus, gates }
      );

      let recommendedGate = null;
      const match = agentResponseText.match(/Gate ([A-F])/i);
      if (match) recommendedGate = match[1].toUpperCase();

      return {
        agent_used: 'crowd_agent',
        reply: agentResponseText,
        data: {
          recommended_gate: recommendedGate,
          gateStatus
        }
      };
    } else if (toolName === 'language_agent') {
      // Ground the language agent with all stadium data so it can answer correctly
      agentResponseText = await callAgent(
        LANGUAGE_SYSTEM + `\nTarget Language: ${toolInput.target_language || language || 'auto-detect'}`,
        toolInput.query || message,
        fullContext
      );

      let recommendedGate = null;
      const match = agentResponseText.match(/Gate ([A-F])/i);
      if (match) recommendedGate = match[1].toUpperCase();

      return {
        agent_used: 'language_agent',
        reply: agentResponseText,
        data: {
          recommended_gate: recommendedGate,
          detected_language: toolInput.target_language || 'auto-detect'
        }
      };
    }

    return handleMockRouting(message, role, language);
  } catch (error) {
    console.error('Error in orchestrator processing, falling back to Mock Mode:', error);
    return handleMockRouting(message, role, language);
  }
};

// Crowd Agent alert generation (standalone function used by simulator)
export const generateStaffAlert = async (gateId, occupancy, queueLen) => {
  const gates = readJsonFile('gates.json') || [];
  const gateInfo = gates.find(g => g.id === gateId);
  const context = {
    gateId,
    name: gateInfo ? gateInfo.name : `Gate ${gateId}`,
    location: gateInfo ? gateInfo.location : '',
    occupancy_pct: occupancy,
    queue_len_min: queueLen
  };

  if (!anthropic) {
    // High-quality mock alert
    const action = occupancy > 92 
      ? `Redirect fans to adjacent Gate C immediately and open backup turnstiles.` 
      : `Deploy overflow traffic team to Gate ${gateId} lanes 3 and 4 now.`;
    return `Gate ${gateId} occupancy critical at ${occupancy}% with a ${queueLen}-minute wait. Recommend: ${action}`;
  }

  try {
    const prompt = `Write an operational alert for Gate ${gateId} which is currently at ${occupancy}% occupancy and has a ${queueLen} minute wait queue.`;
    const response = await callAgent(
      CROWD_SYSTEM + "\nCurrently acting in: STAFF MODE.",
      prompt,
      context
    );
    return response.trim();
  } catch (error) {
    console.error('Error generating AI staff alert, falling back to mock:', error);
    return `Gate ${gateId} at ${occupancy}% occupancy and ${queueLen} min queue. Recommend opening backup lanes immediately.`;
  }
};
