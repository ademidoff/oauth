I'm coding a plugin for Figma. My plugin must work well both with Figma's web app and Electron app.

My plugin needs to authenticate the user at startup using Google OAuth. I have a back-end server component that will handle the OAuth flow.

The server's public URL is already registered with Google at https://auth.demidoff.me and I have OAuth credentials. 

The Figma plugin will use the OAuth flow based on PKCE to authenticate the user and obtain an access token. The access token will be used to fetch user data from the Google API. The plugin needs to access user data such as the user's name, email, and picture.

The Figma plugin has to handle the OAuth flow, including redirecting the user to the Google login page, receiving the authorization code, and exchanging it for an access token.

Figma docs feature a development guide dedicated to authentication in Figma apps - https://www.figma.com/plugin-docs/oauth-with-plugins/.

The implementation of authentication for my Figma plugin must take into consideration the following requirements:

- Google OAuth must be used as authentication provider
- follow the Figma OAuth development guide to implement authentication
- the plugin must be able to handle the OAuth flow, including redirecting the user to the Google login page, receiving the authorization code, and exchanging it for an access token
- the plugin must be able to handle errors and provide feedback to the user
- the plugin must be able to store the access token securely
- the plugin must be able to refresh the access token when it expires
- the plugin must be able to log out the user and clear the access token
