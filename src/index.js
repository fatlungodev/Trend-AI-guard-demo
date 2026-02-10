import {
    makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    downloadMediaMessage
} from '@whiskeysockets/baileys';
import pino from 'pino';
import { Boom } from '@hapi/boom';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import fs from 'fs';
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
            } catch (e) {
                console.error('Error during logout:', e);
            }
            sock = null;
        }

        // --- Remove session files ---
        const authPath = path.join(__dirname, '../auth_session');
        if (fs.existsSync(authPath)) {
            try {
                fs.rmSync(authPath, { recursive: true, force: true });
                console.log('Session folder removed');
            } catch (err) {
                console.error('Error removing session folder:', err);
            }
        }

        waStatus = 'disconnected';
        qrCode = null;
        io.emit('wa-status', { status: waStatus });
        io.emit('wa-qr', { qr: null });

        // Trigger fresh start to show new QR
        console.log('Restarting WhatsApp for new login...');
        startWhatsApp();
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
        const text = data.text || '';
        const image = data.image || null; // { mimeType: string, data: string (base64) }
        const hasImage = !!image;

        try {
            logAudit('message_received', {
                channel: 'web',
                prompt: text,
                hasImage
            });

            let result = { response: { action: 'allow' } };

            // Skip Trend Guard for image messages
            if (config.isGuardEnabled && !hasImage && text) {
                console.log('--- Trend Guard Request ---');
                console.log(JSON.stringify({ prompt: text }, null, 2));

                result = await checkSecurity(text);

                console.log('--- Trend Guard Response ---');
                console.log(JSON.stringify(result.response, null, 2));

                logAudit('security_check', {
                    channel: 'web',
                    prompt: text,
                    action: result.response.action,
                    reasons: result.response.reasons || [],
                    result: result.response
                });

                io.emit('trend-log', { text, result: result.response, request: result.request || { prompt: text } });

                if (result.response.action?.toLowerCase() === 'block') {
                    socket.emit('blocked', { text: '🚫 Security Violation: Blocked by Trend Vision One AI Guard.' });
                    return;
                }
            } else {
                io.emit('trend-log', { text: text || '[Image]', result: result.response, request: result.request || { prompt: text || '[Image]' } });
            }

            console.log('--- LLM Request ---');
            console.log(JSON.stringify({ prompt: text, hasImage }, null, 2));

            const response = await getChatCompletion(text, image);

            console.log('--- LLM Response ---');
            console.log(JSON.stringify({ text: response.text, hasImage: !!response.image }, null, 2));

            socket.emit('response', { 
                text: response.text,
                image: response.image || null // { mimeType, data }
            });
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
            console.log('--- Raw WhatsApp Message ---');
            console.log(JSON.stringify(msg, null, 2));

            if (!msg.message || msg.key.fromMe) continue;

            const remoteJid = msg.key.remoteJid;
            const remoteJidAlt = msg.key.remoteJidAlt;

            // Extract mobile number only if it comes from 's.whatsapp.net'
            const getMobileNumber = (jid) => {
                if (!jid || !jid.endsWith('@s.whatsapp.net')) return null;
                return jid.split('@')[0];
            };

            const senderNumber = getMobileNumber(remoteJid);
            const senderNumberAlt = getMobileNumber(remoteJidAlt);

            // The effective sender for logging/logic is the first non-null mobile number found
            const effectiveSender = senderNumber || senderNumberAlt;

            // --- Check for image message ---
            const imageMessage = msg.message.imageMessage;
            const hasImage = !!imageMessage;
            
            // Get text from conversation, extended text, or image caption
            const text = msg.message.conversation || 
                         msg.message.extendedTextMessage?.text || 
                         imageMessage?.caption || 
                         '';
            
            // Skip if no text AND no image
            if (!text && !hasImage) continue;

            // --- WhatsApp Allowlist Check ---
            // If we couldn't identify a valid mobile sender, skip (e.g. status updates, group notifications)
            if (!effectiveSender) {
                console.log('--- Skipping message from non-mobile source ---');
                continue;
            }

            const isAllowed = config.whatsappAllowList.length === 0 ||
                (senderNumber && config.whatsappAllowList.includes(senderNumber)) ||
                (senderNumberAlt && config.whatsappAllowList.includes(senderNumberAlt));

            if (!isAllowed) {
                console.log(`--- Skipping message from non-allowlisted number: ${effectiveSender} ---`);
                logAudit('message_blocked', {
                    channel: 'whatsapp',
                    sender: effectiveSender,
                    reason: 'not_in_allowlist'
                });
                continue;
            }

            if (text.toLowerCase() === '/guard on') {
                config.isGuardEnabled = true;
                logAudit('guard_toggle', {
                    enabled: true,
                    source: 'whatsapp',
                    sender: effectiveSender
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
                    sender: effectiveSender
                });
                io.emit('status', { isGuardEnabled: false });
                await sock.sendMessage(remoteJid, { text: '⚠️ AI Guard: DISABLED' });
                continue;
            }

            try {
                // --- Download image if present ---
                let imageData = null;
                if (hasImage) {
                    try {
                        console.log('--- Downloading WhatsApp image ---');
                        const buffer = await downloadMediaMessage(msg, 'buffer', {});
                        const mimeType = imageMessage.mimetype || 'image/jpeg';
                        imageData = {
                            mimeType,
                            data: buffer.toString('base64')
                        };
                        console.log(`--- Image downloaded: ${mimeType}, ${buffer.length} bytes ---`);
                    } catch (imgErr) {
                        console.error('Error downloading image:', imgErr);
                    }
                }

                logAudit('message_received', {
                    channel: 'whatsapp',
                    sender: effectiveSender,
                    prompt: text || '[Image]',
                    hasImage
                });

                let result = { response: { action: 'allow' } };

                // Skip Trend Guard for image messages
                if (config.isGuardEnabled && !hasImage && text) {
                    console.log(`--- Trend Guard Request (WhatsApp: ${effectiveSender}) ---`);
                    console.log(JSON.stringify({ prompt: text }, null, 2));

                    result = await checkSecurity(text);

                    console.log('--- Trend Guard Response ---');
                    console.log(JSON.stringify(result.response, null, 2));

                    logAudit('security_check', {
                        channel: 'whatsapp',
                        sender: effectiveSender,
                        prompt: text,
                        action: result.response.action,
                        reasons: result.response.reasons || [],
                        result: result.response
                    });

                    // Emit events before potential block return
                    io.emit('wa-comm', { role: 'user', text, sender: effectiveSender, hasImage });
                    io.emit('trend-log', { text, result: result.response, request: result.request || { prompt: text }, source: 'whatsapp' });

                    if (result.response.action?.toLowerCase() === 'block') {
                        await sock.sendMessage(remoteJid, { text: '🚫 Blocked by Trend Vision One AI Guard.' });
                        io.emit('wa-comm', { role: 'ai', text: '🚫 Blocked by Trend Vision One AI Guard.', sender: effectiveSender });
                        continue;
                    }
                } else {
                    io.emit('wa-comm', { role: 'user', text: text || '[Image]', sender: effectiveSender, hasImage });
                    io.emit('trend-log', { text: text || '[Image]', result: result.response, request: result.request || { prompt: text || '[Image]' }, source: 'whatsapp' });
                }

                console.log('--- LLM Request ---');
                console.log(JSON.stringify({ prompt: text || '[Image]', hasImage }, null, 2));

                const response = await getChatCompletion(text || 'Describe this image', imageData);

                console.log('--- LLM Response ---');
                console.log(JSON.stringify({ text: response.text, hasImage: !!response.image }, null, 2));

                // Send text response
                if (response.text) {
                    await sock.sendMessage(remoteJid, { text: response.text });
                }

                // Send image response if present
                if (response.image) {
                    const imageBuffer = Buffer.from(response.image.data, 'base64');
                    await sock.sendMessage(remoteJid, { 
                        image: imageBuffer,
                        mimetype: response.image.mimeType
                    });
                }

                io.emit('wa-comm', { 
                    role: 'ai', 
                    text: response.text || '[Image Response]', 
                    sender: effectiveSender,
                    hasImage: !!response.image 
                });
            } catch (error) {
                console.error('Error processing WhatsApp message:', error);
                await sock.sendMessage(remoteJid, { text: '❌ Error processing request.' });
            }
        }
    });
}

startWhatsApp().catch(err => console.error('Startup Error:', err));
