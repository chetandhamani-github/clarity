import { create } from 'zustand';

export type RemindersTab = 'upcoming' | 'custom' | 'dues' | 'snoozed' | 'completed';

interface RemindersUiState {
  selectedTab: RemindersTab;
  selectedCategory: string;
  searchQuery: string;
  setSelectedTab: (tab: RemindersTab) => void;
  setSelectedCategory: (category: string) => void;
  setSearchQuery: (query: string) => void;
  resetFilters: () => void;
}

export const useRemindersStore = create<RemindersUiState>((set) => ({
  selectedTab: 'upcoming',
  selectedCategory: 'all',
  searchQuery: '',
  setSelectedTab: (selectedTab) => set({ selectedTab }),
  setSelectedCategory: (selectedCategory) => set({ selectedCategory }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  resetFilters: () =>
    set({
      selectedTab: 'upcoming',
      selectedCategory: 'all',
      searchQuery: '',
    }),
}));

