// Extend the Window interface to include authPopup
declare global {
  interface Window {
    authPopup?: WindowProxy | null;
    pluginId: string;
  }
}

export {};
