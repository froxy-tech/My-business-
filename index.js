'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const P = require('pino');
const qrcode = require('qrcode-terminal');
const PDFDocument = require('pdfkit');
const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');

const ROOT = __dirname;
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
const SESSION_DIR = path.join(DATA_DIR, 'session_froxy_assistant');
const LEADS_FILE = path.join(DATA_DIR, 'leads.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const INVOICES_DIR = path.resolve(process.env.INVOICES_DIR || path.join(ROOT, 'invoices'));
const LOGO_FILE = path.join(ROOT, 'logo.png');

// Create parent folders recursively before Baileys attempts to use the session directory.
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(SESSION_DIR, { recursive: true });
fs.mkdirSync(INVOICES_DIR, { recursive: true });

function digits(value) {
  return String(value || '').replace(/\D/g, '');
}

const OWNER_NUMBER = digits(process.env.OWNER_NUMBER || '263712552662');
const GROUP_LINK = process.env.GROUP_LINK || 'https://chat.whatsapp.com/GcVgHuHQIe3AYr0FP0EeyP?s=cl&p=a&mlu=4&ilr=4';
const BUSINESS_NAME = process.env.BUSINESS_NAME || 'FXT SOLUTIONS';
const ECOCASH_NUMBER = process.env.ECOCASH_NUMBER || OWNER_NUMBER;
const INNBUCKS_NUMBER = process.env.INNBUCKS_NUMBER || OWNER_NUMBER;
const BOT_PRICE = process.env.BOT_PRICE || '$5';
const LAB_PRICE = process.env.LAB_PRICE || '$10';
const COMBO_PRICE = process.env.COMBO_PRICE || '$12';
const LOG_LEVEL = process.env.LOG_LEVEL || 'silent';

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, JSON.stringify(fallback, null, 2));
      return fallback;
    }
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return parsed ?? fallback;
  } catch (error) {
    console.error(`Could not read ${path.basename(file)}; using defaults.`, error.message);
    return fallback;
  }
}

let leads = readJson(LEADS_FILE, []);
if (!Array.isArray(leads)) leads = [];
let settings = readJson(SETTINGS_FILE, { chats: {}, groups: {} });
if (!settings || typeof settings !== 'object' || Array.isArray(settings)) settings = { chats: {}, groups: {} };
settings.chats ||= {};
settings.groups ||= {};

function saveLeads() {
  fs.writeFileSync(LEADS_FILE, JSON.stringify(leads, null, 2));
}
function saveSettings() {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}
function numberFromJid(jid) {
  if (!jid) return '';
  return digits(String(jid).split('@')[0].split(':')[0]);
}
function isOwnerJid(jid) {
  return numberFromJid(jid) === OWNER_NUMBER;
}
function ownerLabel() {
  return `+${OWNER_NUMBER}`;
}

function brandedText(message) {
  const support = GROUP_LINK ? `Support group: ${GROUP_LINK}` : `Owner: ${ownerLabel()}`;
  return [
    '╭━━━〘 FROXY ASSISTANT 〙━━━╮',
    `┃ ${BUSINESS_NAME} · BUSINESS & GROUPS`,
    '╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
    '',
    String(message || '').trim(),
    '',
    `Owner: ${ownerLabel()}`,
    support
  ].join('\n').trim();
}

function brandedHeaderOnly() {
  return brandedText('Professional business operations · Secure owner controls');
}

async function sendFroxy(sock, to, message, extra = {}) {
  const caption = brandedText(message);
  const logoExists = fs.existsSync(LOGO_FILE);
  if (logoExists) {
    const image = fs.readFileSync(LOGO_FILE);
    // WhatsApp image captions have a practical length limit. For long menus, send
    // a branded logo header first, then the complete branded text as a second message.
    if (caption.length <= 900) {
      return sock.sendMessage(to, { image, caption, ...extra });
    }
    await sock.sendMessage(to, { image, caption: brandedHeaderOnly() });
    return sock.sendMessage(to, { text: caption, ...extra });
  }
  console.warn('logo.png is missing; messages will be branded text-only until it is restored.');
  return sock.sendMessage(to, { text: caption, ...extra });
}

