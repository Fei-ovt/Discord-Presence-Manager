# 24/7 Discord Presence Deployment Guide

This comprehensive guide will help you deploy your Discord Presence application to run 24/7 using Replit and UptimeRobot.

## Step 1: Deploy on Replit

1. Make sure your Discord token is properly set in Replit Secrets
   - Click on the lock icon in the Tools sidebar
   - Verify that the `DISCORD_TOKEN` secret exists and contains your token

2. Run your application on Replit
   - Click the "Run" button at the top of the Replit interface
   - Wait until you see "Discord client initialized successfully" in the console

3. Deploy to Replit's hosting service
   - Click the "Deploy" button at the top of the Replit interface
   - Follow the deployment prompts to create a public URL
   - Your application will be accessible at `https://your-app-name.username.repl.co`

4. Test your deployment
   - Visit your deployed URL in a browser
   - Verify that the application loads and connects to Discord
   - Test the health check endpoint at `https://your-app-name.username.repl.co/api/health`

## Step 2: Setting Up UptimeRobot (With Screenshots)

UptimeRobot is a free service that pings your application every 5 minutes to keep it running 24/7. Follow these detailed steps:

1. Create an UptimeRobot account
   - Go to [UptimeRobot.com](https://uptimerobot.com/)
   - Sign up for a free account or log in

2. Add a new monitor
   - From your dashboard, click the green "Add New Monitor" button
   - A configuration popup will appear

3. Configure your monitor
   - **Monitor Type**: Select "HTTP(s)"
   - **Friendly Name**: Enter "Discord Presence App" (or any name you prefer)
   - **URL/IP**: Enter your Replit deployment URL plus the health check endpoint:
     ```
     https://5b2f0d7c-bce7-4a0e-ba88-041c07291bb0-00-2br1oktguf58m.picard.replit.dev/health
     ```
     If you're using a different Replit deployment, the URL will be in your browser's address bar.
   - **Monitoring Interval**: Select 5 minutes (the default)
   - **Monitor Timeout**: Leave at the default (30 seconds)
   - **HTTP Method**: GET (default)

4. Advanced Options (Optional but Recommended)
   - Click "Show Advanced Options"
   - **Alert When Down**: Set to 1 (to receive alerts immediately)
   - **Alert When Back Up**: Enable this option
   - If you want email notifications, set up your alert contacts

5. Create the monitor
   - Click the "Create Monitor" button
   - You'll see your new monitor in the dashboard list

## Step 3: Verify Everything is Working

1. Verify UptimeRobot is monitoring correctly
   - Wait a few minutes for the first ping to complete
   - Look for a green "UP" status beside your monitor in the dashboard
   - Check the "Response Time" chart to ensure regular pings

2. Verify Discord status remains active
   - Open Discord on another device or ask a friend to check your status
   - Your status should remain as set (online, idle, etc.) even when your computer is off
   - The status should persist indefinitely as long as both Replit and UptimeRobot are working

3. Set up multiple monitors for extra reliability (Optional)
   - Create a second monitor pointing to the root URL:
     ```
     https://5b2f0d7c-bce7-4a0e-ba88-041c07291bb0-00-2br1oktguf58m.picard.replit.dev/
     ```
   - You should also set up a third monitor with the /api/health endpoint:
     ```
     https://5b2f0d7c-bce7-4a0e-ba88-041c07291bb0-00-2br1oktguf58m.picard.replit.dev/api/health
     ```
   - These multiple monitors provide redundancy in case one endpoint has issues

## Step 4: Maintaining Your 24/7 Presence

1. Regular checks
   - Log into UptimeRobot weekly to ensure monitoring is active
   - Check your Discord account periodically to confirm status is maintained

2. Replit sleep prevention
   - UptimeRobot pings prevent your Replit from sleeping due to inactivity
   - If using a free Replit account, be aware of monthly hour limitations
   - For mission-critical 24/7 uptime, consider upgrading to a paid Replit plan

3. Handling updates
   - If you update your application code, redeploy on Replit
   - Test the health check endpoint after any updates
   - Verify UptimeRobot continues to report "UP" status

## Troubleshooting Common Issues

1. **UptimeRobot shows "DOWN" status**
   - Check if your Replit application is running
   - Visit the health check URL directly in your browser
   - Look for error messages in your Replit console
   - Ensure your Discord token is valid and properly set

2. **"Disconnected from server. Reconnecting..." Error**
   - This is normal when closing the Replit environment - the application is trying to reconnect
   - As long as UptimeRobot is monitoring your app, it will keep pinging and wake up the application
   - If you see this message constantly, check if:
     * Your Replit application is properly deployed
     * UptimeRobot is correctly configured with your URL
     * Your Replit account has enough monthly hours remaining

3. **Discord status not staying persistent**
   - Check UptimeRobot logs for any downtime periods
   - Verify the auto-reconnect feature is enabled in your app settings
   - Check your Discord account for any unusual login activity
   - Try setting a different status mode (sometimes changing status can reset connections)

4. **404 Page Not Found Error**
   - If you see "404 Page Not Found" when accessing your URL, it means the application isn't serving HTML correctly
   - Make sure to use the exact URL from your Replit deployment
   - Try accessing the /health endpoint directly: `https://your-app-url/health`
   - If problems persist, redeploy your application in Replit

5. **Replit application errors**
   - Check the Replit console for error messages
   - Ensure your DISCORD_TOKEN is correctly set in Replit Secrets
   - Try restarting and redeploying your application
   - Check Discord's status page for any API outages

## Discord Status Types and What They Look Like

- **Online** (🟢): Green circle indicator - shows you as active
- **Idle** (🟠): Yellow/orange moon indicator - shows you've been inactive
- **Do Not Disturb** (🔴): Red circle with line - shows you don't want to be disturbed
- **Invisible** (⚪): No visible status to others - you appear offline

Your selected status should persist 24/7 as long as both Replit and UptimeRobot are functioning correctly, ensuring your Discord presence remains active even when your computer is off.