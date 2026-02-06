import {
    makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion
} from '@whiskeysockets/baileys';
import pino from 'pino';
import { Boom } from '@hapi/boom';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import { checkSecurity } from './services/trend-guard.js';
import { getChatCompletion } from './services/llm.js';
import { logAudit, getAuditLogs } from './services/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- Auth State ---
let sock = null;
let qrCode = null;
let waStatus = 'disconnected'; // disconnected, connecting, connected

// --- Express & Socket.io Setup ---
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

app.use(express.static(path.join(__dirname, '../public')));

io.on('connection', (socket) => {
    console.log('Web client connected');
    socket.emit('status', { isGuardEnabled: config.isGuardEnabled });
    socket.emit('wa-status', { status: waStatus });
    if (qrCode) socket.emit('wa-qr', { qr: qrCode });

    // Send historical logs
    getAuditLogs().then(logs => {
        socket.emit('audit-logs', { logs });
    });

    socket.on('wa-logout', async () => {
        if (sock) {
            try {
                await sock.logout();
            } catch (e) { }
            sock = null;
            waStatus = 'disconnected';
            qrCode = null;
            io.emit('wa-status', { status: waStatus });
        }
    });

    socket.on('wa-reconnect', () => {
        if (waStatus !== 'connected') {
            startWhatsApp();
        }
    });

    socket.on('toggle-guard', () => {
        config.isGuardEnabled = !config.isGuardEnabled;
        logAudit('guard_toggle', {
            enabled: config.isGuardEnabled,
            source: 'web_ui'
        });
        io.emit('status', { isGuardEnabled: config.isGuardEnabled });
    });

    socket.on('message', async (data) => {
        const text = data.text;
        try {
            logAudit('message_received', {
                channel: 'web',
                prompt: text
            });

            let result = { response: { action: 'allow' } };

            if (config.isGuardEnabled) {
                console.log('--- Trend Guard Request ---');
                console.log(JSON.stringify({ prompt: text }, null, 2));

                result = await checkSecurity(text);

                console.log('--- Trend Guard Response ---');
                console.log(JSON.stringify(result.response, null, 2));

                logAudit('security_check', {
                    channel: 'web',
                    prompt: text,
                    action: result.response.action,
                    reasons: result.response.reasons || []
                });

                if (result.response.action?.toLowerCase() === 'block') {
                    socket.emit('blocked', { text: '🚫 Security Violation: Blocked by Trend Vision One AI Guard.' });
                    return;
                }
            }

            io.emit('trend-log', { text, result: result.response, request: result.request || { prompt: text } });

            console.log('--- LLM Request ---');
            console.log(JSON.stringify({ prompt: text }, null, 2));

            const response = await getChatCompletion(text);

            console.log('--- LLM Response ---');
            console.log(JSON.stringify({ text: response }, null, 2));

            socket.emit('response', { text: response });
        } catch (error) {
            console.error('Error in message handler:', error);
            socket.emit('response', { text: '❌ Error: ' + error.message });
        }
    });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
    console.log(`Web interface running at http://localhost:${PORT}`);
});

// --- WhatsApp Setup ---
async function startWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_session');
    const { version } = await fetchLatestBaileysVersion();

    waStatus = 'connecting';
    io.emit('wa-status', { status: waStatus });

    sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        auth: state,
        printQRInTerminal: false
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            qrCode = qr;
            io.emit('wa-qr', { qr });
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error instanceof Boom) ?
                lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut : true;

            const reason = lastDisconnect.error?.output?.payload?.message || 'unknown';
            logAudit('whatsapp_connection', {
                status: 'disconnected',
                reason,
                reconnect: shouldReconnect
            });

            waStatus = 'disconnected';
            qrCode = null;
            io.emit('wa-status', { status: waStatus });

            if (shouldReconnect) {
                console.log('Reconnecting WhatsApp...');
                startWhatsApp();
            }
        } else if (connection === 'open') {
            logAudit('whatsapp_connection', { status: 'connected' });
            waStatus = 'connected';
            qrCode = null;
            io.emit('wa-status', { status: waStatus });
            console.log('WhatsApp connected!');
        }
    });

    sock.ev.on('messages.upsert', async (m) => {
        if (m.type !== 'notify') return;
        for (const msg of m.messages) {
            if (!msg.message || msg.key.fromMe) continue;
            const remoteJid = msg.key.remoteJid;
            const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
            if (!text) continue;

            // --- WhatsApp Allowlist Check ---
            const senderNumber = remoteJid.split('@')[0];
            if (config.whatsappAllowList.length > 0 && !config.whatsappAllowList.includes(senderNumber)) {
                console.log(`--- Skipping message from non-allowlisted number: ${senderNumber} ---`);
                continue;
            }

            if (text.toLowerCase() === '/guard on') {
                config.isGuardEnabled = true;
                logAudit('guard_toggle', {
                    enabled: true,
                    source: 'whatsapp',
                    sender: senderNumber
                });
                io.emit('status', { isGuardEnabled: true });
                await sock.sendMessage(remoteJid, { text: '🛡️ AI Guard: ENABLED' });
                continue;
            }
            if (text.toLowerCase() === '/guard off') {
                config.isGuardEnabled = false;
                logAudit('guard_toggle', {
                    enabled: false,
                    source: 'whatsapp',
                    sender: senderNumber
                });
                io.emit('status', { isGuardEnabled: false });
                await sock.sendMessage(remoteJid, { text: '⚠️ AI Guard: DISABLED' });
                continue;
            }

            try {
                logAudit('message_received', {
                    channel: 'whatsapp',
                    sender: senderNumber,
                    prompt: text
                });

                let result = { response: { action: 'allow' } };

                if (config.isGuardEnabled) {
                    console.log(`--- Trend Guard Request (WhatsApp: ${remoteJid}) ---`);
                    console.log(JSON.stringify({ prompt: text }, null, 2));

                    result = await checkSecurity(text);

                    console.log('--- Trend Guard Response ---');
                    console.log(JSON.stringify(result.response, null, 2));

                    logAudit('security_check', {
                        channel: 'whatsapp',
                        sender: senderNumber,
                        prompt: text,
                        action: result.response.action,
                        reasons: result.response.reasons || []
                    });

                    if (result.response.action?.toLowerCase() === 'block') {
                        await sock.sendMessage(remoteJid, { text: '🚫 Blocked by Trend Vision One AI Guard.' });
                        continue;
                    }
                }

                io.emit('trend-log', { text, result: result.response, request: result.request || { prompt: text }, source: 'whatsapp' });

                console.log('--- LLM Request ---');
                console.log(JSON.stringify({ prompt: text }, null, 2));

                const response = await getChatCompletion(text);

                console.log('--- LLM Response ---');
                console.log(JSON.stringify({ text: response }, null, 2));

                await sock.sendMessage(remoteJid, { text: response });
            } catch (error) {
                console.error('Error processing WhatsApp message:', error);
                await sock.sendMessage(remoteJid, { text: '❌ Error processing request.' });
            }
        }
    });
}

startWhatsApp().catch(err => console.error('Startup Error:', err));
