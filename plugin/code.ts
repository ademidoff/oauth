// declare const SITE_URL: string;
const SITE_URL = 'https://auth.demidoff.me'; // Replace with your server URL

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

// Get user information using the access token
async function getUserInfo(): Promise<User | null> {
  const accessToken = await getAccessToken();

  if (!accessToken) {
    figma.notify('Not authenticated');
    return null;
  }

  try {
    const response = await fetch(`${SITE_URL}/auth/user`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (response.ok) {
      const userData = await response.json();
      return userData;
    } else {
      if (response.status === 401) {
        // Token expired or invalid
        await clearAccessToken();
        figma.notify('Authentication expired, please log in again');
      } else {
        figma.notify('Failed to fetch user data');
      }
      return null;
    }
  } catch (error) {
    console.error('Error fetching user data:', error);
    figma.notify('Error fetching user data');
    return null;
  }
}

// Check if user is authenticated
async function isAuthenticated(): Promise<boolean> {
  const accessToken = await getAccessToken();
  return !!accessToken;
}

// Start the OAuth flow using the server-side approach
async function startOAuthFlow(): Promise<void> {
  try {
    // Get a read/write key pair from the server
    const keyResponse = await fetch(`${SITE_URL}/auth/keys`, {
      method: 'GET',
    });

    if (!keyResponse.ok) {
      throw new Error('Failed to get authentication keys');
    }

    const { readKey } = await keyResponse.json();

    // Step 1: Open the authentication window
    figma.showUI(
      `<script>
        // Open the authentication page in a new window
        const authWindow = window.open("${SITE_URL}/auth/google?readKey=${readKey}", "_blank");
        
        // Function to poll the server for the result
        async function pollForAuthResult() {
          try {
            const response = await fetch("${SITE_URL}/auth/poll?key=${readKey}");
            if (response.ok) {
              const data = await response.json();
              if (data.access_token) {
                // Send the token back to the plugin
                parent.postMessage({ 
                  pluginMessage: { 
                    type: 'auth-success', 
                    token: data.access_token 
                  } 
                }, 'https://www.figma.com');
                return;
              }
            }
            // If we haven't received the token yet, poll again
            setTimeout(pollForAuthResult, 2000);
          } catch (error) {
            console.error('Polling error:', error);
            // Keep polling even if there's an error
            setTimeout(pollForAuthResult, 2000);
          }
        }
        
        // Start polling
        pollForAuthResult();
      </script>`,
      { width: 1, height: 1 }
    );

    // Listen for the auth result
    figma.ui.onmessage = async (msg) => {
      if (msg.type === 'auth-success') {
        await storeAccessToken(msg.token);
        const user = await getUserInfo();
        if (user) {
          figma.notify(`Logged in as ${user.name}`);
          // Continue with your plugin's main functionality...
        } else {
          figma.notify('Failed to get user info');
        }
        // figma.closePlugin();
      }
    };
  } catch (error: any) {
    const errorMessage = `Authentication failed${
      error?.message ? ' :' + error.message : ''
    }`;
    console.error(errorMessage);
    figma.notify(errorMessage);
    // figma.closePlugin();
  }
}

// Main plugin function
async function main() {
  // Check if already authenticated
  const authenticated = await isAuthenticated();

  if (authenticated) {
    const user = await getUserInfo();
    if (user) {
      figma.notify(`Logged in as ${user.name}`);
      // Continue with your plugin's main functionality...
      // figma.closePlugin();
    } else {
      // User info couldn't be fetched, re-authenticate
      await startOAuthFlow();
    }
  } else {
    // Not authenticated, start the OAuth flow
    await startOAuthFlow();
  }
}

// Run the plugin
main();