function inferInterest(message) {
  const text = String(message || '').toLowerCase();
  if (/dubai|import|uae|shipping/.test(text)) return 'Dubai Import';
  if (/payment|pay|ecocash|innbucks|zipit|usdt/.test(text)) return 'Payment';
  if (/lab|cyber|website|design|bot|catalog|price|cost/.test(text)) return 'Bot / Cyber Lab';
  return 'General';
}

function getOrCreateLead(jid, message) {
  const phone = numberFromJid(jid) || jid;
  let lead = leads.find(item => item.jid === jid || (item.number === phone && item.jid === jid));
  if (!lead) {
    lead = {
      jid,
      number: phone,
      firstSeenAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      message: '',
      interest: inferInterest(message),
      status: 'NEW',
      optedIn: false
    };
    leads.push(lead);
  }
  lead.lastSeenAt = new Date().toISOString();
  lead.message = String(message || '').slice(0, 500);
  lead.interest = inferInterest(message);
  saveLeads();
  return lead;
}

function catalogText() {
  return `💼 ${BUSINESS_NAME} · SERVICE CATALOG\n\n🤖 FROXY BOT MINI V3 — ${BOT_PRICE}\n• Business replies and owner-only controls\n• Group welcome, anti-link and member tools\n• Deployment guidance\n\n🕵️ FROXY CYBER LAB V3 — ${LAB_PRICE}\n• 12 tools + AI hub\n• Professional purple interface\n\n📦 COMBO (BOT + LAB) — ${COMBO_PRICE}\n\n🌍 DUBAI IMPORTS\n• Electronics, phones and clothing\n• Typical shipping estimate: 7–12 days\n• 50% deposit stated for orders\n\nReply BOT, LAB, PRICE, PAY or DUBAI for details.`;
}

function paymentText() {
  return `💳 ${BUSINESS_NAME} · PAYMENT DETAILS\n\nEcoCash: ${ECOCASH_NUMBER}\nInnBucks: ${INNBUCKS_NUMBER}\nZipit / USDT TRC20: Contact the owner for current details\n\nAfter paying, send proof and state the product (Bot, Lab or Combo). Please wait for the owner to confirm payment before treating an order as complete.`;
}

function welcomeText() {
  return `👋 Welcome to ${BUSINESS_NAME}.\n\nI’m Froxy Assistant, the professional business and group manager.\n\n${catalogText()}\n\nFor updates, reply SUBSCRIBE. Reply STOP at any time to opt out.`;
}

function groupConfig(groupJid) {
  settings.groups[groupJid] ||= { welcome: false, goodbye: false, antilink: false };
  return settings.groups[groupJid];
}

function extractText(message) {
  if (!message) return '';
  let msg = message;
  for (let i = 0; i < 5; i++) {
    if (msg.ephemeralMessage?.message) msg = msg.ephemeralMessage.message;
    else if (msg.viewOnceMessage?.message) msg = msg.viewOnceMessage.message;
    else if (msg.viewOnceMessageV2?.message) msg = msg.viewOnceMessageV2.message;
    else if (msg.documentWithCaptionMessage?.message) msg = msg.documentWithCaptionMessage.message;
    else break;
  }
  return String(
    msg.conversation ||
    msg.extendedTextMessage?.text ||
    msg.imageMessage?.caption ||
    msg.videoMessage?.caption ||
    msg.documentMessage?.caption ||
    msg.buttonsResponseMessage?.selectedDisplayText ||
    msg.listResponseMessage?.title ||
    msg.templateButtonReplyMessage?.selectedDisplayText ||
    ''
  ).trim();
}

