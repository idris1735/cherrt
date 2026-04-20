# WhatsApp Business Integration — Setup Guide

> This guide walks through everything needed to connect Chertt to WhatsApp Business via the Meta Cloud API.

---

## Step 1: Create a Meta Developer Account

1. Go to **developers.facebook.com**
2. Click **Get Started** (top right)
3. Log in with your Facebook account (or create one)
4. Accept the developer terms
5. You land on the **Meta Developer Dashboard**

---

## Step 2: Create a Meta App

1. Click **My Apps** (top right) → **Create App**
2. Choose **Business** as the app type → **Next**
3. Fill in:
   - **App name:** `Chertt`
   - **App contact email:** your email
   - **Business account:** click "Create a business account" if you don't have one, or select existing
4. Click **Create App**

---

## Step 3: Add WhatsApp to Your App

1. On the app dashboard, scroll down to find **WhatsApp** in the product list
2. Click **Set up** next to WhatsApp
3. You're now in the **WhatsApp → Getting Started** section

---

## Step 4: Get Your Credentials

On the **WhatsApp → API Setup** page you'll see:

**Temporary access token** — this is your `WHATSAPP_ACCESS_TOKEN`
- Expires in 24 hours (fine for testing)
- Generate a permanent token for production (see Step 12)

**Phone Number ID** — this is your `WHATSAPP_PHONE_NUMBER_ID`
- A 15-digit number — copy it exactly

**Test phone number** — Meta gives you a free test WhatsApp number
- You can send from it to up to 5 registered recipient phones

---

## Step 5: Register Your Phone as a Test Recipient

Still on API Setup:

1. Under **To**, click **Manage phone number list**
2. Click **Add phone number**
3. Enter your personal WhatsApp number with country code (e.g. `+2348012345678`)
4. WhatsApp sends you a verification code
5. Enter the code — your number is now a registered test recipient

---

## Step 6: Add Environment Variables

Open `.env.local` in the project root and add:

```bash
WHATSAPP_ACCESS_TOKEN=paste_your_temporary_token_here
WHATSAPP_PHONE_NUMBER_ID=paste_your_phone_number_id_here
WHATSAPP_VERIFY_TOKEN=chertt-webhook-secret-2026
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

> `.env.local` is gitignored — never commit it.

---

## Step 7: Install ngrok

ngrok creates a public HTTPS URL that tunnels to your local machine. Meta needs a public URL to send messages to.

1. Sign up free at **ngrok.com** → Download → Install
2. Open a terminal and run:
   ```bash
   ngrok http 3000
   ```
3. Copy the `https://...ngrok-free.app` URL from the output

---

## Step 8: Start the Dev Server

In a **separate terminal** (keep ngrok running):

```bash
npm run dev
```

---

## Step 9: Register the Webhook in Meta Dashboard

1. Go to **WhatsApp → Configuration** in your Meta app
2. Under **Webhook**, click **Edit**
3. Fill in:
   - **Callback URL:** `https://[your-ngrok-url]/api/whatsapp/webhook`
   - **Verify token:** `chertt-webhook-secret-2026`
4. Click **Verify and Save** → should show **Verified**
5. Click **Manage** next to Webhook Fields → toggle **messages** ON → **Done**

---

## Step 10: Send a Test Message

From your personal WhatsApp, send a message to the Meta test number:

> *"What is Chertt?"*

You should see a POST request in the dev server terminal, and a reply arrive on your phone.

---

## Step 11: Test the CONFIRM Flow

Send: *"Draft a letter to our fuel vendor about payment extension"*

Expected reply: *"I'll create 'Payment Extension Letter'. Reply CONFIRM to proceed, or CANCEL to stop."*

Reply: `CONFIRM`

Expected: Chertt replies with the document ready + a web link.

---

## Step 12: Deploy to Vercel

1. **Vercel** → Your Project → **Settings** → **Environment Variables**
   Add all 4 variables. For `WHATSAPP_ACCESS_TOKEN`, use a permanent token (see below).
   Set `NEXT_PUBLIC_APP_URL` to your production Vercel URL.

2. Deploy:
   ```bash
   git push origin main
   ```

3. **Update the webhook URL** in Meta:
   - WhatsApp → Configuration → Edit
   - New URL: `https://your-app.vercel.app/api/whatsapp/webhook`
   - Click **Verify and Save**

---

## Generating a Permanent Access Token

The temporary token expires in 24 hours. For production:

1. In Meta Business Settings → **System Users**
2. Create a **System User** with admin role
3. **Add Assets** → select your Chertt app
4. Click **Generate Token** → select the app → check `whatsapp_business_messaging`
5. Copy the token — it doesn't expire

---

## Common Issues

| Problem | Fix |
|---------|-----|
| Webhook verify fails | `WHATSAPP_VERIFY_TOKEN` in `.env.local` must exactly match what you typed in Meta |
| Messages send but no reply arrives | Check dev server terminal for error logs |
| ngrok URL expired | Free tier URLs reset on restart — copy the new URL and update Meta webhook |
| "Phone number not registered" error | Add your number to the test recipients list in API Setup |
| Token expired | Regenerate temp token in API Setup, or use permanent system user token |
