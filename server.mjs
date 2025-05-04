// Backend server (Node.js with Express)
import express, { json, urlencoded } from 'express';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

const app = express();
// Google OAuth configuration
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;
const SITE_URL = process.env.SITE_URL;
// https://developers.google.com/identity/protocols/oauth2/scopes#oauth2
const SCOPES = 'profile email openid';

// In-memory storage for auth keys and states (use a database in production)
const authStore = new Map();

// Helper function to make HTTP requests using native Node.js modules
async function makeRequest(url, options = {}, data = null) {
  const fetchOptions = {
    method: options.method || 'GET',
    headers: options.headers || {},
  };

  try {
    if (data) {
      fetchOptions.body = JSON.stringify(data);
      fetchOptions.headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(url, fetchOptions);

    // Check if the response is ok (status in the range 200-299)
    if (!response.ok) {
      const errorData = await response.text();
      let parsedError;

      try {
        // Try to parse as JSON if possible
        parsedError = JSON.parse(errorData);
      } catch (e) {
        // If not JSON, use as text
        parsedError = errorData;
      }

      const error = new Error(`Request failed with status ${response.status}`);
      error.status = response.status;
      error.response = { data: parsedError };
      throw error;
    }

    // Check Content-Type to handle JSON responses
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      return {
        status: response.status,
        data: await response.json(),
      };
    } else {
      // Handle non-JSON responses
      return {
        status: response.status,
        data: await response.text(),
      };
    }
  } catch (error) {
    // Handle network errors or JSON parsing errors
    if (!error.status) {
      error.message = `Network error: ${error.message}`;
    }
    throw error;
  }
}

app.use(json());
app.use(urlencoded({ extended: true }));
app.use(cookieParser());
app.disable('x-powered-by');

// Add cors middleware
app.use((req, res, next) => {
  const origin = req.get('Origin');
  console.log('Request Origin:', origin);

  if (!origin) {
    return next();
  }

  // Allow specific origins
  let allowedOrigins = [
    SITE_URL,
    'https://www.figma.com',
    'https://figma.com',
    'http://localhost:3000',
  ];

  if (origin.startsWith('figma:') || allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin || '*');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header(
      'Access-Control-Allow-Headers',
      'Origin, X-Requested-With, Content-Type, Accept, Authorization'
    );
    // Cache preflight response for 1 hour
    res.header('Access-Control-Max-Age', '3600');

    if (req.method === 'OPTIONS') {
      // Respond to a preflight request
      return res.status(204).end();
    }
  }

  next();
});

// Generate a random string for PKCE code_verifier and auth keys
function generateRandomString(length) {
  return crypto.randomBytes(length).toString('base64url').substring(0, length);
}

// Create SHA-256 hash for PKCE code_challenge
async function generateCodeChallenge(codeVerifier) {
  const hash = crypto.createHash('sha256');
  hash.update(codeVerifier);
  return hash.digest('base64url');
}

// Middleware to check if the request should be authorized
function checkOrigin(req, res, next) {
  const origin = req.get('Origin');
  if (
    origin &&
    (origin.startsWith('https://www.figma.com') || origin.startsWith(SITE_URL))
  ) {
    next();
  } else {
    res.status(403).send('Forbidden');
  }
}

// Decode JWT token
function decodeJwtToken(token) {
  try {
    // JWT structure: header.payload.signature
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid JWT token format');
    }

    // Decode the payload (second part)
    const payload = parts[1];
    const decodedPayload = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));

    // Parse the JSON payload
    return JSON.parse(decodedPayload);
  } catch (error) {
    console.error('Failed to decode JWT token:', error);
    return null;
  }
}

