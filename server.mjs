// Backend server (Node.js with Express) - server.js
import express, { json, urlencoded } from 'express';
import axios from 'axios';
import cors from 'cors';
import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

const app = express();

app.use(json());
app.use(urlencoded({ extended: true }));
app.disable('x-powered-by');

// Enable CORS for Figma domains
app.use(
  cors({
    origin: [
      'https://www.figma.com',
      'https://figma.com',
      'https://www.figma.com/file/*',
      // Add the desktop app origin if needed
      'figma:*',
      // For local development
      'http://localhost:3000',
      '*',
    ],
    credentials: true,
  })
);

// Google OAuth configuration
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;
const SITE_URL = process.env.SITE_URL || 'http://localhost:3000';
const SCOPES = 'profile email';

// In-memory storage for auth keys and states (use a database in production)
const authStore = new Map();

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

// Middleware to check if the request is from Figma
function checkFigmaOrigin(req, res, next) {
  const origin = req.get('Origin');
  if (
    origin &&
    (origin.startsWith('https://www.figma.com') ||
      origin.startsWith('http://localhost:3000'))
  ) {
    next();
  } else {
    res.status(403).send('Forbidden');
  }
}

app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
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
    const url = new URL(window.location.href);
    const params = new URLSearchParams(url.search);
    const pluginId = params.get('pluginId');
    console.log('pluginId', pluginId);
      // Tell the main plugin code that the UI is ready
      parent.postMessage({ pluginMessage: { type: 'ui-ready' }, pluginId }, '*');

      // Listen for messages from the plugin
      window.onmessage = async (event) => {
        const message = event.data.pluginMessage;
        console.log("Received data:", event.data);
        console.log("Received message:", message);
        
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
              const userData = await response.json();
              parent.postMessage({ 
                pluginMessage: { 
                  type: 'user-info-result', 
                  userData 
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
                  token: data.access_token 
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

  if (!code || !state) {
    return res.status(400).send('Missing code or state parameter');
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
    // Exchange authorization code for access token using PKCE
    const tokenResponse = await axios.post(
      'https://oauth2.googleapis.com/token',
      {
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        code,
        code_verifier: authData.codeVerifier,
        grant_type: 'authorization_code',
        redirect_uri: REDIRECT_URI,
      }
    );

    // Store the token in our auth store
    authStore.set(readKey, {
      ...authData,
      data: {
        access_token: tokenResponse.data.access_token,
        refresh_token: tokenResponse.data.refresh_token,
        expires_in: tokenResponse.data.expires_in,
      },
    });

    // Show success page
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Authentication</title>
        <style>
          body { font-family: Arial, sans-serif; text-align: center; padding-top: 50px; }
          .success { color: green; }
        </style>
      </head>
      <body>
        <h2 class="success">Authentication Successful!</h2>
        <p>You can close this window and return to Figma.</p>
      </body>
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

  const accessToken = authHeader.split(' ')[1];

  try {
    // Fetch user info from Google
    const userInfoResponse = await axios.get(
      'https://www.googleapis.com/oauth2/v2/userinfo',
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    const userData = {
      name: userInfoResponse.data.name,
      email: userInfoResponse.data.email,
      picture: userInfoResponse.data.picture,
    };

    // Return user data
    res.json(userData);
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
    const tokenResponse = await axios.post(
      'https://oauth2.googleapis.com/token',
      {
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        refresh_token,
        grant_type: 'refresh_token',
      }
    );

    res.json({
      access_token: tokenResponse.data.access_token,
      expires_in: tokenResponse.data.expires_in,
    });
  } catch (error) {
    console.error(
      'Token refresh error:',
      error.response?.data || error.message
    );
    res.status(500).json({ error: 'Failed to refresh access token' });
  }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export default app;
