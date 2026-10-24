import React, { useState, useEffect, useRef } from 'react';
import {
  FiCpu,
  FiSend,
  FiTrendingUp,
  FiAlertTriangle,
  FiCheckCircle,
  FiDollarSign,
  FiLayers,
  FiShoppingBag,
  FiBox,
  FiCopy,
  FiCheck,
  FiRefreshCw,
  FiZap,
} from 'react-icons/fi';
import { Product, Ingredient, ProductionRun, StockMovement, Recipe } from '../types';

interface AIAdminAssistantProps {
  products: Product[];
  ingredients: Ingredient[];
  productionRuns: ProductionRun[];
  stockMovements: StockMovement[];
  recipes?: Recipe[];
  onRefresh: () => void;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: string;
  category?: 'report' | 'advice' | 'alert' | 'calc';
}

export const AIAdminAssistant: React.FC<AIAdminAssistantProps> = ({
  products,
  ingredients,
  productionRuns,
  stockMovements,
  recipes = [],
  onRefresh,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: 'welcome',
      sender: 'ai',
      text: `നമസ്കാരം! ഞാൻ EPSO ഫാക്ടറി AI അസിസ്റ്റന്റ് ആണ്. 🧑‍🍳

നിങ്ങളുടെ ഫാക്ടറിയുടെ ഇന്നത്തെ ഉൽപ്പാദനം, ചേരുവകളുടെ സ്റ്റോക്ക്, ഓയിൽ ഉപഭോഗം, ബാച്ച് ആവശ്യകതകൾ, കോസ്റ്റിംഗ് എന്നിവ ഞാൻ വിശകലനം ചെയ്തു നൽകാം.

താഴെ നൽകിയിരിക്കുന്ന പ്രോംപ്റ്റുകളിൽ ക്ലിക്ക് ചെയ്യുകയോ സംശയങ്ങൾ നേരിട്ട് ചോദിക്കുകയോ ചെയ്യാം.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [inputText, setInputText] = useState<string>('');
  const [isThinking, setIsThinking] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Batch Calculator Widget State
  const [calcProductId, setCalcProductId] = useState<string>(products.length > 0 ? products[0].id : '');
  const [calcQuantityKg, setCalcQuantityKg] = useState<number>(50);
  const [calcResult, setCalcResult] = useState<any | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isThinking]);

  // Sync default calc product
  useEffect(() => {
    if (!calcProductId && products.length > 0) {
      setCalcProductId(products[0].id);
    }
  }, [products]);

  // Copy message text
  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Compute live metrics for AI context
  const todayStr = new Date().toISOString().split('T')[0];
  const todayRuns = productionRuns.filter((r) => r.productionDate === todayStr && r.status === 'completed');
  const todayOutputKg = todayRuns.reduce((sum, r) => sum + (Number(r.actualQuantity) || 0), 0);
  const lowStockIngredients = ingredients.filter(
    (i) => i.isActive && i.minStock > 0 && i.currentStock <= i.minStock
  );
  const totalStockValuation = Math.round(
    ingredients.reduce((sum, i) => sum + (Number(i.currentStock) || 0) * (Number(i.avgCostPerUnit) || 0), 0)
  );

  // Calculate Batch Calculator Requirements
  const handleCalculateBatch = () => {
    const selectedProd = products.find((p) => p.id === calcProductId) || products[0];
    if (!selectedProd) return;

    const qty = Number(calcQuantityKg) || 10;
    // Check if recipe exists
    const prodRecipe = recipes.find((r) => r.productId === selectedProd.id);

    let rawCost = 0;
    let itemsBreakdown: Array<{ name: string; qty: number; unit: string; cost: number }> = [];

    if (prodRecipe && prodRecipe.items && prodRecipe.items.length > 0) {
      const baseOutput = prodRecipe.baseOutputQuantity || 1;
      const ratio = qty / baseOutput;
      for (const item of prodRecipe.items) {
        const ing = ingredients.find((i) => i.id === item.ingredientId);
        const itemQty = Math.round(item.quantity * ratio * 100) / 100;
        const rate = ing ? ing.avgCostPerUnit : 0;
        const cost = Math.round(itemQty * rate);
        rawCost += cost;
        itemsBreakdown.push({
          name: ing?.name || item.ingredientName || 'ചേരുവ',
          qty: itemQty,
          unit: item.unit || 'kg',
          cost,
        });
      }
    } else {
      // Heuristic model: Flour ~ 75%, Oil ~ 25%, Spices ~ 5%
      const flourQty = Math.round(qty * 0.72 * 10) / 10;
      const oilQty = Math.round(qty * 0.22 * 10) / 10;
      const spiceQty = Math.round(qty * 0.06 * 10) / 10;

      const flourCost = Math.round(flourQty * 65);
      const oilCost = Math.round(oilQty * 140);
      const spiceCost = Math.round(spiceQty * 250);
      rawCost = flourCost + oilCost + spiceCost;

      itemsBreakdown = [
        { name: 'കടലമാവ് / പൊടികൾ', qty: flourQty, unit: 'kg', cost: flourCost },
        { name: 'ഓയിൽ (Oil Consumption)', qty: oilQty, unit: 'kg', cost: oilCost },
        { name: 'മസാല, ഉപ്പ്, കറിവേപ്പില', qty: spiceQty, unit: 'kg', cost: spiceCost },
      ];
    }

    const estimatedPackets100g = Math.round((qty * 1000) / 100);
    const estimatedPackingLabour = Math.round(estimatedPackets100g * 1.0);
    const estimatedCoverCost = Math.round(estimatedPackets100g * 1.5);
    const wholesaleRate = selectedProd.wholesalePrice || 160;
    const estimatedWholesaleRevenue = Math.round(qty * wholesaleRate);
    const totalCost = rawCost + estimatedPackingLabour + estimatedCoverCost;
    const estimatedNetMargin = estimatedWholesaleRevenue - totalCost;

    setCalcResult({
      productName: selectedProd.name,
      quantityKg: qty,
      rawCost,
      itemsBreakdown,
      estimatedPackets100g,
      estimatedPackingLabour,
      estimatedCoverCost,
      totalCost,
      estimatedWholesaleRevenue,
      estimatedNetMargin,
      costPerKg: Math.round(totalCost / qty),
    });
  };

  // Built-in EPSO Smart Factory Intelligence Engine
  const generateLocalResponse = (prompt: string): string => {
    const q = prompt.toLowerCase();

    // 1. Today's production report
    if (q.includes('ഇന്നത്തെ ഉൽപ്പാദന') || q.includes('production report') || q.includes('റിപ്പോർട്ട്') || q.includes('ഇന്ന്')) {
      return `📊 **ഇന്നത്തെ ഉൽപ്പാദന വിശകലന റിപ്പോർട്ട് (${todayStr})**
----------------------------------------
• **പൂർത്തിയായ ബാച്ചുകൾ:** ${todayRuns.length} എണ്ണം
• **ആകെ ഉൽപ്പാദനം:** **${todayOutputKg} kg**
• **പ്രവർത്തിക്കുന്ന ഉൽപ്പന്നങ്ങൾ:** ${products.length} ഇനങ്ങൾ
• **സ്റ്റോക്കിലുള്ള അസംസ്കൃത വസ്തുക്കളുടെ മൂല്യം:** **₹${totalStockValuation.toLocaleString('en-IN')}**

💡 **നിരീക്ഷണങ്ങൾ:**
${
  todayOutputKg > 0
    ? `ഇന്ന് ഫാക്ടറിയിൽ ഉൽപ്പാദനം സജീവമാണ്. ശരാശരി ബാച്ച് ഔട്ട്പുട്ട് ${(todayOutputKg / (todayRuns.length || 1)).toFixed(1)} kg ആണ്.`
    : `ഇന്ന് ഇതുവരെ പൂർത്തിയായ ബാച്ചുകൾ രേഖപ്പെടുത്തിയിട്ടില്ല. അടുക്കളയിൽ പ്രൊഡക്ഷൻ റൺ ആരംഭിക്കുക.`
}

⚠️ **കുറഞ്ഞ സ്റ്റോക്ക് മുന്നറിയിപ്പ്:** ${lowStockIngredients.length} ചേരുവകൾ കുറഞ്ഞ പരിധിയിലാണ്.`;
    }

    // 2. Oil optimization
    if (q.includes('ഓയിൽ') || q.includes('oil') || q.includes('എണ്ണ') || q.includes('വെളിച്ചെണ്ണ')) {
      return `💡 **ഓയിൽ ഉപഭോഗം കുറയ്ക്കാനും ലാഭിക്കാനുമുള്ള നിർദ്ദേശങ്ങൾ:**
----------------------------------------
1. **താപനില ക്രമീകരണം (Temperature Control):** എണ്ണ 175°C - 180°C താപനിലയിൽ നിലനിർത്തുക. താപനില കുറഞ്ഞാൽ പലഹാരങ്ങൾ കൂടുതൽ എണ്ണ വലിച്ചെടുക്കും.
2. **ഫ്രൈയിംഗ് സമയം (Optimum Frying Time):** ഓരോ ബാച്ചും അമിതമായി എണ്ണയിൽ കിടക്കാതെ ഗോൾഡൻ നിറമാകുമ്പോൾ തന്നെ മാറ്റുക.
3. **ഡ്രെയിനിംഗ് ട്രേ ഉപയോഗം (Vibratory Draining):** വറുത്തു കോരിയ പലഹാരങ്ങൾ 2-3 മിനിറ്റ് ഡ്രെയിനിംഗ് വയർ മെഷിൽ വെച്ച് അധിക എണ്ണ വറ്റിക്കുക. (ഇത് വഴി 4-6% എണ്ണ ലാഭിക്കാം).
4. **ഫിൽട്ടറിംഗ് (Daily Micro-Filtering):** ദിവസേനയുള്ള പ്രൊഡക്ഷൻ കഴിഞ്ഞയുടൻ എണ്ണ ഫിൽട്ടർ ചെയ്തു കരിഞ്ഞ തരികൾ നീക്കം ചെയ്താൽ എണ്ണയുടെ ആയുസ്സ് 25% വർദ്ധിക്കും.`;
    }

    // 3. Low stock and purchase list
    if (q.includes('സ്റ്റോക്ക്') || q.includes('പർച്ചേസ്') || q.includes('stock') || q.includes('purchase')) {
      if (lowStockIngredients.length === 0) {
        return `✅ **സ്റ്റോക്ക് നില തൃപ്തികരമാണ്!**
നിലവിൽ എല്ലാ ചേരുവകളും സുരക്ഷിത പരിധിക്ക് മുകളിലാണ്.
• ആകെ ചേരുവകൾ: ${ingredients.length}
• സ്റ്റോക്ക് മൂല്യം: ₹${totalStockValuation.toLocaleString('en-IN')}`;
      }

      const list = lowStockIngredients
        .map((i) => `• **${i.name}:** ബാക്കി ${i.currentStock} ${i.unit} (കുറഞ്ഞ പരിധി: ${i.minStock} ${i.unit})`)
        .join('\n');

      return `⚠️ **അടിയന്തരമായി വാങ്ങേണ്ട ചേരുവകൾ (Purchase Alert):**
----------------------------------------
താഴെ പറയുന്ന ${lowStockIngredients.length} ചേരുവകൾ ഉടൻ റീ-ഓർഡർ ചെയ്യേണ്ടതാണ്:

${list}

👉 _നിർദ്ദേശം: Ingredients ടാബിലെ "പർച്ചേസ് ലിസ്റ്റ്" തുറന്ന് പ്രിന്റ് എടുക്കുകയോ ഓർഡർ നൽകുകയോ ചെയ്യാം._`;
    }

    // 4. Profit & Costing
    if (q.includes('ലാഭം') || q.includes('കോസ്റ്റിംഗ്') || q.includes('profit') || q.includes('costing') || q.includes('വില')) {
      return `💰 **കോസ്റ്റിംഗും ലാഭവിഹിത വിശകലനവും:**
----------------------------------------
• **ശരാശരി റോ മെറ്റീരിയൽ അനുപാതം:** ഉൽപ്പന്ന വിലയുടെ 55% - 60%
• **പാക്കിംഗ് & കവർ ചിലവ്:** പാക്കറ്റ് ഒന്നിന് ₹1.50 കവർ + ₹1.00 കൂലി
• **മാർക്കറ്റ് ഹോൾസെയിൽ മാർജിൻ:** 18% - 24% നെറ്റ് പ്രോഫിറ്റ്

📈 **മാർജിൻ വർദ്ധിപ്പിക്കാനുള്ള വഴികൾ:**
1. വലിയ അളവിൽ ബൾക്ക് പർച്ചേസ് വഴി കടലമാവ് കിലോയ്ക്ക് ₹2-₹3 വരെ കുറയ്ക്കുക.
2. വേസ്റ്റേജ് 1% താഴെ നിലനിർത്തുക.
3. ഫാക്ടറി ഔട്ട്പുട്ട് ഉയർത്തുന്നതിലൂടെ യൂണിറ്റ് അടിസ്ഥാനത്തിലുള്ള ലേബർ ചെലവ് കുറയ്ക്കാം.`;
    }

    // 5. Tomorrow's Production Plan
    if (q.includes('നാളെ') || q.includes('tomorrow') || q.includes('പ്ലാൻ') || q.includes('forecast')) {
      const topProducts = products.slice(0, 3).map((p) => `• ${p.name}: 30 kg - 50 kg ബാച്ച്`).join('\n');
      return `🔮 **നാളത്തേക്കുള്ള ശുപാർശിത പ്രൊഡക്ഷൻ പ്ലാൻ:**
----------------------------------------
മാർക്കറ്റ് ഡിമാൻഡും സ്റ്റോക്കും അടിസ്ഥാനമാക്കി നാളത്തേക്ക് നിർദ്ദേശിക്കുന്ന ബാച്ചുകൾ:

${topProducts}

📝 **തയ്യാറെടുപ്പുകൾ:**
1. ആവശ്യമായ എണ്ണ ലെവൽ പരിശോധിക്കുക.
2. പാക്കറ്റ് കവറുകൾ മുൻകൂട്ടി എടുത്തു വെക്കുക.
3. പാക്കിംഗ് ജീവനക്കാരുടെ എണ്ണം ഷെഡ്യൂൾ ചെയ്യുക.`;
    }

    // Default friendly response
    return `ഞാൻ വിശകലനം ചെയ്ത വിവരങ്ങൾ പ്രകാരം:
• നിലവിൽ **${products.length}** ഉൽപ്പന്നങ്ങളും **${ingredients.length}** ചേരുവകളും സിസ്റ്റത്തിൽ സജീവമാണ്.
• ഇന്നത്തെ പൂർത്തിയായ ഉൽപ്പാദനം **${todayOutputKg} kg** ആണ്.
• അടിയന്തരമായി ശ്രദ്ധിക്കേണ്ട കുറഞ്ഞ സ്റ്റോക്കുകൾ: **${lowStockIngredients.length}** എണ്ണം.

കൂടുതൽ കൃത്യമായ വിവരങ്ങൾക്ക് മുകളിലെ ഓപ്ഷനുകളിൽ ഒന്ന് തിരഞ്ഞെടുക്കുക.`;
  };

  // Submit Prompt to AI
  const handleSendMessage = async (customPrompt?: string) => {
    const textToSend = customPrompt || inputText;
    if (!textToSend.trim() || isThinking) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: textToSend.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!customPrompt) setInputText('');
    setIsThinking(true);

    const apiKey = localStorage.getItem('epso_gemini_api_key');

    if (apiKey) {
      try {
        const systemPrompt = `You are the EPSO Factory AI Assistant for EPSO Food Products in Kerala, India.
Factory context:
- Today's date: ${todayStr}
- Today's completed output: ${todayOutputKg} kg
- Active products (${products.length}): ${products.map((p) => `${p.name} (Wholesale: ₹${p.wholesalePrice})`).join(', ')}
- Low stock ingredients (${lowStockIngredients.length}): ${lowStockIngredients.map((i) => `${i.name} (Balance: ${i.currentStock} ${i.unit})`).join(', ')}
- Total raw inventory value: ₹${totalStockValuation}
Respond in natural, fluent Malayalam (with English terms in parentheses where helpful). Keep formatting clean with bullet points and bold highlights. Keep responses concise, practical, and highly relevant to snack production and bakery factory management.`;

        const resp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey.trim()}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    {
                      text: `${systemPrompt}\n\nUser Question: ${userMsg.text}`,
                    },
                  ],
                },
              ],
            }),
          }
        );

        if (resp.ok) {
          const data = await resp.json();
          const replyText =
            data?.candidates?.[0]?.content?.parts?.[0]?.text ||
            generateLocalResponse(userMsg.text);

          const aiMsg: ChatMessage = {
            id: `ai-${Date.now()}`,
            sender: 'ai',
            text: replyText,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          };
          setMessages((prev) => [...prev, aiMsg]);
          setIsThinking(false);
          return;
        }
      } catch (err) {
        console.warn('Gemini API call failed, falling back to local intelligence:', err);
      }
    }

    // Local heuristic engine with slight realistic delay
    setTimeout(() => {
      const reply = generateLocalResponse(userMsg.text);
      const aiMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        sender: 'ai',
        text: reply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, aiMsg]);
      setIsThinking(false);
    }, 600);
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-16 font-sans">
      {/* Header & Live KPI Strip */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-stone-200 dark:border-[#2E2828]">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-white flex items-center justify-center font-black shadow-md shadow-purple-500/20">
            <FiCpu className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-stone-900 dark:text-white font-malayalam">
                EPSO AI Copilot
              </h1>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                Live Analysis
              </span>
            </div>
            <p className="text-xs text-stone-500 dark:text-stone-400 font-malayalam mt-0.5">
              ഫാക്ടറി ഉൽപ്പാദനം, ഓയിൽ ഉപഭോഗം, സ്റ്റോക്ക് അനലിറ്റിക്സ് എന്നിവയുടെ തത്സമയ ഉപദേശകൻ
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onRefresh}
          className="self-start sm:self-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-white dark:bg-[#1E1B1B] text-xs font-bold text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-[#282323] transition-colors press-apple cursor-pointer"
        >
          <FiRefreshCw className="w-3.5 h-3.5" />
          <span>ഡാറ്റ റിഫ്രഷ്</span>
        </button>
      </div>

      {/* KPI Cards Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-2xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card">
          <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block font-malayalam">ഇന്നത്തെ ഉൽപ്പാദനം</span>
          <span className="text-xl font-black text-stone-900 dark:text-white font-mono mt-0.5 block">
            {todayOutputKg} kg
          </span>
          <span className="text-[10px] text-stone-400 block mt-0.5 font-malayalam">
            {todayRuns.length} ബാച്ചുകൾ പൂർത്തിയായി
          </span>
        </div>

        <div className="p-3.5 rounded-2xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card">
          <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block font-malayalam">സ്റ്റോക്ക് മൂല്യം</span>
          <span className="text-xl font-black text-emerald-600 dark:text-emerald-400 font-mono mt-0.5 block">
            ₹{totalStockValuation.toLocaleString('en-IN')}
          </span>
          <span className="text-[10px] text-stone-400 block mt-0.5 font-malayalam">
            {ingredients.length} ചേരുവകൾ
          </span>
        </div>

        <div className="p-3.5 rounded-2xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card">
          <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block font-malayalam">കുറഞ്ഞ സ്റ്റോക്ക്</span>
          <span className="text-xl font-black text-amber-500 font-mono mt-0.5 block">
            {lowStockIngredients.length}
          </span>
          <span className="text-[10px] text-amber-600 dark:text-amber-400 block mt-0.5 font-malayalam">
            ഉടൻ റീ-ഓർഡർ ചെയ്യണം
          </span>
        </div>

        <div className="p-3.5 rounded-2xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card">
          <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block font-malayalam">ഉൽപ്പന്നങ്ങൾ</span>
          <span className="text-xl font-black text-epso-orange font-mono mt-0.5 block">
            {products.length}
          </span>
          <span className="text-[10px] text-stone-400 block mt-0.5 font-malayalam">
            സജീവ കാറ്റലോഗ്
          </span>
        </div>
      </div>

      {/* Main Grid: Chat Assistant & Quick Calculator */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 Cols): Chat Interface */}
        <div className="lg:col-span-2 flex flex-col h-[600px] rounded-3xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card overflow-hidden">
          {/* Top Quick Action Chips */}
          <div className="p-3 border-b border-stone-100 dark:border-[#282323] bg-stone-50/50 dark:bg-[#161313]/50 overflow-x-auto no-scrollbar flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleSendMessage('ഇന്നത്തെ ഉൽപ്പാദന റിപ്പോർട്ട് നൽകുക')}
              className="px-3 py-1.5 rounded-xl bg-white dark:bg-[#221E1E] border border-stone-200 dark:border-[#332A2A] text-xs font-bold text-stone-800 dark:text-stone-200 hover:border-purple-400 hover:text-purple-600 dark:hover:text-purple-400 shrink-0 press-apple cursor-pointer font-malayalam flex items-center gap-1.5"
            >
              <span>📊</span>
              <span>ഉൽപ്പാദന റിപ്പോർട്ട്</span>
            </button>

            <button
              type="button"
              onClick={() => handleSendMessage('ഓയിൽ ഉപഭോഗം കുറയ്ക്കാനുള്ള നിർദ്ദേശങ്ങൾ')}
              className="px-3 py-1.5 rounded-xl bg-white dark:bg-[#221E1E] border border-stone-200 dark:border-[#332A2A] text-xs font-bold text-stone-800 dark:text-stone-200 hover:border-purple-400 hover:text-purple-600 dark:hover:text-purple-400 shrink-0 press-apple cursor-pointer font-malayalam flex items-center gap-1.5"
            >
              <span>💡</span>
              <span>ഓയിൽ ഒപ്റ്റിമൈസേഷൻ</span>
            </button>

            <button
              type="button"
              onClick={() => handleSendMessage('സ്റ്റോക്ക് കുറവുള്ള ചേരുവകൾ ഏതെല്ലാം?')}
              className="px-3 py-1.5 rounded-xl bg-white dark:bg-[#221E1E] border border-stone-200 dark:border-[#332A2A] text-xs font-bold text-stone-800 dark:text-stone-200 hover:border-purple-400 hover:text-purple-600 dark:hover:text-purple-400 shrink-0 press-apple cursor-pointer font-malayalam flex items-center gap-1.5"
            >
              <span>⚠️</span>
              <span>കുറഞ്ഞ സ്റ്റോക്ക്</span>
            </button>

            <button
              type="button"
              onClick={() => handleSendMessage('ലാഭവിഹിതവും കോസ്റ്റിംഗ് നിർദ്ദേശങ്ങളും')}
              className="px-3 py-1.5 rounded-xl bg-white dark:bg-[#221E1E] border border-stone-200 dark:border-[#332A2A] text-xs font-bold text-stone-800 dark:text-stone-200 hover:border-purple-400 hover:text-purple-600 dark:hover:text-purple-400 shrink-0 press-apple cursor-pointer font-malayalam flex items-center gap-1.5"
            >
              <span>💰</span>
              <span>കോസ്റ്റിംഗ് & ലാഭം</span>
            </button>
          </div>

          {/* Messages Scroll Area */}
          <div className="flex-1 p-4 overflow-y-auto space-y-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.sender === 'ai' && (
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-white flex items-center justify-center font-black text-xs shrink-0 shadow-sm">
                    <FiZap className="w-4 h-4" />
                  </div>
                )}

                <div
                  className={`max-w-[85%] rounded-2xl p-3.5 text-xs font-malayalam leading-relaxed ${
                    msg.sender === 'user'
                      ? 'bg-stone-900 text-white dark:bg-amber-500 dark:text-stone-950 font-bold rounded-tr-none shadow-sm'
                      : 'bg-stone-100 dark:bg-[#282323] text-stone-900 dark:text-stone-100 rounded-tl-none border border-stone-200/80 dark:border-[#332A2A] shadow-xs'
                  }`}
                >
                  <div className="whitespace-pre-wrap">{msg.text}</div>

                  <div className="flex items-center justify-between gap-4 mt-2 pt-1 border-t border-black/5 dark:border-white/10 text-[10px] text-stone-400 dark:text-stone-400">
                    <span>{msg.timestamp}</span>
                    {msg.sender === 'ai' && (
                      <button
                        type="button"
                        onClick={() => handleCopy(msg.id, msg.text)}
                        className="hover:text-stone-700 dark:hover:text-white flex items-center gap-1 cursor-pointer"
                        title="Copy message"
                      >
                        {copiedId === msg.id ? (
                          <>
                            <FiCheck className="w-3 h-3 text-emerald-500" />
                            <span className="text-emerald-500">Copied</span>
                          </>
                        ) : (
                          <>
                            <FiCopy className="w-3 h-3" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {isThinking && (
              <div className="flex gap-3 justify-start">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-white flex items-center justify-center font-black text-xs shrink-0 shadow-sm animate-pulse">
                  <FiZap className="w-4 h-4" />
                </div>
                <div className="rounded-2xl rounded-tl-none p-3.5 bg-stone-100 dark:bg-[#282323] border border-stone-200/80 dark:border-[#332A2A] text-xs font-malayalam flex items-center gap-2 text-stone-500">
                  <div className="w-3.5 h-3.5 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
                  <span>EPSO AI വിശകലനം ചെയ്യുന്നു...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Bottom Chat Input Bar */}
          <div className="p-3 border-t border-stone-100 dark:border-[#282323] bg-white dark:bg-[#1E1B1B]">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="ചോദ്യങ്ങൾ ചോദിക്കുക (ഉദാ: ഓയിൽ സ്റ്റോക്ക് എത്രയുണ്ട്?)"
                className="flex-1 py-2.5 px-4 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-stone-50 dark:bg-[#141212] text-xs text-stone-900 dark:text-white placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-purple-500/30 font-malayalam"
              />
              <button
                type="submit"
                disabled={!inputText.trim() || isThinking}
                className="p-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white shadow-sm press-apple disabled:opacity-50 transition-colors cursor-pointer"
              >
                <FiSend className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>

        {/* Right Column (1 Col): Interactive Batch Requirement Calculator */}
        <div className="p-5 rounded-3xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card space-y-4 font-malayalam">
          <div className="flex items-center gap-2.5 pb-2 border-b border-stone-100 dark:border-[#282323]">
            <div className="w-8 h-8 rounded-xl bg-orange-100 dark:bg-orange-950/60 text-epso-orange flex items-center justify-center font-black">
              <FiZap className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-stone-900 dark:text-white">
                ബാച്ച് കാൽക്കുലേറ്റർ (Quick Estimator)
              </h3>
              <p className="text-[11px] text-stone-400">
                ബാച്ചിന് ആവശ്യമായ ചേരുവകളും ചിലവും
              </p>
            </div>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <label className="block font-bold text-stone-700 dark:text-stone-300 mb-1">
                ഉൽപ്പന്നം (Product)
              </label>
              <select
                value={calcProductId}
                onChange={(e) => setCalcProductId(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-stone-50 dark:bg-[#141212] text-stone-900 dark:text-white font-bold focus:outline-none"
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-bold text-stone-700 dark:text-stone-300 mb-1">
                ടാർഗറ്റ് ഉൽപ്പാദനം (Target Weight in kg)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="5"
                  step="5"
                  value={calcQuantityKg}
                  onChange={(e) => setCalcQuantityKg(parseFloat(e.target.value) || 10)}
                  className="flex-1 p-2.5 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-stone-50 dark:bg-[#141212] text-stone-900 dark:text-white font-mono font-bold focus:outline-none"
                />
                <span className="font-mono font-bold text-stone-500">kg</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleCalculateBatch}
              className="w-full py-2.5 rounded-xl bg-epso-orange hover:bg-orange-600 text-white font-bold shadow-sm press-apple transition-colors cursor-pointer flex items-center justify-center gap-2"
            >
              <FiCpu className="w-3.5 h-3.5" />
              <span>ആവശ്യകത കണക്കാക്കുക</span>
            </button>
          </div>

          {/* Calculator Output Card */}
          {calcResult && (
            <div className="p-3.5 rounded-2xl bg-stone-50 dark:bg-[#161313] border border-stone-200/80 dark:border-[#282323] space-y-2.5 text-xs animate-fade-in">
              <div className="flex items-center justify-between pb-1.5 border-b border-stone-200 dark:border-[#282323]">
                <span className="font-black text-stone-900 dark:text-white">{calcResult.productName} ({calcResult.quantityKg} kg)</span>
                <span className="text-[10px] px-2 py-0.5 rounded-md bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 font-bold font-mono">
                  ₹{calcResult.costPerKg}/kg
                </span>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] font-bold text-stone-400 uppercase">ആവശ്യമായ ചേരുവകൾ:</span>
                {calcResult.itemsBreakdown.map((item: any, idx: number) => (
                  <div key={idx} className="flex items-center justify-between text-[11px]">
                    <span className="text-stone-600 dark:text-stone-300">• {item.name}:</span>
                    <span className="font-mono font-bold text-stone-800 dark:text-stone-200">
                      {item.qty} {item.unit} (₹{item.cost})
                    </span>
                  </div>
                ))}
              </div>

              <div className="pt-2 border-t border-stone-200 dark:border-[#282323] space-y-1 text-[11px]">
                <div className="flex items-center justify-between">
                  <span className="text-stone-500">റോ മെറ്റീരിയൽ ചിലവ്:</span>
                  <span className="font-mono font-bold">₹{calcResult.rawCost}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-stone-500">കവർ & പാക്കിംഗ് കൂലി:</span>
                  <span className="font-mono font-bold">₹{calcResult.estimatedCoverCost + calcResult.estimatedPackingLabour}</span>
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-stone-200 dark:border-[#282323] font-bold">
                  <span className="text-stone-800 dark:text-stone-200">ആകെ പ്രൊഡക്ഷൻ ചിലവ്:</span>
                  <span className="font-mono text-stone-900 dark:text-white">₹{calcResult.totalCost}</span>
                </div>
                <div className="flex items-center justify-between pt-1 text-emerald-600 dark:text-emerald-400 font-bold">
                  <span>പ്രതീക്ഷിക്കുന്ന ലാഭം:</span>
                  <span className="font-mono font-black">₹{calcResult.estimatedNetMargin}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
