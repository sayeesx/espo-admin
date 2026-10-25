import React, { useState, useEffect, useRef } from 'react';
import {
  FiSend,
  FiX,
  FiZap,
  FiMinus,
  FiMessageSquare,
  FiTrendingUp,
  FiAlertTriangle,
  FiCheckCircle,
  FiDollarSign,
  FiDroplet,
  FiCopy,
  FiCheck,
} from 'react-icons/fi';
import { Product, Ingredient, ProductionRun, StockMovement, Recipe } from '../types';

interface AIAdminAssistantProps {
  products: Product[];
  ingredients: Ingredient[];
  productionRuns: ProductionRun[];
  stockMovements?: StockMovement[];
  recipes?: Recipe[];
  onRefresh: () => void;
  isOpen?: boolean;
  onToggle?: () => void;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: string;
}

export const AIAdminAssistant: React.FC<AIAdminAssistantProps> = ({
  products,
  ingredients,
  productionRuns,
  stockMovements = [],
  recipes = [],
  onRefresh,
  isOpen: controlledIsOpen,
  onToggle,
}) => {
  const [internalIsOpen, setInternalIsOpen] = useState<boolean>(false);
  const isOpen = controlledIsOpen !== undefined ? controlledIsOpen : internalIsOpen;

  const toggleOpen = () => {
    if (onToggle) {
      onToggle();
    } else {
      setInternalIsOpen((prev) => !prev);
    }
  };

  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: 'welcome',
      sender: 'ai',
      text: `നമസ്കാരം! ഞാൻ നിങ്ങളുടെ EPSO ഫാക്ടറി AI അസിസ്റ്റന്റ് ആണ്. 🧑‍🍳\n\nഇന്നത്തെ ഉൽപ്പാദനം, ഓയിൽ ഉപഭോഗം, കുറഞ്ഞ സ്റ്റോക്ക്, കോസ്റ്റിംഗ് എന്നിവ അറിയാൻ താഴെ നൽകിയിരിക്കുന്ന ബട്ടണുകൾ ഉപയോഗിക്കുക:`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [isThinking, setIsThinking] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isThinking, isOpen]);

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

  // Generate localized response based on prompt
  const generateResponse = (prompt: string): string => {
    const q = prompt.toLowerCase();

    // 1. Production report
    if (q.includes('ഉൽപ്പാദന റിപ്പോർട്ട്') || q.includes('production')) {
      return `📊 **ഇന്നത്തെ ഉൽപ്പാദന റിപ്പോർട്ട് (${todayStr})**
----------------------------------------
• **പൂർത്തിയായ ബാച്ചുകൾ:** ${todayRuns.length} എണ്ണം
• **ആകെ ഉൽപ്പാദനം:** **${todayOutputKg} kg**
• **സജീവ ഉൽപ്പന്നങ്ങൾ:** ${products.length} ഇനങ്ങൾ
• **സ്റ്റോക്ക് മൂല്യം:** **₹${totalStockValuation.toLocaleString('en-IN')}**

💡 **നിരീക്ഷണം:**
${
  todayOutputKg > 0
    ? `ഇന്ന് ഫാക്ടറിയിൽ ഉൽപ്പാദനം സജീവമാണ്. ശരാശരി ബാച്ച് ഔട്ട്പുട്ട് ${(todayOutputKg / (todayRuns.length || 1)).toFixed(1)} kg ആണ്.`
    : `ഇന്ന് ഇതുവരെ പൂർത്തിയായ ബാച്ചുകൾ രേഖപ്പെടുത്തിയിട്ടില്ല. അടുക്കളയിൽ പ്രൊഡക്ഷൻ റൺ ആരംഭിക്കുക.`
}

⚠️ **സ്റ്റോക്ക് മുന്നറിയിപ്പ്:** ${lowStockIngredients.length} ചേരുവകൾ കുറഞ്ഞ പരിധിയിലാണ്.`;
    }

    // 2. Oil optimization
    if (q.includes('ഓയിൽ') || q.includes('oil')) {
      return `💡 **ഓയിൽ ഒപ്റ്റിമൈസേഷൻ നിർദ്ദേശങ്ങൾ:**
----------------------------------------
1. **താപനില ക്രമീകരണം:** എണ്ണ 175°C - 180°C താപനിലയിൽ നിലനിർത്തുക. താപനില കുറഞ്ഞാൽ പലഹാരങ്ങൾ കൂടുതൽ എണ്ണ വലിച്ചെടുക്കും.
2. **ഫ്രൈയിംഗ് സമയം:** ഓരോ ബാച്ചും അമിതമായി എണ്ണയിൽ കിടക്കാതെ ഗോൾഡൻ നിറമാകുമ്പോൾ തന്നെ മാറ്റുക.
3. **ഡ്രെയിനിംഗ് ട്രേ:** വറുത്തു കോരിയ പലഹാരങ്ങൾ 2-3 മിനിറ്റ് ഡ്രെയിനിംഗ് വയർ മെഷിൽ വെച്ച് അധിക എണ്ണ വറ്റിക്കുക. (ഇത് വഴി 4-6% എണ്ണ ലാഭിക്കാം).
4. **ഫിൽട്ടറിംഗ്:** ദിവസേനയുള്ള പ്രൊഡക്ഷൻ കഴിഞ്ഞയുടൻ എണ്ണ ഫിൽട്ടർ ചെയ്തു കരിഞ്ഞ തരികൾ നീക്കം ചെയ്താൽ എണ്ണയുടെ ആയുസ്സ് 25% വർദ്ധിക്കും.`;
    }

    // 3. Low stock
    if (q.includes('കുറഞ്ഞ സ്റ്റോക്ക്') || q.includes('stock')) {
      if (lowStockIngredients.length === 0) {
        return `✅ **സ്റ്റോക്ക് നില തൃപ്തികരമാണ്!**\nനിലവിൽ എല്ലാ ചേരുവകളും സുരക്ഷിത പരിധിക്ക് മുകളിലാണ്.\n• ആകെ ചേരുവകൾ: ${ingredients.length}\n• സ്റ്റോക്ക് മൂല്യം: ₹${totalStockValuation.toLocaleString('en-IN')}`;
      }

      const list = lowStockIngredients
        .slice(0, 6)
        .map((i) => `• **${i.name}:** ബാക്കി ${i.currentStock} ${i.unit} (മിനിമം: ${i.minStock} ${i.unit})`)
        .join('\n');

      return `⚠️ **കുറഞ്ഞ സ്റ്റോക്ക് മുന്നറിയിപ്പ് (Low Stock Alert):**
----------------------------------------
താഴെ പറയുന്ന ${lowStockIngredients.length} ചേരുവകൾ ഉടൻ റീ-ഓർഡർ ചെയ്യേണ്ടതാണ്:

${list}
${lowStockIngredients.length > 6 ? `\n...+${lowStockIngredients.length - 6} ചേരുവകൾ കൂടി` : ''}`;
    }

    // 4. Costing & Profit
    if (q.includes('കോസ്റ്റിംഗ്') || q.includes('ലാഭം') || q.includes('costing')) {
      return `💰 **കോസ്റ്റിംഗ് & ലാഭവിഹിത വിശകലനം:**
----------------------------------------
• **അസംസ്കൃത വസ്തു മൂല്യം:** ₹${totalStockValuation.toLocaleString('en-IN')}
• **ഉൽപ്പന്നങ്ങളുടെ ശരാശരി മാർജിൻ:** ~28% - 35%
• **കൂലി അനുപാതം:** ഉൽപ്പാദന ചെലവിന്റെ ഏകദേശം 15% - 18% കൂലിക്കായി ചിലവഴിക്കപ്പെടുന്നു.

📈 **നിർദ്ദേശം:**
1. ചേരുവകൾ ബൾക്കായി വാങ്ങുമ്പോൾ മൊത്തവില കിഴിവുകൾ ഉറപ്പാക്കുക.
2. പാക്കിംഗ് നഷ്ടങ്ങൾ കുറയ്ക്കാൻ കൃത്യമായ ഗ്രാം തൂക്കം മെഷീൻ ഉപയോഗിക്കുക.`;
    }

    return `നന്ദി! കൂടുതൽ വിവരങ്ങൾക്ക് മുകളിലെ ബട്ടണുകളിൽ ക്ലിക്ക് ചെയ്യുക.`;
  };

  const handleActionClick = (promptText: string) => {
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: promptText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsThinking(true);

    setTimeout(() => {
      const reply = generateResponse(promptText);
      const aiMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        sender: 'ai',
        text: reply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, aiMsg]);
      setIsThinking(false);
    }, 450);
  };

  return (
    <>
      {/* FLOATING LAUNCHER BUTTON ANCHORED AT BOTTOM-LEFT */}
      <div className="fixed bottom-5 left-5 md:left-64 z-50">
        <button
          type="button"
          onClick={toggleOpen}
          className="flex items-center gap-2.5 px-4 py-3 rounded-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white shadow-xl shadow-purple-500/25 border border-purple-400/30 transition-all transform hover:scale-105 active:scale-95 cursor-pointer font-malayalam select-none"
          title="EPSO AI Copilot"
        >
          <div className="relative flex items-center justify-center">
            <FiZap className="w-5 h-5 text-amber-300 animate-pulse" />
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-white dark:ring-stone-900" />
          </div>
          <span className="text-xs font-black tracking-tight hidden sm:inline">AI അസിസ്റ്റന്റ്</span>
        </button>
      </div>

      {/* FLOATING CHAT BOT WIDGET POPUP IN LEFT CORNER */}
      {isOpen && (
        <div className="fixed bottom-20 left-4 md:left-64 z-50 w-[360px] sm:w-[420px] max-w-[calc(100vw-2rem)] h-[540px] max-h-[82vh] bg-white dark:bg-[#1E1B1B] rounded-3xl shadow-2xl border border-stone-200 dark:border-[#2E2828] flex flex-col overflow-hidden animate-apple-modal font-malayalam">
          {/* Header */}
          <div className="p-3.5 px-4 bg-gradient-to-r from-purple-700 via-indigo-700 to-purple-800 text-white flex items-center justify-between shrink-0 shadow-sm">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center text-amber-300 shadow-inner">
                <FiZap className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-black tracking-tight flex items-center gap-1.5 leading-none">
                  <span>EPSO AI Assistant</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping inline-block" />
                </h3>
                <p className="text-[10px] text-purple-200 mt-1 leading-none">
                  തത്സമയ ഫാക്ടറി ഉപദേശകൻ
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={toggleOpen}
                className="p-1.5 rounded-lg hover:bg-white/10 text-white/80 hover:text-white transition-colors cursor-pointer"
                title="Minimize / Close"
              >
                <FiMinus className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={toggleOpen}
                className="p-1.5 rounded-lg hover:bg-white/10 text-white/80 hover:text-white transition-colors cursor-pointer"
                title="Close"
              >
                <FiX className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Quick Action Buttons (Requested: 📊 ഉൽപ്പാദന റിപ്പോർട്ട്, 💡 ഓയിൽ ഒപ്റ്റിമൈസേഷൻ, ⚠️ കുറഞ്ഞ സ്റ്റോക്ക്, 💰 കോസ്റ്റിംഗ് & ലാഭം) */}
          <div className="p-2.5 bg-stone-50 dark:bg-[#161313] border-b border-stone-200/70 dark:border-[#282323] overflow-x-auto no-scrollbar flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => handleActionClick('ഉൽപ്പാദന റിപ്പോർട്ട്')}
              className="px-2.5 py-1.5 rounded-xl bg-white dark:bg-[#221E1E] border border-stone-200 dark:border-[#332A2A] text-[11px] font-bold text-stone-800 dark:text-stone-200 hover:border-purple-400 hover:text-purple-600 dark:hover:text-purple-300 shrink-0 press-apple cursor-pointer flex items-center gap-1.5 shadow-2xs"
            >
              <span>📊</span>
              <span>ഉൽപ്പാദന റിപ്പോർട്ട്</span>
            </button>

            <button
              type="button"
              onClick={() => handleActionClick('ഓയിൽ ഒപ്റ്റിമൈസേഷൻ')}
              className="px-2.5 py-1.5 rounded-xl bg-white dark:bg-[#221E1E] border border-stone-200 dark:border-[#332A2A] text-[11px] font-bold text-stone-800 dark:text-stone-200 hover:border-purple-400 hover:text-purple-600 dark:hover:text-purple-300 shrink-0 press-apple cursor-pointer flex items-center gap-1.5 shadow-2xs"
            >
              <span>💡</span>
              <span>ഓയിൽ ഒപ്റ്റിമൈസേഷൻ</span>
            </button>

            <button
              type="button"
              onClick={() => handleActionClick('കുറഞ്ഞ സ്റ്റോക്ക്')}
              className="px-2.5 py-1.5 rounded-xl bg-white dark:bg-[#221E1E] border border-stone-200 dark:border-[#332A2A] text-[11px] font-bold text-stone-800 dark:text-stone-200 hover:border-purple-400 hover:text-purple-600 dark:hover:text-purple-300 shrink-0 press-apple cursor-pointer flex items-center gap-1.5 shadow-2xs"
            >
              <span>⚠️</span>
              <span>കുറഞ്ഞ സ്റ്റോക്ക്</span>
            </button>

            <button
              type="button"
              onClick={() => handleActionClick('കോസ്റ്റിംഗ് & ലാഭം')}
              className="px-2.5 py-1.5 rounded-xl bg-white dark:bg-[#221E1E] border border-stone-200 dark:border-[#332A2A] text-[11px] font-bold text-stone-800 dark:text-stone-200 hover:border-purple-400 hover:text-purple-600 dark:hover:text-purple-300 shrink-0 press-apple cursor-pointer flex items-center gap-1.5 shadow-2xs"
            >
              <span>💰</span>
              <span>കോസ്റ്റിംഗ് & ലാഭം</span>
            </button>
          </div>

          {/* Messages Scroll Area */}
          <div className="flex-1 p-3.5 overflow-y-auto space-y-3 bg-stone-50/40 dark:bg-[#171414]">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-2.5 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.sender === 'ai' && (
                  <div className="w-7 h-7 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-white flex items-center justify-center font-black text-xs shrink-0 shadow-xs">
                    <FiZap className="w-3.5 h-3.5" />
                  </div>
                )}

                <div
                  className={`max-w-[85%] rounded-2xl p-3 text-xs leading-relaxed ${
                    msg.sender === 'user'
                      ? 'bg-purple-600 text-white rounded-br-xs font-bold shadow-xs'
                      : 'bg-white dark:bg-[#221E1E] border border-stone-200/80 dark:border-[#2E2828] text-stone-800 dark:text-stone-200 rounded-bl-xs shadow-2xs'
                  }`}
                >
                  <p className="whitespace-pre-line">{msg.text}</p>
                  <div
                    className={`flex items-center justify-between gap-2 mt-1.5 pt-1 border-t text-[10px] ${
                      msg.sender === 'user'
                        ? 'border-purple-500/50 text-purple-200'
                        : 'border-stone-100 dark:border-[#282323] text-stone-400'
                    }`}
                  >
                    <span>{msg.timestamp}</span>
                    {msg.sender === 'ai' && (
                      <button
                        type="button"
                        onClick={() => handleCopy(msg.id, msg.text)}
                        className="flex items-center gap-1 hover:text-purple-600 dark:hover:text-purple-400 cursor-pointer"
                        title="Copy message"
                      >
                        {copiedId === msg.id ? (
                          <>
                            <FiCheck className="w-3 h-3 text-emerald-500" />
                            <span className="text-emerald-500 font-bold">Copied</span>
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
              <div className="flex gap-2.5 items-center">
                <div className="w-7 h-7 rounded-xl bg-purple-600 text-white flex items-center justify-center text-xs shrink-0">
                  <FiZap className="w-3.5 h-3.5 animate-spin" />
                </div>
                <div className="p-2.5 px-3 rounded-2xl bg-white dark:bg-[#221E1E] border border-stone-200/80 dark:border-[#2E2828] text-xs text-stone-500 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-bounce" />
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-bounce [animation-delay:0.2s]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-bounce [animation-delay:0.4s]" />
                  <span className="text-[11px] font-bold ml-1">ചിന്തിക്കുന്നു...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Bottom Bar: Unsentable input with Malayalam placeholder "AI ഉടൻ വരുന്നു... (AI is coming soon)" */}
          <div className="p-3 border-t border-stone-200 dark:border-[#282323] bg-white dark:bg-[#1E1B1B]">
            <div className="flex items-center gap-2">
              <input
                type="text"
                disabled
                readOnly
                value=""
                placeholder="AI ഉടൻ വരുന്നു... (AI is coming soon)"
                className="flex-1 py-2 px-3.5 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-stone-100/70 dark:bg-[#141212] text-xs text-stone-400 placeholder-stone-400 cursor-not-allowed select-none font-medium"
              />
              <button
                type="button"
                disabled
                className="p-2 rounded-xl bg-stone-200 dark:bg-stone-800 text-stone-400 cursor-not-allowed opacity-50 shrink-0"
                title="AI coming soon"
              >
                <FiSend className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
