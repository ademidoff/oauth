// Backend server (Node.js with Express) - server.js
import express, { json, urlencoded } from 'express';
import axios from 'axios';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();

// Enable CORS for Figma domains
app.use(
  cors({
    origin: [
      'https://www.figma.com',
      'https://figma.com',
      'https://www.figma.com/file/*',
      // Add the desktop app origin if needed
      'figma:*',
    ],
    credentials: true,
  })
);

app.use(json());
app.use(urlencoded({ extended: true }));

app.get('/', async (req, res) => {
  res.status(401).send('Unauthorized');
});

// Callback endpoint
app.get('/auth/callback', async (req, res) => {
  const { code, state } = req.query;

  if (!code) {
    return res.status(400).send('Authorization code missing');
  }

  // Return an HTML page that will request the code_verifier and complete the auth
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Authentication</title>
      <style>
        body { font-family: sans-serif; text-align: center; margin-top: 50px; }
      </style>
    </head>
    <body>
      <h3>Completing authentication...</h3>
      
      <script>
        // Request the code_verifier from the opener window
        window.opener.postMessage({ type: 'requestCodeVerifier' }, '*');
        
        // Listen for the response with the code_verifier
        window.addEventListener('message', async function(event) {
          // Make sure the message is from our plugin
          if (event.data.type === 'codeVerifierFromPlugin') {
            const codeVerifier = event.data.codeVerifier;
            
            try {
              // Send the code and code_verifier to our backend
              const response = await fetch('/auth/token-exchange', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  code: '${code}',
                  state: '${state}',
                  code_verifier: codeVerifier
                })
              });
              
              if (!response.ok) {
                throw new Error('Token exchange failed');
              }
              
              const data = await response.json();
              
              // Send the authentication data back to opener
              window.opener.postMessage({
                type: 'authComplete',
                token: data.access_token,
                user: data.user
              }, '*');
              
              document.body.innerHTML = '<h3>Authentication successful! You can close this window.</h3>';
            } catch (error) {
              console.error('Authentication error:', error);
              document.body.innerHTML = '<h3>Authentication failed. Please try again.</h3>';
            }
          }
        });
      </script>
    </body>
    </html>
  `);
});

// Token exchange endpoint
app.post('/auth/token-exchange', async (req, res) => {
  const { code, code_verifier } = req.body;

  if (!code || !code_verifier) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  try {
    // Exchange code for tokens using the code_verifier
    const tokenResponse = await axios.post(
      'https://oauth2.googleapis.com/token',
      {
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: `${process.env.SITE_URL}/auth/callback`,
        grant_type: 'authorization_code',
        code_verifier,
      }
    );

    const { access_token, id_token, refresh_token } = tokenResponse.data;

    // Get user info
    const userInfoResponse = await axios.get(
      'https://www.googleapis.com/oauth2/v3/userinfo',
      {
        headers: { Authorization: `Bearer ${access_token}` },
      }
    );

    // Extract user data
    const user = {
      id: userInfoResponse.data.sub,
      name: userInfoResponse.data.name,
      email: userInfoResponse.data.email,
      picture: userInfoResponse.data.picture,
    };

    // You might want to store the refresh_token in your database
    // associated with this user for later token refresh operations

    // Return the access token and user info
    res.json({
      access_token,
      user,
    });
  } catch (error) {
    console.error(
      'Token exchange error:',
      error.response?.data || error.message
    );
    res.status(500).json({ error: 'Authentication failed' });
  }
});

// Token refresh endpoint (for when access tokens expire)
app.post('/auth/refresh-token', async (req, res) => {
  const { refresh_token } = req.body;

  if (!refresh_token) {
    return res.status(400).json({ error: 'Refresh token is required' });
  }

  try {
    const response = await axios.post('https://oauth2.googleapis.com/token', {
      refresh_token,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      grant_type: 'refresh_token',
    });

    res.json({
      access_token: response.data.access_token,
      expires_in: response.data.expires_in,
    });
  } catch (error) {
    console.error(
      'Token refresh error:',
      error.response?.data || error.message
    );
    res.status(500).json({ error: 'Token refresh failed' });
  }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export default app;
