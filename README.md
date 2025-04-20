# OAuth Server for Figma authentication

This server handles the OAuth2 flow for Google authentication. 

It includes endpoints for the callback, token exchange, and token refresh.

The server uses Express.js and Axios for HTTP requests.

It also uses dotenv for environment variable management.

Make sure to set the environment variables in a .env file:

- GOOGLE_CLIENT_ID=your_google_client_id
- GOOGLE_CLIENT_SECRET=your_google_client_secret
- SITE_URL=your_site_url (e.g., http://localhost:3000)

The server is configured to allow CORS requests from Figma domains. This is important for the authentication flow to work correctly.
