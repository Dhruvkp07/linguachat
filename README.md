# LinguaChat 🌐💬
deploy link : https://linguachat-08g0.onrender.com

LinguaChat is a real-time 1-to-1 chat application designed to make communication easier between people who speak different languages.

Users can chat in real time, share media, and get messages translated using Gemini. The application uses Supabase for authentication, database, realtime communication, and storage.

## 🚀 Features

* 🔐 User authentication
* 🔑 Google OAuth login
* 💬 Real-time 1-to-1 messaging
* 🌐 Multilingual message translation
* 🤖 AI-powered translation using Gemini API
* 📝 Display original and translated messages
* 🖼️ Image and file sharing
* ⚡ Real-time message updates
* 🔒 Row Level Security (RLS)
* ☁️ Cloud-based database and storage
* 📱 Simple and responsive chat interface

## 🛠️ Tech Stack

| Technology        | Purpose                |
| ----------------- | ---------------------- |
| HTML              | Application structure  |
| CSS               | UI styling             |
| JavaScript        | Frontend logic         |
| Supabase          | Backend services       |
| PostgreSQL        | Database               |
| Supabase Realtime | Real-time messaging    |
| Supabase Storage  | Media/file storage     |
| Supabase Auth     | Authentication         |
| Google OAuth      | Social authentication  |
| Gemini API        | AI-powered translation |
| Render            | Deployment             |

## 🏗️ How It Works

The basic message flow is:

```text
User
  │
  ▼
LinguaChat Frontend
  │
  ├── Authentication ──────► Supabase Auth
  │
  ├── Send Message ────────► Supabase
  │                              │
  │                              ▼
  │                         PostgreSQL
  │
  ├── Media Upload ────────► Supabase Storage
  │
  └── Translation ──────────► Gemini API
                                  │
                                  ▼
                            Translated Text
```

When a user sends a message, the application stores the message and uses the translation service to generate the translated version. Supabase Realtime allows the chat interface to receive new messages without manually refreshing the page.

## 🔐 Security

LinguaChat uses Supabase Row Level Security (RLS) to control access to database records.

Sensitive API credentials should **not** be exposed in frontend JavaScript.

For example:

```env
GEMINI_API_KEY=your_api_key
```

Secrets used by backend/Edge Function logic should be stored securely using Supabase secrets rather than committed to GitHub.

> Never commit API keys, passwords, service-role keys, or other credentials to the repository.

## ⚙️ Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/dhruvkp07/linguachat.git
cd linguachat
```

### 2. Configure Supabase

Create a Supabase project and configure:

* Authentication
* Google OAuth
* PostgreSQL database
* Realtime
* Storage
* Required Row Level Security policies

### 3. Configure Gemini

Create a Gemini API key and store it securely in the appropriate Supabase environment/secrets configuration.

Do not put the API key directly inside frontend JavaScript.

### 4. Configure the frontend

Update the Supabase configuration used by the application with your own project credentials.

### 5. Run the application

Since the frontend is built with HTML, CSS, and JavaScript, it can be served using any local static server.

For example:

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

## 📂 Project Structure

```text
linguachat/
│
├── index.html
├── style.css
├── script.js
├── assets/
│   └── ...
│
├── README.md
└── .gitignore
```

The exact structure may vary depending on the current version of the project.

## 🌍 Deployment

LinguaChat can be deployed as a static frontend using **Render**, while Supabase provides the backend infrastructure.

The application uses:

```text
Frontend
   │
   ▼
Render
   │
   ▼
Supabase
 ┌───────────────┐
 │ Authentication│
 │ PostgreSQL    │
 │ Realtime      │
 │ Storage       │
 └───────────────┘
        │
        ▼
   Gemini API
```

## 🔮 Future Improvements

Possible improvements include:

* Group conversations
* Voice messages
* Voice translation
* More advanced language detection
* Message editing and deletion
* Typing indicators
* Online/offline presence
* Read receipts
* Improved mobile UI
* Conversation search
* Translation history

## 📸 Screenshots

Add screenshots of the application here.

```text
screenshots/
├── login.png
├── chat.png
├── translation.png
└── profile.png
```

## 📄 License

This project is available for educational and personal use.

---

**Built with HTML, CSS, JavaScript, Supabase and Gemini.**
