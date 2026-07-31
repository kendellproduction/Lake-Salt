#!/usr/bin/env node
/**
 * Lake Salt — Scheduled Send Daemon
 *
 * Reads scripts/send-queue.json (a manifest with { draftId, scheduledFor, sentAt? } entries)
 * and sends each draft at its scheduled time.
 *
 * Why this exists: Gmail API doesn't natively support scheduled-send. This daemon
 * fakes it by sleeping until each scheduled time, then calling drafts.send.
 *
 * Resumable: if you Ctrl-C or your laptop sleeps, the manifest records what's already
 * been sent. Just re-run the daemon and it picks up where it left off.
 *
 * Usage:
 *   1. node scripts/send-cohort-drafts.js --rebuild   (creates drafts + queue)
 *   2. node scripts/send-scheduled.js                  (start the daemon)
 *
 * Stop with Ctrl-C. Restart anytime — already-sent entries are skipped.
 */

const { google } = require('../functions/node_modules/googleapis');
const fs = require('fs');
const path = require('path');
const http = require('http');
const url = require('url');

const TOKEN_PATH = path.join(__dirname, '.gmail-token.json');
const CREDS_PATH = path.join(__dirname, '.gmail-credentials.json');
const QUEUE_PATH = path.join(__dirname, 'send-queue.json');
const LOG_PATH = path.join(__dirname, 'send-log.txt');

const SCOPES = ['https://www.googleapis.com/auth/gmail.modify'];

async function authorize() {
  const creds = JSON.parse(fs.readFileSync(CREDS_PATH));
  const { client_secret, client_id } = creds.installed || creds.web;
  const redirectUri = 'http://localhost:53682/oauth2callback';
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirectUri);
  if (fs.existsSync(TOKEN_PATH)) {
    oAuth2Client.setCredentials(JSON.parse(fs.readFileSync(TOKEN_PATH)));
    return oAuth2Client;
  }
  return new Promise((resolve, reject) => {
    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent',
    });
    const server = http.createServer(async (req, res) => {
      try {
        if (req.url.startsWith('/oauth2callback')) {
          const qs = url.parse(req.url, true).query;
          if (qs.error) {
            res.end(`Error: ${qs.error}`);
            server.close();
            return reject(new Error(qs.error));
          }
          res.end(`<h2>Authorized! You can close this tab.</h2>`);
          const { tokens } = await oAuth2Client.getToken(qs.code);
          oAuth2Client.setCredentials(tokens);
          fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
          server.close();
          resolve(oAuth2Client);
        }
      } catch (err) {
        res.end(`Error: ${err.message}`);
        server.close();
        reject(err);
      }
    });
    server.listen(53682, () => {
      console.log(`\nOpen this URL in browser (sign in as contact@lakesalt.us):\n${authUrl}\n`);
      const { exec } = require('child_process');
      exec(`open "${authUrl}"`);
    });
  });
}

function log(line) {
  const ts = new Date().toISOString();
  const entry = `[${ts}] ${line}\n`;
  process.stdout.write(entry);
  fs.appendFileSync(LOG_PATH, entry);
}

function loadQueue() {
  if (!fs.existsSync(QUEUE_PATH)) {
    console.error(`\nNo queue file found at ${QUEUE_PATH}`);
    console.error(`Run: node scripts/send-cohort-drafts.js --rebuild  first.\n`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(QUEUE_PATH));
}

function saveQueue(queue) {
  fs.writeFileSync(QUEUE_PATH, JSON.stringify(queue, null, 2));
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

(async () => {
  const auth = await authorize();
  const gmail = google.gmail({ version: 'v1', auth });

  const queue = loadQueue();
  const total = queue.length;
  const alreadySent = queue.filter(e => e.sentAt).length;
  const pending = queue.filter(e => !e.sentAt);

  log(`Daemon started. ${total} total · ${alreadySent} already sent · ${pending.length} pending`);

  for (const entry of queue) {
    if (entry.sentAt) {
      log(`SKIP (already sent): ${entry.subject} → ${entry.to}`);
      continue;
    }
    const scheduledAt = new Date(entry.scheduledFor).getTime();
    const now = Date.now();
    const waitMs = scheduledAt - now;

    if (waitMs > 0) {
      const waitMin = Math.round(waitMs / 60000);
      log(`SLEEP ${waitMin}m until ${entry.scheduledFor} for: ${entry.subject} → ${entry.to}`);
      // Sleep in chunks so we can be friendlier with Ctrl-C
      const CHUNK = 30 * 1000; // 30s
      let remaining = waitMs;
      while (remaining > 0) {
        const slice = Math.min(CHUNK, remaining);
        await sleep(slice);
        remaining -= slice;
      }
    }

    try {
      const res = await gmail.users.drafts.send({
        userId: 'me',
        requestBody: { id: entry.draftId },
      });
      entry.sentAt = new Date().toISOString();
      entry.messageId = res.data.id;
      saveQueue(queue);
      log(`✓ SENT  ${entry.subject} → ${entry.to}  [msg ${res.data.id}]`);
    } catch (err) {
      log(`✗ FAIL  ${entry.subject} → ${entry.to}  :: ${err.message}`);
      entry.error = err.message;
      entry.failedAt = new Date().toISOString();
      saveQueue(queue);
    }
  }

  log(`Daemon finished. Sent ${queue.filter(e => e.sentAt).length} / ${total}.`);
})().catch(err => {
  log(`FATAL: ${err.message}`);
  process.exit(1);
});
