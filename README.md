# Trend Vision One AI Guard Demo

A middleware application that demonstrates integrating **Trend Vision One AI Guard** with **WhatsApp** and **Google Gemini LLM**. It provides a security layer to inspect and block malicious or inappropriate prompts before they reach the LLM.

## 🚀 Features

- **WhatsApp Integration**: Turn any WhatsApp account into a secured AI bot.
- **Trend Vision One AI Guard**: Real-time security scanning for PII, prompt injection, and toxic content.
- **Web Dashboard**: Monitor real-time logs, audit trails, and toggle security settings.
- **Gemini LLM**: Powered by Google's latest generative models.
- **Audit Logging**: Local persistence of all security decisions and interactions.

## 📁 Folder Structure

```text
.
├── src/
│   ├── index.js           # Express + WhatsApp + Socket.io entry point
│   ├── config.js          # Configuration management
│   ├── services/
│   │   ├── llm.js         # Gemini LLM integration service
│   │   ├── logger.js      # Audit logging utility
│   │   └── trend-guard.js # Trend Vision One AI Guard API integration
│   └── audit.log          # Local persistency for audit logs
├── public/                # Frontend web dashboard files
├── auth_session/          # WhatsApp multi-device session storage
├── .env                   # Environment variables (Secrets)
├── .env_example           # Template for environment setup
└── package.json           # Node.js dependencies and scripts
```

## 🛠️ Prerequisites

- Node.js (v18+)
- A Trend Vision One Account with [AI Guard API](https://docs.trendmicro.com/en-us/documentation/article/trend-vision-one-ai-guard-api-reference) access.
- A Google AI Studio API Key ([Gemini](https://aistudio.google.com/)).
- A WhatsApp account to use for the bot.

## ⚙️ Setup

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Configure Environment**:
   Copy `.env_example` to `.env` and fill in your credentials:
   ```bash
   cp .env_example .env
   ```
   Required variables:
   - `GEMINI_API_KEY`: Your Google Gemini API key.
   - `V1_API_KEY`: Your Trend Vision One API key.
   - `V1_BASE_URL`: The region-specific API endpoint for Trend Vision One.
   - `WHATSAPP_ALLOW_LIST`: (Optional) Comma-separated phone numbers that can interact with the bot.

3. **Start the Application**:
   ```bash
   npm start
   ```

## 📖 Usage

### Web Interface
Access the dashboard at `http://localhost:3000`. This allows you to:
- Scan the WhatsApp QR code to link the bot.
- Chat directly with the secured AI.
- Toggle **AI Guard** on/off.
- View real-time security logs and LLM responses.

### WhatsApp Bot
Once linked, the bot will respond to messages from allowed users:
- **Normal Chatting**: Send any prompt, and it will be processed through AI Guard and then Gemini.
- **Commands**:
  - `/guard on`: Enables security filtering via Trend Vision One.
  - `/guard off`: Disables security filtering (Bypass mode).

## 🛡️ Security
This project uses **Trend Vision One AI Guard** to check for:
- **Prompt Injection**: Detecting attempts to jailbreak the LLM.
- **PII Leakage**: Blocking sensitive personal information.
- **Toxicity**: Filtering out harmful or inappropriate language.