function buildConnectedText(accountNumber) {
  return `✅ FROXY ASSISTANT CONNECTED\n\nBusiness: ${BUSINESS_NAME}\nAccount verified: ${accountNumber}\nOwner lock: ACTIVE 🔒\nBusiness replies: READY\nLead capture: READY\nOpt-in broadcasts: READY\nGroup tools: READY\nPDF invoices: READY\nPairing commands: DISABLED\n\nUse .menu in a private self-chat or one of your groups to open the control menu.`;
}

function helpText() {
  return `💼 FROXY ASSISTANT · OWNER CONTROL MENU\n\nBUSINESS\n.leads — Today’s leads\n.leads all — All leads\n.stats — Business summary\n.leadclose 2637xxxxxx — Mark lead closed\n.leadopen 2637xxxxxx — Reopen lead\n.catalog 2637xxxxxx — Send catalog\n.price 2637xxxxxx — Send catalog / pricing\n.pay 2637xxxxxx — Send payment details\n.invoice 2637xxxxxx 5 Website design — Create and send a PDF invoice\n.broadcast message — Send only to subscribed contacts\n\nGROUP MANAGEMENT (use inside the target group)\n.tagall message — Mention all members\n.hidetag message — Mention all members without listing their numbers in the text\n.open / .close — Open or close group posting\n.promote @user / .demote @user\n.kick @user\n.link — Get that group’s invite link\n.groupinfo — Group details\n.welcome on/off\n.goodbye on/off\n.antilink on/off\n\nSECURITY\n.lock — Verify owner lock\n.pair / .qr / .setowner are not bot commands. Initial linking still requires scanning the deployment QR with the correct WhatsApp account.`;
}

function makeInvoicePdf(invoice) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: `Invoice ${invoice.id}`, Author: BUSINESS_NAME } });
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    if (fs.existsSync(LOGO_FILE)) doc.image(LOGO_FILE, 48, 42, { fit: [94, 94] });
    doc.font('Helvetica-Bold').fontSize(22).fillColor('#6d28d9').text(BUSINESS_NAME, 160, 54, { width: 230 });
    doc.font('Helvetica').fontSize(9).fillColor('#444444').text('Professional technology and business services', 160, 82, { width: 230 });
    doc.font('Helvetica-Bold').fontSize(26).fillColor('#111111').text('INVOICE', 390, 48, { align: 'right', width: 150 });
    doc.font('Helvetica').fontSize(10).fillColor('#333333').text(`Invoice No: ${invoice.id}`, 330, 83, { align: 'right', width: 210 });
    doc.text(`Date: ${new Date(invoice.createdAt).toLocaleDateString('en-GB')}`, 330, 99, { align: 'right', width: 210 });

    doc.moveTo(48, 157).lineTo(547, 157).lineWidth(1.5).strokeColor('#8b5cf6').stroke();
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#222222').text('BILL TO', 50, 180);
    doc.font('Helvetica').fontSize(10).text(`WhatsApp: +${invoice.recipient}`, 50, 198);
    doc.font('Helvetica-Bold').text('DESCRIPTION', 50, 246);
    doc.font('Helvetica-Bold').text('AMOUNT (USD)', 410, 246, { width: 130, align: 'right' });
    doc.moveTo(50, 266).lineTo(545, 266).lineWidth(0.8).strokeColor('#c4b5fd').stroke();

    const description = String(invoice.description || 'Business services').slice(0, 300);
    doc.font('Helvetica').fontSize(10).fillColor('#222222');
    doc.text(description, 50, 282, { width: 320 });
    const descHeight = doc.heightOfString(description, { width: 320 });
    doc.text(`$${Number(invoice.amount).toFixed(2)}`, 410, 282, { width: 130, align: 'right' });

    const totalY = Math.max(330, 282 + descHeight + 24);
    doc.moveTo(50, totalY).lineTo(545, totalY).lineWidth(0.8).strokeColor('#c4b5fd').stroke();
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#111111').text('TOTAL DUE', 320, totalY + 18, { width: 120 });
    doc.font('Helvetica-Bold').fontSize(16).fillColor('#6d28d9').text(`$${Number(invoice.amount).toFixed(2)} USD`, 410, totalY + 14, { width: 130, align: 'right' });

    const footerY = Math.min(totalY + 82, 700);
    doc.font('Helvetica').fontSize(9).fillColor('#444444').text('Please confirm payment with the business owner before marking this invoice as paid.', 50, footerY, { width: 495 });
    doc.moveTo(50, 754).lineTo(545, 754).lineWidth(0.8).strokeColor('#8b5cf6').stroke();
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#6d28d9').text('FROXY ASSISTANT · FXT SOLUTIONS', 50, 766, { align: 'center', width: 495 });
    doc.font('Helvetica').fontSize(8).fillColor('#666666').text(`Owner: +${OWNER_NUMBER}`, 50, 782, { align: 'center', width: 495 });
    doc.end();
  });
}

