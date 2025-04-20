// Extend the Window interface to include authPopup
declare global {
  interface Window {
    authPopup?: WindowProxy | null;
    oauthState?: string;
    pluginId: string;
  }
}

export {};
