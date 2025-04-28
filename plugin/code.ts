// declare const SITE_URL: string;
const SITE_URL = 'https://auth.demidoff.me';
const pluginId = figma.pluginId;

interface User {
  name: string;
  email: string;
  picture: string;
}

// Store access token in figma client storage
async function storeAccessToken(token: string): Promise<void> {
  await figma.clientStorage.setAsync('access_token', token);
}

// Get access token from figma client storage
async function getAccessToken(): Promise<string> {
  return await figma.clientStorage.getAsync('access_token');
}

// Clear access token from figma client storage
async function clearAccessToken(): Promise<void> {
  await figma.clientStorage.setAsync('access_token', null);
}

// Check if user is authenticated
async function isAuthenticated(): Promise<boolean> {
  const accessToken = await getAccessToken();
  return !!accessToken;
}

// Start the OAuth flow
async function authenticate(): Promise<User | null> {
  const accessToken = await getAccessToken();

  if (!accessToken) {
    figma.notify('Not authenticated');
    return null;
  }

  return new Promise((resolve, reject) => {
    // From OAuthFlow
    figma.ui.onmessage = async (msg) => {
      if (msg.type === 'ui-ready') {
        // UI is ready, start the auth flow
        figma.ui.postMessage({ type: 'start-auth' }, { origin: `${SITE_URL}` });
      } else if (msg.type === 'auth-success') {
        console.log('Auth success:', msg.token);
        // Auth succeeded, store the token
        await storeAccessToken(msg.token);
        // Get user info using the iframe
        figma.ui.postMessage(
          {
            type: 'get-user-info',
            accessToken: msg.token,
          },
          { origin: `${SITE_URL}` }
        );
      } else if (msg.type === 'auth-error') {
        figma.notify(`Authentication failed: ${msg.error}`);
      } else if (msg.type === 'auth-expired') {
        await clearAccessToken();
        figma.notify('Authentication expired, please log in again');
        reject(new Error('Authentication expired'));
      } else if (msg.type === 'ui-ready-for-user-info') {
        figma.ui.postMessage(
          {
            type: 'get-user-info',
            accessToken,
          },
          { origin: `${SITE_URL}` }
        );
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
      // window.location.href = '${SITE_URL}?action=get-user-info';
    </script>
  `,
    { width: 1, height: 1, visible: false }
  );

  // Check if already authenticated
  const authenticated = await isAuthenticated();

  if (authenticated) {
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
    // Not authenticated, start the OAuth flow
    await authenticate();
  }
}

// Run the plugin
main();
