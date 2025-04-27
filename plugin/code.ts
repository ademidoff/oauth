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

// Start the OAuth flow using the server-side approach
async function startOAuthFlow(): Promise<void> {
  // Create a UI with scripts to handle the OAuth flow
  figma.showUI(
    `
    <script>
      window.location.href = '${SITE_URL}';
    </script>
  `,
    { width: 1, height: 1, visible: false }
  );

  // Listen for messages from the UI iframe
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
    } else if (msg.type === 'user-info-result') {
      console.log('User info:', msg.user);
      figma.notify(`Logged in as ${msg.user?.name}`, {
        timeout: 5000,
        onDequeue: () => {
          figma.closePlugin();
        },
        button: {
          text: 'Dismiss',
          action: () => {
            figma.closePlugin();
            return true;
          },
        },
      });
    } else if (msg.type === 'auth-error') {
      figma.notify(`Authentication failed: ${msg.error}`);
      figma.closePlugin();
    } else if (msg.type === 'auth-expired') {
      await clearAccessToken();
      figma.notify('Authentication expired, please log in again');
      figma.closePlugin();
    } else if (msg.type === 'user-info-error') {
      figma.notify(`Failed to get user info: ${msg.error}`);
      figma.closePlugin();
    }
  };
}

// Get user information using the access token
async function getUserInfo(): Promise<User | null> {
  const accessToken = await getAccessToken();

  if (!accessToken) {
    figma.notify('Not authenticated');
    return null;
  }

  // Show UI to use browser APIs for fetching user data
  figma.showUI(
    `
    <script>
      window.location.href = '${SITE_URL}?action=get-user-info';
    </script>    
  `,
    { width: 1, height: 1, visible: false }
  );

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error('User info request timed out'));
      figma.closePlugin();
    }, 10000);

    figma.ui.onmessage = async (msg) => {
      if (msg.type === 'ui-ready-for-user-info') {
        figma.ui.postMessage(
          {
            type: 'get-user-info',
            accessToken,
          },
          { origin: `${SITE_URL}` }
        );
      } else if (msg.type === 'user-info-result') {
        clearTimeout(timeoutId);
        resolve(msg.user);
      } else if (msg.type === 'auth-expired') {
        clearTimeout(timeoutId);
        await clearAccessToken();
        reject(new Error('Authentication expired'));
      } else if (msg.type === 'user-info-error') {
        clearTimeout(timeoutId);
        reject(new Error(msg.error));
      }
    };
  });
}

// Main plugin function
async function main() {
  // Check if already authenticated
  const authenticated = await isAuthenticated();

  if (authenticated) {
    try {
      const user = await getUserInfo();
      console.log('User info:', user);
      if (user) {
        figma.notify(`Logged in as ${user.name}`, {
          timeout: 5000,
          onDequeue: () => {
            // Continue with your plugin's main functionality...
            figma.closePlugin();
          },
          button: {
            text: 'Dismiss',
            action: () => {
              figma.closePlugin();
              return true;
            },
          },
        });
      } else {
        // User info couldn't be fetched, re-authenticate
        await startOAuthFlow();
      }
    } catch (error) {
      if (error instanceof Error) {
        console.error('Error getting user info:', error.message);
        figma.notify(`Error getting user info: ${error.message}`);
      }
      // If there was an error (like expired token), start auth flow
      await startOAuthFlow();
    }
  } else {
    // Not authenticated, start the OAuth flow
    await startOAuthFlow();
  }
}

// Run the plugin
main();
