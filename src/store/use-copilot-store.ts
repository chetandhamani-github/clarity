import { create } from 'zustand';

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  suggestedAction?: string;
}

const getInitialWelcomeMessage = (): ChatMessage => ({
  id: 'welcome-1',
  sender: 'assistant',
  text: `Hello! I'm your Clarity Financial Copilot.\n\nI can analyze your spending patterns, track your 50/30/20 budget targets, and answer questions about your cash flow. How can I assist you today?`,
  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
});

interface CopilotStoreState {
  messages: ChatMessage[];
  addMessage: (msg: ChatMessage) => void;
  setMessages: (updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
  clearMessages: () => void;
}

export const useCopilotStore = create<CopilotStoreState>((set) => ({
  messages: [getInitialWelcomeMessage()],
  addMessage: (msg) => set((state) => ({ messages: [...state.messages, msg] })),
  setMessages: (updater) =>
    set((state) => ({
      messages: typeof updater === 'function' ? updater(state.messages) : updater,
    })),
  clearMessages: () =>
    set({
      messages: [
        {
          id: `welcome-${Date.now()}`,
          sender: 'assistant',
          text: 'Conversation reset. What would you like to explore about your finances?',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ],
    }),
}));

