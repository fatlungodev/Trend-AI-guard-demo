import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_DIR = path.join(__dirname, '../../log');
const LOG_FILE = path.join(LOG_DIR, 'audit.log');
const CONSOLE_LOG_FILE = path.join(LOG_DIR, 'console.log');

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
}

// --- Console Recording Setup ---
import util from 'util';

const consoleLogStream = fs.createWriteStream(CONSOLE_LOG_FILE, { flags: 'a' });

const originalConsole = {
    log: console.log,
    error: console.error,
    warn: console.warn,
    info: console.info,
    debug: console.debug
};

function writeToConsoleLog(level, args) {
    const timestamp = new Date().toISOString();
    const message = util.format(...args);
    consoleLogStream.write(`[${timestamp}] [${level}] ${message}\n`);
}

console.log = (...args) => {
    writeToConsoleLog('INFO', args);
    originalConsole.log(...args);
};

console.error = (...args) => {
    writeToConsoleLog('ERROR', args);
    originalConsole.error(...args);
};

console.warn = (...args) => {
    writeToConsoleLog('WARN', args);
    originalConsole.warn(...args);
};

console.info = (...args) => {
    writeToConsoleLog('INFO', args);
    originalConsole.info(...args);
};

console.debug = (...args) => {
    writeToConsoleLog('DEBUG', args);
    originalConsole.debug(...args);
};

export function logAudit(event, data) {
    const logEntry = {
        timestamp: new Date().toISOString(),
        event,
        ...data
    };

    const logString = JSON.stringify(logEntry) + '\n';

    console.log(`[AUDIT] ${event}:`, JSON.stringify(data));

    fs.appendFile(LOG_FILE, logString, (err) => {
        if (err) console.error('Failed to write to audit log:', err);
    });
}

export async function getAuditLogs() {
    try {
        if (!fs.existsSync(LOG_FILE)) return [];
        const content = await fs.promises.readFile(LOG_FILE, 'utf8');
        return content
            .trim()
            .split('\n')
            .filter(line => line.trim())
            .map(line => {
                try {
                    return JSON.parse(line);
                } catch (e) {
                    return null;
                }
            })
            .filter(log => log !== null);
    } catch (error) {
        console.error('Failed to read audit logs:', error);
        return [];
    }
}
