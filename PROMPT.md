# Prompt for the assistant

## Figma Plugin Authentication with Google OAuth

I'm coding a plugin for Figma. My plugin is supposed to work well both with Figma's web app and Electron app.

My plugin needs to authenticate the user at startup using Google OAuth. I have a back-end server component that will handle the OAuth flow.

The server's public URL is already registered with Google at https://auth.demidoff.me and I have OAuth credentials. The plugin needs to access user data such as the user's name, email, and picture.

The Figma plugin will use the OAuth flow based on PKCE to authenticate users and obtain an access token. The access token will be used to fetch user data from the Google API.

The Figma plugin will need to handle the OAuth flow, including redirecting the user to the Google login page, receiving the authorization code, and exchanging it for an access token. The access token will be used to fetch user data from the Google API.

Figma docs feature a development guide dedicated to auth - https://www.figma.com/plugin-docs/oauth-with-plugins/.

Can you suggest the implementation of authentication for my Figma plugin given the following requirements:

- Google OAuth must be used as authentication provider
- the auth flow must be based on PKCE
- the plugin has to work well with Figma's web app and the Electron app
- follow the Figma OAuth development guide to implement authentication
