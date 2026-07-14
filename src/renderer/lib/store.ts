import { create } from 'zustand';

interface UIState {
  thumbDisplaySize: number; // pixel target for card thumbnail
  setThumbDisplaySize: (px: number) => void;
}

export const useUIStore = create<UIState>((set) => ({
  thumbDisplaySize: 256,
  setThumbDisplaySize: (px: number) => {
    // Update CSS custom property so grid uses it
    document.documentElement.style.setProperty('--thumb-display-size', `${px}px`);
    set({ thumbDisplaySize: px });
  },
}));
