# FROXY ASSISTANT — EXTRA MARGE BUSINESS BOT

A professional WhatsApp business assistant for the configured owner account. It includes branded replies using `logo.png`, business enquiries, lead tracking, opt-in-only broadcasts, group moderation, and PDF invoices.

## What is included

- Every standard bot response is branded with **FROXY ASSISTANT** and the provided Froxy Tech logo.
- The QR session is checked against `OWNER_NUMBER` on connection. A different WhatsApp account is logged out rather than allowed to operate the bot.
- Business enquiries cover the catalog, pricing, payment details, and Dubai import information.
- Lead records are stored in `data/leads.json`.
- Broadcasts go only to contacts who explicitly reply `SUBSCRIBE` or `START`; `STOP` and `UNSUBSCRIBE` opt them out. Each run is limited to 100 contacts and paced.
- Owner-only group tools include tag-all, hide-tag, open/close, promote/demote/kick, invite link, group info, welcome, goodbye and anti-link.
- `.invoice <phone> <amount> <description>` generates a PDF invoice with the logo and sends it to the specified WhatsApp contact.
- Session and data folders are created recursively before the bot starts, to avoid the prior missing-folder `ENOENT` issue.

## Requirements

- Node.js 20 or later.
- A host that supports long-running Node.js processes and WebSocket connections.
- Persistent storage for the session folder if the hosting platform supports volumes. If the host deletes files when it redeploys, you may need to link the WhatsApp account again.

Baileys is an unofficial WhatsApp Web integration, not the official WhatsApp Business Platform. Use responsibly and understand that WhatsApp can change behavior or restrict automated sessions.

## Deploy

1. Upload the project files to your GitHub repository, including `index.js`, `package.json`, `logo.png`, and the `data` folder.
2. Set the runtime to **Node.js 20 or later**.
3. Set the build/install command to `npm install`.
4. Set the start command to `npm start` (or `node index.js`).
5. Add these environment variables in your host:
   - `OWNER_NUMBER` = `263712552662` (digits only)
   - `BUSINESS_NAME` = `FXT SOLUTIONS`
   - `GROUP_LINK` = your WhatsApp support group link
   - `ECOCASH_NUMBER` = your EcoCash business number
   - `INNBUCKS_NUMBER` = your InnBucks business number
   - `BOT_PRICE` = `$5`
   - `LAB_PRICE` = `$10`
   - `COMBO_PRICE` = `$12`
6. Deploy and open the runtime logs. Scan the QR only using the WhatsApp account whose number is `263712552662`. The bot checks the account number after linking.
7. Wait for the log line `FROXY ASSISTANT ONLINE — owner account +263712552662 verified.`
8. Keep `data/session_froxy_assistant` on persistent storage. Do not upload session credentials to a public repository.

## Host environment notes

If your host lets you set a writable persistent path, set `DATA_DIR` to that path. The app creates the session directory and JSON files recursively. Example: `DATA_DIR=/app/data`, but only use this exact path if your hosting provider makes it writable and persistent.

## Owner commands

Commands are owner-only. In groups, the bot must itself be a group admin for actions such as changing group permissions, deleting messages, and modifying members.

- `.menu`
- `.leads` or `.leads all`
- `.stats`
- `.leadclose 2637xxxxxx` / `.leadopen 2637xxxxxx`
- `.catalog 2637xxxxxx` / `.price 2637xxxxxx` / `.pay 2637xxxxxx`
- `.invoice 263712345678 5 Website design`
- `.broadcast Your business update` — sends only to opted-in contacts
- `.tagall message`, `.hidetag message`, `.open`, `.close`, `.promote @user`, `.demote @user`, `.kick @user`, `.link`, `.groupinfo`
- `.welcome on/off`, `.goodbye on/off`, `.antilink on/off`
- `.lock`

There are no entertainment or fun commands. `.pair`, `.qr`, and `.setowner` are disabled as bot commands. Initial linking still requires scanning the deployment QR, but the bot rejects a session that reports a different phone number.

## Notes

- To opt into broadcast updates, a contact must send `SUBSCRIBE` or `START`. They can opt out with `STOP` or `UNSUBSCRIBE`.
- Invoice PDFs are saved in `invoices/` on the host.
- The supplied logo is saved as `logo.png`; keep it beside `index.js`.
- The host must preserve writable storage for session state, leads, settings, and invoices. If files are ephemeral, session state and records may be lost after a restart/redeploy.