// Serve favicon.ico
app.get('/favicon.ico', (req, res) => {
  // Base64 encoded simple icon (a blue key shape representing authentication)
  const faviconBuffer = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAB+0lEQVR4AcXBA3BsQQDG8f+322fbtm3btm3bto1n27Zt27Z9zTttd7vZ3MlMvt8AxP9kxHVTPS4DpEYNhJY+Rax1Ij6XLhPi9cZr/g5jacSAWqjhKoh/ZKraa7xxRE4K0pKnEasdB0BIWSfCqnkSZlcgusLLqtsRWhGfoZkdEVbZi5BFbiMSHpxDyAIXXEYYEb/AxbcuEZTfjOC5LmG76gZBs1wwOqohbIqu8rFrcoBG+QwImuECdBGa95CQpe547TohbLLLkseMTgieex+fi45I8LwHheipRch895BN19X3ILTiiQf6VosOCJzmFF75NOLnOYVuuTuOUVSPUEw3QvZOS1G/vYDgOQ9HPPIPvmHZlohPVKUKaJwA9cv/IL5G3WlFF7kUuzGLQO2ay5mcoQn0IFSR0ICuSYf47/mtDgSFZugVYZXPiOgzXxhFbABXxE8/LC5D42rBhddtNgSFlnEga801RLTLZ4wZ3QwIByo1hsAL6/6B8EqnvbOa2RGyJQ6ZoQH1CLb+dP8/ENXgKoJnOx+09/ENsaFiPVgj/khcbjWNIN/tDQje15bwypdfKZt2A/E/OGOLre0zIv6H1+4LBIXW8FH4kXeALhPCJ+sOl9cYQpHVT4vGhQzIntfqoxE+0ZFzVwuCouqeEPErislJa50OcZmdDYg/Tdfn/QZUnAzdUa0rOQAAAABJRU5ErkJggg==',
    'base64'
  );

  res.setHeader('Content-Type', 'image/x-icon');
  // Cache for a week (7 days)
  res.setHeader('Cache-Control', 'public, max-age=604800');
  res.send(faviconBuffer);
});