function getMentionTargets(message, extraText) {
  const mentioned = message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
  if (mentioned.length) return [...new Set(mentioned)];
  const phoneMatches = String(extraText || '').match(/\+?\d{8,15}/g) || [];
  return [...new Set(phoneMatches.map(value => `${digits(value)}@s.whatsapp.net`))];
}

function pause(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

let authorizedAccount = false;
let reconnectTimer = null;
let shuttingDown = false;

async function handleMessage(sock, message) {
  if (!authorizedAccount || !message?.message) return;
  const from = message.key?.remoteJid || '';
  if (!from || from === 'status@broadcast') return;
  const isGroup = from.endsWith('@g.us');
  const body = extractText(message.message);
  if (!body) return;

  // Only allow self-authored messages that are explicit dot-commands; this enables
  // the owner to control the bot from a private self-chat or their own groups.
  if (message.key?.fromMe && !body.startsWith('.')) return;
  const sender = message.key?.fromMe ? (sock.user?.id || from) : (message.key?.participant || from);
  const owner = isOwnerJid(sender) || (!isGroup && isOwnerJid(from));
  const lower = body.toLowerCase().trim();

  // Group anti-link moderation runs only when explicitly enabled and never targets the owner.
  if (isGroup && !owner) {
    const gc = groupConfig(from);
    if (gc.antilink && /(https?:\/\/|www\.|chat\.whatsapp\.com\/)/i.test(body)) {
      try { await sock.sendMessage(from, { delete: message.key }); } catch (error) {
        console.warn('Could not delete group link; confirm the bot is a group admin:', error.message);
      }
      await sendFroxy(sock, from, '🔒 Anti-link is active. Link messages are restricted in this group.');
      return;
    }
  }

  // Public-facing DM handling and explicit marketing consent.
  if (!isGroup && !owner && !message.key?.fromMe) {
    const lead = getOrCreateLead(from, body);
    if (['stop', 'unsubscribe', '.unsubscribe'].includes(lower)) {
      lead.optedIn = false;
      saveLeads();
      await sendFroxy(sock, from, 'You have been unsubscribed from business updates. You can still message us for help with a current enquiry.');
      return;
    }
    if (['start', 'subscribe', '.subscribe'].includes(lower)) {
      lead.optedIn = true;
      saveLeads();
      await sendFroxy(sock, from, '✅ You are subscribed to FXT business updates. Reply STOP at any time to opt out.');
      return;
    }
    if (/dubai|import|uae|shipping/.test(lower)) {
      await sendFroxy(sock, from, '🌍 FXT DUBAI IMPORT ASSIST\n\nWe help source imports from Dubai to Zimbabwe. Common requests include electronics, phones and clothing. The usual shipping estimate shared by the business is 7–12 days, and a 50% deposit may be required.\n\nSend the item name, quantity and budget in USD for an owner review.');
      return;
    }
    if (/payment|\bpay\b|ecocash|innbucks|zipit|usdt/.test(lower)) {
      await sendFroxy(sock, from, paymentText());
      return;
    }
    if (/price|cost|catalog|\bbot\b|\blab\b|cyber|^1$|^2$/.test(lower)) {
      await sendFroxy(sock, from, catalogText());
      return;
    }
    if (!settings.chats[from]?.greeted) {
      settings.chats[from] = { ...(settings.chats[from] || {}), greeted: true };
      saveSettings();
      await sendFroxy(sock, from, welcomeText());
    }
    return;
  }

  // No private or group control command is available to non-owners.
  if (!body.startsWith('.')) return;
  const parts = body.slice(1).trim().split(/\s+/).filter(Boolean);
  const cmd = (parts.shift() || '').toLowerCase();
  const q = parts.join(' ');
  if (!cmd) return;

  if (['pair', 'qr', 'setowner'].includes(cmd)) {
    await sendFroxy(sock, from, '🔒 Pairing-control commands are disabled. The WhatsApp session is restricted by the startup account-number check.');
    return;
  }

  if (!owner) {
    await sendFroxy(sock, from, '🔒 ACCESS DENIED. This bot’s business and group controls are restricted to its verified owner.');
    return;
  }

  try {
    if (['menu', 'business', 'help'].includes(cmd)) {
      await sendFroxy(sock, from, helpText());
      return;
    }

    if (cmd === 'lock') {
      await sendFroxy(sock, from, `🔒 OWNER LOCK STATUS\n\nConfigured owner: ${ownerLabel()}\nConnected account: +${numberFromJid(sock.user?.id)}\nAccount match: ${isOwnerJid(sock.user?.id) ? 'VERIFIED' : 'NOT VERIFIED'}\nPair / QR commands: DISABLED\nBroadcast policy: opt-in contacts only\nTotal saved leads: ${leads.length}`);
      return;
    }

    if (cmd === 'stats') {
      const todayKey = new Date().toDateString();
      const todayLeads = leads.filter(item => item.firstSeenAt && new Date(item.firstSeenAt).toDateString() === todayKey);
      const active = leads.filter(item => item.status !== 'CLOSED');
      const subscribed = leads.filter(item => item.optedIn);
      await sendFroxy(sock, from, `📊 BUSINESS SUMMARY\n\nAll saved leads: ${leads.length}\nNew today: ${todayLeads.length}\nOpen leads: ${active.length}\nSubscribed contacts: ${subscribed.length}\nClosed leads: ${leads.filter(item => item.status === 'CLOSED').length}`);
      return;
    }

    if (cmd === 'leads') {
      const all = q.toLowerCase() === 'all';
      const todayKey = new Date().toDateString();
      const filtered = (all ? leads : leads.filter(item => item.firstSeenAt && new Date(item.firstSeenAt).toDateString() === todayKey)).slice(-15).reverse();
      const list = filtered.map((item, index) => `${index + 1}. +${item.number || 'unknown'} — ${item.interest || 'General'} — ${item.status || 'NEW'}${item.optedIn ? ' — SUBSCRIBED' : ''}\n   ${(item.message || '').replace(/\s+/g, ' ').slice(0, 65)}`).join('\n\n') || 'No leads recorded for this view.';
      await sendFroxy(sock, from, `📋 LEADS (${all ? 'ALL' : 'TODAY'}) · ${all ? leads.length : leads.filter(item => item.firstSeenAt && new Date(item.firstSeenAt).toDateString() === todayKey).length}\n\n${list}`);
      return;
    }

    if (cmd === 'leadclose' || cmd === 'leadopen') {
      const target = digits(q);
      if (!target) {
        await sendFroxy(sock, from, `Usage: .${cmd} 2637xxxxxx`);
        return;
      }
      const lead = leads.find(item => digits(item.number) === target);
      if (!lead) {
        await sendFroxy(sock, from, `No saved lead found for +${target}.`);
        return;
      }
      lead.status = cmd === 'leadclose' ? 'CLOSED' : 'NEW';
      saveLeads();
      await sendFroxy(sock, from, `✅ Lead +${target} marked ${lead.status}.`);
      return;
    }

    if (['catalog', 'price', 'pay'].includes(cmd)) {
      const target = digits(q);
      if (target.length < 8 || target.length > 15) {
        await sendFroxy(sock, from, `Usage: .${cmd} 2637xxxxxx`);
        return;
      }
      const to = `${target}@s.whatsapp.net`;
      await sendFroxy(sock, to, cmd === 'pay' ? paymentText() : catalogText());
      await sendFroxy(sock, from, `✅ ${cmd} details sent to +${target}.`);
      return;
    }

    if (cmd === 'broadcast') {
      if (!q) {
        await sendFroxy(sock, from, 'Usage: .broadcast Your business update\n\nOnly contacts who sent SUBSCRIBE are eligible.');
        return;
      }
      const recipients = leads.filter(item => item.optedIn && item.status !== 'CLOSED' && item.jid && !item.jid.endsWith('@g.us')).slice(0, 100);
      if (!recipients.length) {
        await sendFroxy(sock, from, 'No subscribed contacts are available for a broadcast yet. Customers can reply SUBSCRIBE to opt in.');
        return;
      }
      let sent = 0;
      let failed = 0;
      for (const lead of recipients) {
        try {
          await sendFroxy(sock, lead.jid, `📢 BUSINESS UPDATE\n\n${q}\n\nReply STOP to unsubscribe from updates.`);
          sent++;
        } catch (error) {
          failed++;
          console.warn(`Broadcast failed for ${lead.number}:`, error.message);
        }
        await pause(1800);
      }
      await sendFroxy(sock, from, `✅ Broadcast finished. Sent: ${sent}. Failed: ${failed}.\nEligible recipients are opted-in contacts only (maximum 100 per run).`);
      return;
    }

    if (cmd === 'invoice') {
      const match = q.match(/^\+?(\d{8,15})\s+\$?(\d+(?:\.\d{1,2})?)(?:\s+([\s\S]+))?$/);
      if (!match) {
        await sendFroxy(sock, from, 'Usage: .invoice 263712345678 5 Website design\n\nThe amount is in USD.');
        return;
      }
      const recipient = digits(match[1]);
      const amount = Number(match[2]);
      const description = String(match[3] || 'Business services').trim().slice(0, 300);
      if (!Number.isFinite(amount) || amount <= 0 || amount > 10000000) {
        await sendFroxy(sock, from, 'Please enter a valid positive invoice amount in USD.');
        return;
      }
      const now = new Date();
      const id = `FXT-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${Date.now().toString().slice(-6)}`;
      const invoice = { id, recipient, amount, description, createdAt: now.toISOString() };
      const pdf = await makeInvoicePdf(invoice);
      const filePath = path.join(INVOICES_DIR, `${id}.pdf`);
      fs.writeFileSync(filePath, pdf);
      const targetJid = `${recipient}@s.whatsapp.net`;
      await sendFroxy(sock, targetJid, `🧾 INVOICE ${id}\n\nDescription: ${description}\nTotal due: $${amount.toFixed(2)} USD\n\nThe PDF invoice is attached in the next message. Please confirm payment details with the business owner.`);
      await sock.sendMessage(targetJid, {
        document: pdf,
        mimetype: 'application/pdf',
        fileName: `Invoice-${id}.pdf`,
        caption: brandedText(`🧾 PDF INVOICE ${id}\nTotal due: $${amount.toFixed(2)} USD\nPlease confirm payment with the owner.`)
      });
      await sendFroxy(sock, from, `✅ Invoice ${id} created and sent to +${recipient}.\nAmount: $${amount.toFixed(2)} USD\nDescription: ${description}\nSaved copy: invoices/${id}.pdf`);
      return;
    }

    // Group moderation commands must run inside a group.
    if (['tagall', 'hidetag', 'open', 'close', 'promote', 'demote', 'kick', 'link', 'groupinfo', 'welcome', 'goodbye', 'antilink'].includes(cmd)) {
      if (!isGroup) {
        await sendFroxy(sock, from, `Use .${cmd} inside the WhatsApp group you want to manage.`);
        return;
      }
      const gc = groupConfig(from);
      if (cmd === 'tagall' || cmd === 'hidetag') {
        const meta = await sock.groupMetadata(from);
        const mentions = (meta.participants || []).map(participant => participant.id).filter(Boolean);
        const text = q || (cmd === 'tagall' ? 'Attention team — please review this business update.' : 'FROXY ASSISTANT · Group notice');
        await sendFroxy(sock, from, `${cmd === 'tagall' ? '📢 GROUP ANNOUNCEMENT' : '📢 GROUP NOTICE'}\n\n${text}`, { mentions });
        return;
      }
      if (cmd === 'open' || cmd === 'close') {
        await sock.groupSettingUpdate(from, cmd === 'open' ? 'not_announcement' : 'announcement');
        await sendFroxy(sock, from, cmd === 'open' ? '🔓 Group opened. Members can send messages.' : '🔒 Group closed. Only group admins can send messages.');
        return;
      }
      if (['promote', 'demote', 'kick'].includes(cmd)) {
        const targets = getMentionTargets(message.message, q);
        if (!targets.length) {
          await sendFroxy(sock, from, `Usage: .${cmd} @user (mention the member, or enter their full number).`);
          return;
        }
        const action = cmd === 'promote' ? 'promote' : cmd === 'demote' ? 'demote' : 'remove';
        await sock.groupParticipantsUpdate(from, targets, action);
        await sendFroxy(sock, from, `✅ Group member action completed: ${cmd}.`);
        return;
      }
      if (cmd === 'link') {
        const code = await sock.groupInviteCode(from);
        if (!code) throw new Error('WhatsApp did not return a group invite code.');
        await sendFroxy(sock, from, `🔗 GROUP INVITE LINK\nhttps://chat.whatsapp.com/${code}`);
        return;
      }
      if (cmd === 'groupinfo') {
        const meta = await sock.groupMetadata(from);
        await sendFroxy(sock, from, `📊 GROUP INFORMATION\n\nName: ${meta.subject || 'Unknown'}\nMembers: ${(meta.participants || []).length}\nGroup ID: ${from}\nWelcome: ${gc.welcome ? 'ON' : 'OFF'}\nGoodbye: ${gc.goodbye ? 'ON' : 'OFF'}\nAnti-link: ${gc.antilink ? 'ON' : 'OFF'}`);
        return;
      }
      if (['welcome', 'goodbye', 'antilink'].includes(cmd)) {
        const state = q.toLowerCase();
        if (!['on', 'off'].includes(state)) {
          await sendFroxy(sock, from, `Usage: .${cmd} on\n       .${cmd} off`);
          return;
        }
        gc[cmd] = state === 'on';
        saveSettings();
        await sendFroxy(sock, from, `✅ ${cmd.toUpperCase()} is now ${state.toUpperCase()} for this group.`);
        return;
      }
    }

    await sendFroxy(sock, from, `Unknown command: .${cmd}\n\nUse .menu to see the professional business and group commands.`);
  } catch (error) {
    console.error(`Command .${cmd} failed:`, error);
    await sendFroxy(sock, from, `⚠️ The .${cmd} operation did not complete. Check that Froxy Assistant is a group admin where required, and review the deployment logs.`).catch(() => {});
  }
}

async function startBot() {
  if (shuttingDown) return;
  try {
    // The directory exists before this call, preventing ENOENT from missing parents.
    fs.mkdirSync(SESSION_DIR, { recursive: true });
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
    const sock = makeWASocket({
      auth: state,
      logger: P({ level: LOG_LEVEL }),
      browser: ['Froxy Assistant', 'Chrome', '1.0.0'],
      markOnlineOnConnect: false,
      syncFullHistory: false,
      printQRInTerminal: false
    });

    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', async update => {
      if (update.qr) {
        console.log('\nScan this QR using the WhatsApp account configured as OWNER_NUMBER. A wrong account will be logged out.');
        qrcode.generate(update.qr, { small: true });
      }
      if (update.connection === 'open') {
        const accountNumber = numberFromJid(sock.user?.id);
        if (accountNumber !== OWNER_NUMBER) {
          authorizedAccount = false;
          console.error(`SECURITY STOP: Connected account +${accountNumber || 'unknown'} does not match configured owner +${OWNER_NUMBER}. Logging out.`);
          try { await sock.logout(); } catch (error) { console.error('Logout for mismatched account failed:', error.message); }
          try { fs.rmSync(SESSION_DIR, { recursive: true, force: true }); } catch (_) {}
          if (!shuttingDown) process.exitCode = 1;
          return;
        }
        authorizedAccount = true;
        console.log(`✅ FROXY ASSISTANT ONLINE — owner account +${accountNumber} verified.`);
        await sendFroxy(sock, sock.user.id, buildConnectedText(accountNumber)).catch(error => console.error('Could not send connected message:', error.message));
      }
      if (update.connection === 'close') {
        authorizedAccount = false;
        const code = update.lastDisconnect?.error?.output?.statusCode;
        console.warn('WhatsApp connection closed. Status:', code || 'unknown');
        if (!shuttingDown && code !== DisconnectReason.loggedOut) {
          clearTimeout(reconnectTimer);
          reconnectTimer = setTimeout(() => startBot().catch(error => console.error('Reconnect failed:', error)), 4000);
        }
      }
    });

    sock.ev.on('messages.upsert', async event => {
      for (const message of event.messages || []) {
        try {
          await handleMessage(sock, message);
        } catch (error) {
          console.error('Message handling error:', error);
        }
      }
    });

    sock.ev.on('group-participants.update', async update => {
      if (!authorizedAccount || !update?.id) return;
      const gc = groupConfig(update.id);
      saveSettings();
      if (update.action === 'add' && gc.welcome) {
        const names = (update.participants || []).map(numberFromJid).filter(Boolean).map(value => `+${value}`).join(', ');
        await sendFroxy(sock, update.id, `👋 Welcome to the group ${names ? names + ' ' : ''}— please review the group rules and keep discussions professional.`).catch(error => console.error('Welcome message failed:', error.message));
      } else if (update.action === 'remove' && gc.goodbye) {
        const names = (update.participants || []).map(numberFromJid).filter(Boolean).map(value => `+${value}`).join(', ');
        await sendFroxy(sock, update.id, `A member has left the group${names ? ` (${names})` : ''}.`).catch(error => console.error('Goodbye message failed:', error.message));
      }
    });
  } catch (error) {
    console.error('FROXY ASSISTANT failed to start:', error);
    if (!shuttingDown) {
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(() => startBot().catch(err => console.error('Retry failed:', err)), 5000);
    }
  }
}

process.on('SIGINT', () => {
  shuttingDown = true;
  clearTimeout(reconnectTimer);
  process.exit(0);
});
process.on('SIGTERM', () => {
  shuttingDown = true;
  clearTimeout(reconnectTimer);
  process.exit(0);
});

if (!OWNER_NUMBER || OWNER_NUMBER.length < 8) {
  console.error('OWNER_NUMBER is invalid. Set it to digits only, for example 263712552662.');
  process.exit(1);
}
if (!fs.existsSync(LOGO_FILE)) {
  console.warn('logo.png was not found. Keep logo.png beside index.js to include the logo with bot replies.');
}

startBot().catch(error => console.error('Fatal startup error:', error));
