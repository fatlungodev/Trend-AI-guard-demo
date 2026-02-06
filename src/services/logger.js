import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_FILE = path.join(__dirname, '../audit.log');

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
