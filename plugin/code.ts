// declare const SITE_URL: string;
const SITE_URL = 'https://auth.demidoff.me';
const pluginId = figma.pluginId;

interface User {
  name: string;
  email: string;
  picture: string;
}

interface TokenInfo {
  token: string;
  expiresAt: number;
  refreshToken: string;
  email: string;
  name: string;
  picture: string;
}

// Store access token in figma client storage
async function storeToken(token: TokenInfo): Promise<void> {
  await figma.clientStorage.setAsync('token_info', token);
}

// Get the token from figma client storage
async function getToken(): Promise<TokenInfo> {
  const token = await figma.clientStorage.getAsync('token_info');
  if (token) {
    const remainingMs = getTokenRemainingTime(token);
    if (remainingMs === 0) {
      // Token expired, we must clear it
      await clearToken();
    }
  }

  return token;
}

// Clear the token from figma client storage
async function clearToken(): Promise<void> {
  await figma.clientStorage.setAsync('token_info', null);
}

// Start the OAuth flow
async function authenticate(): Promise<User | null> {
  const tokenInfo = await getToken();

  return new Promise((resolve, reject) => {
    // From OAuthFlow
    figma.ui.onmessage = async (msg) => {
      console.log('Received message:', msg.type);

      if (msg.type === 'ui-ready') {
        if (tokenInfo) {
          // figma.notify('User authenticated');
          figma.ui.postMessage(
            {
              type: 'get-user-info',
              accessToken: tokenInfo.token,
            },
            { origin: `${SITE_URL}` }
          );
        } else {
          // UI is ready, start the auth flow
          figma.ui.postMessage(
            { type: 'start-auth' },
            { origin: `${SITE_URL}` }
          );
        }
      } else if (msg.type === 'auth-success') {
        const { type, ...tokenInfo } = msg;

        // Auth succeeded, store the token info
        await storeToken(tokenInfo);
        // Get user info using the iframe
        figma.ui.postMessage(
          {
            type: 'get-user-info',
            accessToken: tokenInfo.token,
          },
          { origin: `${SITE_URL}` }
        );
      } else if (msg.type === 'auth-error') {
        figma.notify(`Authentication failed: ${msg.error}`);
        reject(new Error('Authentication failed'));
      } else if (msg.type === 'auth-expired') {
        await clearToken();
        figma.notify('Authentication expired, please log in again');
        reject(new Error('Authentication expired'));
      } else if (msg.type === 'user-info-error') {
        figma.notify(`Failed to get user info: ${msg.error}`);
        reject(new Error(msg.error));
      } else if (msg.type === 'user-info-result') {
        resolve(msg.user);
      }
    };
  });
}

// Main plugin function
async function main() {
  // Create a UI with scripts to use browser API to handle OAuth
  figma.showUI(
    `
    <script>
      window.location.href = '${SITE_URL}';
    </script>
  `,
    { width: 1, height: 1, visible: false }
  );

  const tokenInfo = await getToken();

  if (!tokenInfo) {
    try {
      const user = await authenticate();
      console.log('User info:', user);
      if (user) {
        figma.notify(`Logged in as ${user.name}`);
        figma.closePlugin();
      } else {
        // If the user could not be fetched, re-authenticate
        await authenticate();
      }
    } catch (error) {
      if (error instanceof Error) {
        console.error('Error getting user info:', error.message);
        figma.notify(`Error getting user info: ${error.message}`);
      }
      // If there was an error (like expired token), start auth flow
      await authenticate();
    }
  } else {
    console.log('User authenticated, email:', tokenInfo.email);
    figma.notify('User authenticated');
    figma.closePlugin();
  }
}

// Add a function to check remaining token lifetime
function getTokenRemainingTime(tokenInfo: TokenInfo): number | null {
  if (!tokenInfo) {
    return null;
  }

  const remainingMs = tokenInfo.expiresAt - Date.now();
  // Return seconds remaining
  return remainingMs > 0 ? Math.floor(remainingMs / 1000) : 0;
}

// Run the plugin
main();
