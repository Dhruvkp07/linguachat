# LinguaChat

A small multilingual 1-to-1 chat app. Users sign in with Google, pick a unique
username and a preferred language, find friends by username or email, and see
incoming messages, photos, and videos automatically translated into their own
language.

## Architecture

- Static frontend: plain HTML/CSS/JavaScript
- Auth/database/realtime/file storage: Supabase
- Translation: Supabase Edge Function + Gemini 2.5 Flash-Lite
- Hosting: any static host. Render Static Site is used in the deployment guide below.

## Features

- Google OAuth login
- Unique, searchable `@username` for every user (auto-suggested at signup, like Instagram/Messenger handles) — you can also start a chat by email
- 1-to-1 conversations
- Realtime message delivery
- Original text + translated text stored separately, so each person always reads in their own language
- "Show original" for translated messages
- Same-language conversations bypass translation
- Photo and video sharing, with optional captions that are translated the same way as text messages
- Supabase Row Level Security for conversations, messages, and shared media

## How the translation works

Every user sets one "preferred language" in their profile. When you send a
message (or a caption on a photo/video), the app translates it from your
language into your chat partner's language *before* saving it, and stores
both versions. Each side of the conversation always sees the message in their
own language, with a "Show original" toggle to see what was actually typed.

Example: you write in English, your friend's profile is set to Persian. You
type in English → they see it in Persian. They reply in Persian → you see it
in English.

## 1. Create Supabase project

Create a free project at https://database.new

The current Supabase Free plan includes Postgres, Auth, Realtime, Storage and
500 MB database storage, subject to its published limits. See:
https://supabase.com/pricing

## 2. Create database tables, policies, and the media bucket

In Supabase Dashboard -> SQL Editor, paste the full contents of:

`supabase/schema.sql`

Run it. This script is safe to re-run — it creates the `profiles`,
`conversations`, `conversation_members`, and `messages` tables (with the
`username`, `message_type`, `media_url`, and `media_mime_type` columns),
enables Row Level Security with the right policies, and creates a public
`chat-media` storage bucket for photo/video uploads. If you already ran an
older version of this schema, running the updated script will just add the
missing columns/policies.

## 3. Configure Google login

In Supabase Dashboard -> Authentication -> Providers -> Google, enable Google.

In Google Cloud Console / Google Auth Platform:

1. Create or select a project.
2. Configure the OAuth consent / branding screens.
3. Create an OAuth Client ID of type Web application.
4. Add your local frontend origin, e.g. `http://localhost:5500`, to Authorized JavaScript origins.
5. Add the Supabase callback URL shown in Supabase's Google provider settings to Authorized redirect URIs.
6. Paste the Google Client ID and Client Secret into Supabase's Google provider settings.

After the app is deployed, add the deployed site origin to the Google Authorized JavaScript origins and Supabase Auth redirect allow-list.

Supabase's official Google OAuth guide is here:
https://supabase.com/docs/guides/auth/social-login/auth-google

## 4. Create Gemini API key

Create a key in Google AI Studio: https://aistudio.google.com/app/apikey

The Edge Function expects the secret to be named:

`GEMINI_API_KEY`

Gemini 2.5 Flash-Lite currently has a free tier for text input/output, subject to Google's rate limits and eligibility rules. Check current quota status in Google AI Studio before treating it as unlimited.

## 5. Deploy the Edge Function

Install Supabase CLI if needed, then from this project folder:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase secrets set GEMINI_API_KEY=YOUR_GEMINI_KEY
supabase functions deploy translate --use-api
```

The deployed function URL will be:

`https://YOUR_PROJECT_REF.supabase.co/functions/v1/translate`

You do NOT put the Gemini key in `app.js`.

## 6. Configure the frontend

Open `app.js` and replace:

```js
const SUPABASE_URL = "YOUR_SUPABASE_URL";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_PUBLISHABLE_KEY";
```

with the values from Supabase Dashboard -> Project Settings -> API.

Use the publishable/anon browser key, never the service-role key.

## 7. Run locally

Because the frontend is static, a small local server is enough.

Python:

```bash
python -m http.server 5500
```

Then open:

`http://localhost:5500`

Do not open `index.html` directly as a `file://` URL.

## 8. Deploy the frontend for free

### Render Static Site

1. Push this folder to GitHub.
2. Create an account on Render.
3. New -> Static Site.
4. Connect the GitHub repository.
5. Build command: leave blank.
6. Publish directory: `.`
7. Deploy.

Render currently documents free static sites and free web services. Free web services can sleep after inactivity, but a static site does not need that server-side behavior.

## 9. Production OAuth URLs

Once Render gives you a URL such as:

`https://linguachat-xxxx.onrender.com`

Add that exact origin in Google OAuth Authorized JavaScript origins.

In Supabase Dashboard -> Authentication -> URL Configuration, set the Site URL to the same origin and add the origin to the Redirect URLs.

## 10. Important security notes

- Keep the Gemini key only in Supabase secrets.
- Never commit a service-role key.
- The free MVP intentionally allows authenticated users to search profiles by exact email or by username. For a larger public product, consider friend requests or invite links in addition.
- Usernames are unique (case-insensitive) and limited to letters, numbers, and underscores, 3-20 characters, enforced both client-side and by a database constraint.
- Shared photos/videos are stored in a **public** Supabase Storage bucket (`chat-media`) so both chat partners can load them without extra auth plumbing. Files get long, random names, but anyone who obtains a file's URL could view it — do not use this for sensitive content. A production version should switch to signed URLs with short expiry.
- Translation (and any captions on shared media) is not end-to-end encrypted because the text is sent to the translation model. Do not market this as E2EE.
- Add rate limiting, file-size/type validation on the server side, and other abuse controls before public launch. The frontend currently caps uploads at 25 MB and restricts to image/video MIME types, but that check happens in the browser and is not a security boundary by itself.

## Troubleshooting

### Google redirect error

Check that both Google and Supabase contain the correct production origin and Supabase callback URL.

### Translation error

Check Supabase -> Edge Functions -> translate -> Logs and verify `GEMINI_API_KEY` is set.

### Messages don't appear live

In Supabase, confirm `messages` is included in the `supabase_realtime` publication and that the SQL setup ran successfully. `schema.sql` does this for you, but if it was already added it's a no-op.

### Photo/video upload fails

Confirm the `chat-media` bucket exists (Supabase Dashboard -> Storage) and that the storage policies from `schema.sql` ran without error. Also check the file is under 25 MB and is an image or video type.

### Username taken / can't save profile

Usernames are globally unique and case-insensitive. If your suggested username is taken, edit the field — the app checks availability as you type.

### Free-tier limits

Supabase, Render, and Gemini publish usage limits that can change. Check their official pricing/limits pages before putting real users on the app.
