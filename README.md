# OAuth Server for Figma plugin and web authentication

This server handles the OAuth2 flow using Google as an Identity Provider (IdP). 

It includes endpoints for the callback, token exchange, and token refresh.

The server is configured to allow CORS requests from Figma domains. This is important for the authentication to work correctly.

## Components

- express.js as a web server framework
- cookie-parser for handling cookies
- dotenv for environment variable management

## How to run

The server-side code is written in JavaScript using the [NextJS](https://nextjs.org) framework.

It is already deployed on Vercel at [auth.demidoff.me](https://auth.demidoff.me).

The plugin code is written in TypeScript and uses the Figma Plugin API. Both have been tested with Figma desktop app version 125.5.6.

Below are the steps to test the POC and check how OAuth works.

1. Install npm dependencies:
   ```bash
   npm install
   ```

2. Create a `.env` file based on the `.env.example` file and fill in the required values (ask for credentials from the code owner).

3. Build the figma plugin:
   ```bash
   npm run build
   ```

4. Open the Figma desktop app and load the plugin:
   - Open an arbitrary Figma project.
   - Go to the "Plugins" menu.
   - Select "Development" > "Import plugins from manifest...".
   - From the file browser open the `manifest.json` file from the `plugin` directory in this project.
   - The plugin will open a UI that allows you to authenticate with Google.
   - Once you authenticate, the plugin will display your name taken from the Google profile.

Note, this assumes you have the Figma desktop app installed, as the plugin cannot be run in the browser.


## Porting the POC to your own server (or Deployment Instructions)

In case you want to deploy the PoC on the infrastructure you control, you'll have to follow these steps:

### Server Deployment

- get registered with Vercel, if you don't have an account yet
- install the Vercel CLI if you want to deploy from the command line (optional)
- clone this repository to your own GitHub account
- create a new project on Vercel
- connect your Vercel project with the GitHub repository you just cloned
- set up the [environment variables](/img/VERCEL_ENVIRONMENT_VARIABLES.png) on Vercel based on the `.env.example` file
- configure the [domain settings](/img/VERCEL_DOMAIN_CONFIGURATION.png) to point to your domain (if you have one), which matches the `SITE_URL` environment variable
- deploy the project (Vercel will automatically deploy on every push to the main branch)

### Set up a Google OAuth Web Application

- Go to the [Google Cloud Console](https://console.cloud.google.com/).
- Create a new project or select an existing one.
- Navigate to "APIs & Services" > "Credentials".
- Click on "Create Credentials" and select "OAuth 2.0 Client IDs".
- Configure the consent screen with the necessary information.
- Set the application type to "Web application".
- Add the following authorized JavaScript origins:
   - `https://<your-domain>`
   - `http://localhost:3000` (for local development)
- Add the following authorized redirect URIs:
   - `https://<your-domain>/auth/callback`
   - `http://localhost:3000/auth/callback` (for local development)
- Save the credentials and copy the `Client ID` and `Client Secret`.


## Porting this Proof of Concept to a production-ready server (aka TODO)

This PoC is meant to be integrated with Rewordly (or Rewordy), which is project at https://github.com/khkseniaa/rewordly. This integration is supposed to be done in a production-ready manner, which means the following should be done:

- Implement proper error handling and server-side logging.
- Use a database to store user sessions and tokens.
- Add minimal tests to ensure the server works as expected.

### The Auth Server

This part of the code is responsible for handling the OAuth2 flow only. It is completely stateless and does not store any user data. It is meant to be used as a standalone service that can be integrated with other applications, such as the Figma plugin or a web application.

### The Figma Plugin
The [Figma plugin](https://github.com/khkseniaa/rewordly/tree/main/figma) is responsible for interacting with the user and displaying the authentication UI. It uses the Figma Plugin API to create a UI that allows the user to authenticate with Google. Once the user is authenticated, the plugin retrieves the user's name from the Google profile and uses it to display a welcome message. The plugin store the access token in the browser's local storage, which can be used to make authenticated requests to the server. The server extracts the user ID from the access token and uses it to identify the user in the system. Every single database record created by the user is associated with a user ID, which allows the server to retrieve records created by the user later.

### Porting the Figma Plugin to a production-ready state
The [plugin code](/plugin/code.ts) from this PoC has to be integrated with the plugin code from the [Rewordly project](https://github.com/khkseniaa/rewordly/tree/main/figma). The user should be able to authenticate with Google and use the plugin to create and manage their records. 

### Extending the PoC to support the web application
The [Rewordly project](https://github.com/khkseniaa/rewordly) also includes a web application that allows users to work with their records. Unlike the Figma app, the web app does not support the interaction with Figma assets. 

The web application should be able to use the same authentication flow as the Figma plugin, which means it should be able to authenticate users with Google and retrieve their access token. The web application should also be able to make authenticated requests to the server using the access token.