app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta name="robots" content="noindex">
      <link rel="icon" href="/favicon.ico" type="image/x-icon">
      <title>Authentication</title>
      <style>
        body { font-family: Arial, sans-serif; text-align: center; padding-top: 50px; }
        .success { color: green; }
        .progress { color: slateblue; }
      </style>
    </head>
    <body>
      <h2 class="progress">Authenticating...</h2>
    </body>
    <script>
      // const url = new URL(window.location.href);
      // const params = new URLSearchParams(url.search);
      const pluginId = 'Rewordy'; // Replace with your actual plugin ID

      // Let the plugin know that UI is ready
      parent.postMessage({ pluginMessage: { type: 'ui-ready' }, pluginId }, '*');

      // Listen for messages from the plugin
      window.onmessage = async (event) => {
        const message = event.data.pluginMessage;
        console.log("Received message:", message, "pluginId:", event.data.pluginId);
        
        if (message.type === 'start-auth') {
          try {
            // Step 1: Get read/write keys from the server
            const keyResponse = await fetch("${SITE_URL}/auth/keys");
            if (!keyResponse.ok) {
              throw new Error("Failed to get authentication keys");
            }
            
            const { readKey } = await keyResponse.json();
            
            // Step 2: Open the authentication window
            window.open("${SITE_URL}/auth/google?readKey=" + readKey, "_blank");
            
            // Step 3: Start polling for the auth result
            pollForAuthResult(readKey);
          } catch (error) {
            console.error("Auth error:", error);
            parent.postMessage({
              pluginMessage: { 
                type: 'auth-error', 
                error: error.message 
              }, 
              pluginId
            }, '*');
          }
        } else if (message.type === 'get-user-info') {
          try {
            // Get user info using the access token
            const accessToken = message.accessToken;
            const response = await fetch("${SITE_URL}/auth/user", {
              headers: {
                'Authorization': 'Bearer ' + accessToken
              },
              credentials: 'include'
            });
            
            if (response.ok) {
              const user = await response.json();
              parent.postMessage({ 
                pluginMessage: { 
                  type: 'user-info-result', 
                  user 
                },
                pluginId
              }, '*');
            } else {
              if (response.status === 401) {
                parent.postMessage({
                  pluginMessage: { 
                    type: 'auth-expired'
                  },
                  pluginId
                }, '*');
              } else {
                throw new Error("Failed to fetch user data");
              }
            }
          } catch (error) {
            console.error("User info error:", error);
            parent.postMessage({ 
              pluginMessage: { 
                type: 'user-info-error', 
                error: error.message 
              },
              pluginId
            }, '*');
          }
        }
      };

      // Poll the server for auth result
      async function pollForAuthResult(readKey) {
        try {
          const response = await fetch("${SITE_URL}/auth/poll?key=" + readKey);
          if (response.ok) {
            const data = await response.json();
            if (data.access_token) {
              // Send the token back to the plugin
              parent.postMessage({ 
                pluginMessage: {
                  type: 'auth-success', 
                  token: data.access_token,
                  refresh_token: data.refresh_token,
                  expires_at: data.expires_at,
                  email: data.email,
                  name: data.name,
                  picture: data.picture,
                  scope: data.scope,
                },
                pluginId
              }, '*');
              return;
            }
          }

          // If we haven't received the token yet, poll again
          setTimeout(() => pollForAuthResult(readKey), 2000);
        } catch (error) {
          console.error("Polling error:", error);
          // Keep polling even if there's an error
          setTimeout(() => pollForAuthResult(readKey), 2000);
        }
      }
    </script>

    </html>
  `);
});

// Create a read/write key pair for the OAuth flow
app.get('/auth/keys', (req, res) => {
  console.log('/auth/keys request origin:', req.get('Origin'));
  const readKey = generateRandomString(32);
  const writeKey = generateRandomString(32);

  // Store the keys with empty data
  authStore.set(readKey, { writeKey, data: null });
  console.log('Generated keys:', { readKey, writeKey });

  res.json({ readKey, writeKey });
});

// Start the OAuth process with Google, including PKCE
app.get('/auth/google', async (req, res) => {
  const { readKey } = req.query;

  if (!readKey || !authStore.has(readKey)) {
    return res.status(400).send('Invalid read key');
  }

  const authData = authStore.get(readKey);
  const { writeKey } = authData;

  // Generate PKCE code verifier and challenge
  const codeVerifier = generateRandomString(64);
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  // Store the code verifier with the auth data
  authStore.set(readKey, {
    ...authData,
    codeVerifier,
    state: writeKey, // Use the writeKey as the OAuth state parameter
  });

  // Set the write key in a cookie as required by Figma OAuth guidelines
  // This cookie will be used to verify the state parameter in the callback
  res.cookie('auth_write_key', writeKey, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production', // Only use secure in production
    sameSite: 'lax',
    maxAge: 1 * 60 * 1000, // 1 minute expiration
  });

  // Construct Google OAuth URL with PKCE parameters
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.append('client_id', GOOGLE_CLIENT_ID);
  authUrl.searchParams.append('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.append('response_type', 'code');
  authUrl.searchParams.append('scope', SCOPES);
  authUrl.searchParams.append('state', writeKey);
  authUrl.searchParams.append('code_challenge', codeChallenge);
  authUrl.searchParams.append('code_challenge_method', 'S256');
  authUrl.searchParams.append('access_type', 'offline');

  // Redirect the user to Google's authentication page
  res.redirect(authUrl.toString());
});

// Handle the OAuth callback from Google
app.get('/auth/callback', async (req, res) => {
  const { code, state } = req.query;
  const cookieWriteKey = req.cookies.auth_write_key;

  if (!code || !state) {
    return res.status(400).send('Missing code or state parameter');
  }

  // Verify that the state matches the write key stored in the cookie
  // This is a critical security check required by Figma's OAuth guidelines
  if (!cookieWriteKey || state !== cookieWriteKey) {
    console.error('State/cookie mismatch:', { state, cookieWriteKey });
    return res.status(400).send('Invalid state parameter or write key');
  }

  // Find the auth data by writeKey (state)
  let readKey = null;
  let authData = null;

  for (const [key, data] of authStore.entries()) {
    if (data.state === state) {
      readKey = key;
      authData = data;
      break;
    }
  }

  if (!readKey || !authData) {
    return res.status(400).send('Invalid state parameter');
  }

  try {
    // Clear the write key cookie after use
    res.clearCookie('auth_write_key');

    // Exchange authorization code for access token using PKCE
    const tokenResponse = await makeRequest(
      'https://oauth2.googleapis.com/token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      },
      {
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        code,
        code_verifier: authData.codeVerifier,
        grant_type: 'authorization_code',
        redirect_uri: REDIRECT_URI,
      }
    );

    const data = {
      access_token: tokenResponse.data.access_token,
      refresh_token: tokenResponse.data.refresh_token || null,
      expires_at: Date.now() + (tokenResponse.data.expires_in || 3600) * 1000,
      scope: tokenResponse.data.scope,
    };

    if (tokenResponse.data?.id_token) {
      // Decode the ID token to get user information
      const parsed = decodeJwtToken(tokenResponse.data.id_token);
      if (parsed) {
        const { email, name, picture, exp } = parsed;
        data.email = email;
        data.name = name;
        data.picture = picture;
        data.expires_at = exp * 1000; // Convert to milliseconds
      }
    }

    // Store the token in our auth store
    authStore.set(readKey, {
      ...authData,
      data,
    });

    // Show success page
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta name="robots" content="noindex">
        <link rel="icon" href="/favicon.ico" type="image/x-icon">
        <title>Authentication</title>
        <style>
          body { font-family: Arial, sans-serif; text-align: center; padding-top: 50px; }
          .success { color: green; }
        </style>
      </head>
      <body>
        <h2 class="success">You are authenticated!</h2>
        <p>You can return to Figma or the web app.</p>
        <p>This window will close in <span class="countdown">5</span> seconds.</p>
      </body>
      <script>
        document.addEventListener('DOMContentLoaded', () => {
          const countdownEl = document.querySelector('.countdown');
          let seconds = parseInt(countdownEl.textContent, 10);
          
          const countdownInterval = setInterval(() => {
            seconds--;
            countdownEl.textContent = seconds;
            
            if (seconds <= 0) {
              clearInterval(countdownInterval);
              window.close();
            }
          }, 1000);
        });
      </script>
      </html>
    `);
  } catch (error) {
    console.error(
      'Token exchange error:',
      error.response?.data || error.message
    );
    res.status(500).send('Failed to exchange authorization code for tokens');
  }
});

// Poll endpoint to get the token
app.get('/auth/poll', (req, res) => {
  const { key } = req.query;

  if (!key || !authStore.has(key)) {
    return res.status(400).json({ error: 'Invalid key' });
  }

  const authData = authStore.get(key);

  if (!authData.data) {
    return res.status(202).json({ message: 'Waiting for authentication' });
  }

  // Get the tokens and then delete the auth data
  const { data } = authData;
  authStore.delete(key);

  // Return the tokens to the Figma plugin
  res.json(data);
});

// Get user info from Google API
app.get('/auth/user', async (req, res) => {
  // Get the access token from the request header
  const authHeader = req.get('authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Access token required' });
  }

  // const accessToken = authHeader.split(' ')[1];

  try {
    // Fetch user info from Google
    const userInfoResponse = await makeRequest(
      'https://www.googleapis.com/oauth2/v2/userinfo',
      {
        // headers: { Authorization: `Bearer ${accessToken}` },
        headers: { Authorization: authHeader },
      }
    );

    const user = {
      name: userInfoResponse.data.name,
      email: userInfoResponse.data.email,
      picture: userInfoResponse.data.picture,
    };

    res.json(user);
  } catch (error) {
    console.error('User info error:', error.response?.data || error.message);

    // Handle token expiration or invalidity
    if (error.response?.status === 401) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    res.status(500).json({ error: 'Failed to fetch user information' });
  }
});

// Refresh an access token using a refresh token
app.post('/auth/refresh', async (req, res) => {
  const { refresh_token } = req.body;

  if (!refresh_token) {
    return res.status(400).json({ error: 'Refresh token required' });
  }

  try {
    // Exchange refresh token for a new access token
    const tokenResponse = await makeRequest(
      'https://oauth2.googleapis.com/token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      },
      {
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        refresh_token,
        grant_type: 'refresh_token',
      }
    );

    const data = {
      access_token: tokenResponse.data.access_token,
      expires_at: Date.now() + (tokenResponse.data.expires_in || 3600) * 1000,
      scope: tokenResponse.data.scope,
    };

    if (tokenResponse.data?.id_token) {
      // Decode the ID token to get user information
      const parsed = decodeJwtToken(tokenResponse.data.id_token);
      if (parsed) {
        const { email, name, picture, exp } = parsed;
        data.email = email;
        data.name = name;
        data.picture = picture;
        data.expires_at = exp * 1000; // Convert to milliseconds
      }
    }

    res.json(data);
  } catch (error) {
    console.error(
      'Token refresh error:',
      error?.response?.data || error.message
    );
    res.status(500).json({ error: 'Failed to refresh access token' });
  }
});

// Debug the auth store
app.post('/auth/debug', (req, res) => {
  const { token } = req.body;

  if (!token || token !== process.env.DEBUG_TOKEN) {
    console.error('Unauthorized debug access attempt', 'token', token);
    return res.status(401).send('Unauthorized');
  }

  const debugData = Array.from(authStore.entries()).map(([key, value]) => ({
    [key]: value,
  }));

  res.json(debugData);
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export default app;
