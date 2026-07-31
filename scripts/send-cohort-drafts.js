#!/usr/bin/env node
/**
 * Lake Salt — Post-Expo Cohort Email Draft Generator
 * Creates 80 personalized HTML drafts in contact@lakesalt.us Gmail.
 *
 * Usage:
 *   1. cd ~/Desktop/Coding\ Projects/Current\ Lake-Salt
 *   2. node scripts/send-cohort-drafts.js
 *   3. First run: browser opens for OAuth consent. Sign in as contact@lakesalt.us. Paste the auth code.
 *   4. Token cached in scripts/.gmail-token.json (gitignored).
 *   5. Drafts appear in contact@lakesalt.us Drafts folder.
 *
 * To resume after partial run: drafts that already exist (by subject + to) are skipped.
 */

const { google } = require('../functions/node_modules/googleapis');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const http = require('http');
const url = require('url');

const TOKEN_PATH = path.join(__dirname, '.gmail-token.json');
const CREDS_PATH = path.join(__dirname, '.gmail-credentials.json');

// ─────────────────────────────────────────────────────────────────────
// OAuth setup
// ─────────────────────────────────────────────────────────────────────
// gmail.modify covers read + draft create + draft delete.
// (gmail.compose alone can create but not read/delete drafts.)
const SCOPES = ['https://www.googleapis.com/auth/gmail.modify'];

async function authorize() {
  if (!fs.existsSync(CREDS_PATH)) {
    console.error(`\nMissing OAuth credentials file: ${CREDS_PATH}`);
    console.error(`\nTo create it:`);
    console.error(`1. Go to https://console.cloud.google.com/apis/credentials`);
    console.error(`2. Pick your Lake Salt project (or create one)`);
    console.error(`3. + Create Credentials → OAuth client ID → Desktop app`);
    console.error(`4. Download the JSON, save it as: ${CREDS_PATH}`);
    console.error(`5. Make sure Gmail API is enabled for that project`);
    console.error(`6. Re-run this script.\n`);
    process.exit(1);
  }
  const creds = JSON.parse(fs.readFileSync(CREDS_PATH));
  const { client_secret, client_id } = creds.installed || creds.web;
  const redirectUri = 'http://localhost:53682/oauth2callback';
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirectUri);

  if (fs.existsSync(TOKEN_PATH)) {
    oAuth2Client.setCredentials(JSON.parse(fs.readFileSync(TOKEN_PATH)));
    return oAuth2Client;
  }

  // First-run flow: spin up a local HTTP server to catch the redirect
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
          console.log(`Token cached to ${TOKEN_PATH}`);
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
      console.log(`\nOpen this URL in your browser to authorize (sign in as contact@lakesalt.us):\n`);
      console.log(authUrl);
      console.log(`\nWaiting for OAuth callback on http://localhost:53682 ...`);
      // Try to open it automatically (mac)
      const { exec } = require('child_process');
      exec(`open "${authUrl}"`);
    });
  });
}

// ─────────────────────────────────────────────────────────────────────
// Recipients
// ─────────────────────────────────────────────────────────────────────
const COHORT_HOT = [
  { name: 'Bry',      email: 'bryannawillard@gmail.com',     date: 'September 12', weeks: 18, month: 'September' },
  { name: 'Shane',    email: 'srhadley0406@gmail.com',       date: 'October 14',   weeks: 22, month: 'October' },
  { name: 'Chanse',   email: 'ckplay26@gmail.com',           date: 'October 1',    weeks: 21, month: 'October' },
  { name: 'Ashlee',   email: 'ashleeandrews03@gmail.com',    date: 'October 10',   weeks: 22, month: 'October' },
  { name: 'Breanne',  email: 'acbreanne@gmail.com',          date: 'August 13',    weeks: 14, month: 'August' },
  { name: 'Joshua',   email: 'joshnritaalmeida@gmail.com',   date: 'August 15',    weeks: 14, month: 'August' },
  { name: 'Mariah',   email: 'dmgarner69@icloud.com',        date: 'September 26', weeks: 20, month: 'September' },
  { name: 'Kimberly', email: 'kgish2@gmail.com',             date: 'September 27', weeks: 20, month: 'September' },
  { name: 'Kinzie',   email: 'mckinzie.belle@gmail.com',     date: 'October 24',   weeks: 24, month: 'October' },
  { name: 'Lexi',     email: 'lexi.brielle.martin@gmail.com',date: 'August 28',    weeks: 16, month: 'August' },
  { name: 'Peyton',   email: 'Peylaw77@gmail.com',           date: 'October 17',   weeks: 23, month: 'October' },
  { name: 'Kya',      email: 'sissypratt@gmail.com',         date: 'August 25',    weeks: 15, month: 'August' },
  { name: 'Lizbeth',  email: 'rebollolizbeth4@gmail.com',    date: 'August 14',    weeks: 14, month: 'August' },
  { name: 'Taelynn',  email: 'wildmantae@gmail.com',         date: 'September 25', weeks: 20, month: 'September' },
  { name: 'Keona',    email: 'keonavs7@gmail.com',           date: 'October 2',    weeks: 21, month: 'October' },
  { name: 'Katy',     email: 'ksmithgish@gmail.com',         date: 'September 27', weeks: 20, month: 'September' },
  { name: 'Amanda',   email: 'fordhamanda@gmail.com',        date: 'August 20',    weeks: 15, month: 'August' },
  { name: 'Triniti',  email: 'talires9@gmail.com',           date: 'September 12', weeks: 18, month: 'September' },
  { name: 'Talei',    email: 'taleibeckstead01@gmail.com',   date: 'September 26', weeks: 20, month: 'September' },
  { name: 'Morgan',   email: 'morgannjjones@gmail.com',      date: 'October 10',   weeks: 22, month: 'October' },
  { name: 'Courtnee', email: 'courtnee.holdaway@gmail.com',  date: 'September 24', weeks: 20, month: 'September' },
  { name: 'Aleisha',  email: 'aleishahall08@gmail.com',      date: 'September 5',  weeks: 17, month: 'September' },
  { name: 'Carly',    email: 'carlykins55@icloud.com',       date: 'August 20',    weeks: 15, month: 'August' },
  { name: 'Mason',    email: 'masonsmithut@gmail.com',       date: 'August 20',    weeks: 15, month: 'August' },
];

const COHORT_WARM = [
  { name: 'Emma',     email: 'marble123321@gmail.com',     date: 'May 9, 2027',      months: 12, month: 'May' },
  { name: 'Kerisa',   email: 'kerisa.devey@gmail.com',     date: 'February 7, 2027', months: 9,  month: 'February' },
  { name: 'Natasha',  email: 'tashacatt85@gmail.com',      date: 'March 3, 2027',    months: 10, month: 'March' },
  { name: 'Kaila',    email: 'powellkaila11@gmail.com',    date: 'April 24, 2027',   months: 11, month: 'April' },
  { name: 'Adelasia', email: 'madadders05@gmail.com',      date: 'April 24, 2027',   months: 11, month: 'April' },
  { name: 'Kas',      email: 'Kasturnbaugh@gmail.com',     date: 'May 10, 2027',     months: 12, month: 'May' },
  { name: 'Emma',     email: 'baca22727@gmail.com',        date: 'February 27, 2027',months: 9,  month: 'February' },
  { name: 'Chance',   email: 'burriwedding24@gmail.com',   date: 'April 24, 2027',   months: 11, month: 'April' },
  { name: 'Sarah',    email: 'moonbowstreak@gmail.com',    date: 'January 27, 2027', months: 8,  month: 'January' },
  { name: 'Aubrey',   email: 'arhess02@gmail.com',         date: 'December 12',      months: 7,  month: 'December' },
  { name: 'Michael',  email: 'mikeyguynn@gmail.com',       date: 'April 25, 2027',   months: 11, month: 'April' },
  { name: 'Brycen',   email: 'brycenricks11@gmail.com',    date: 'December 12',      months: 7,  month: 'December' },
  { name: 'Liz',      email: 'lizaldana2504@gmail.com',    date: 'April 30, 2027',   months: 12, month: 'April' },
  { name: 'Emma',     email: 'emmarosem@comcast.net',      date: 'November 13',      months: 6,  month: 'November' },
  { name: 'Hallie',   email: 'hclarke515@gmail.com',       date: 'May 9, 2027',      months: 12, month: 'May' },
  { name: 'Shaylee',  email: 'shayleet04@gmail.com',       date: 'November 13',      months: 6,  month: 'November' },
];

const COHORT_COOL = [
  { name: 'Krystle',    email: 'kbriel86@gmail.com',           date: 'August 27, 2027',    months: 15, month: 'August' },
  { name: 'Kelsi',      email: 'kelsidunne@gmail.com',         date: 'September 24, 2027', months: 16, month: 'September' },
  { name: 'Francesca',  email: 'flspencer13@gmail.com',        date: 'November 11, 2027',  months: 18, month: 'November' },
  { name: 'Shaelee',    email: 'shaelee07@comcast.net',        date: 'September 16, 2027', months: 16, month: 'September' },
  { name: 'Kira',       email: 'flowergirlkiki@yahoo.com',     date: 'May 27, 2027',       months: 12, month: 'May' },
  { name: 'Taylor',     email: 'taylorandtanner21@gmail.com',  date: 'May 22, 2027',       months: 12, month: 'May' },
  { name: 'Rylie',      email: 'RyBugAnnette@gmail.com',       date: 'October 9, 2027',    months: 17, month: 'October' },
  { name: 'Ella',       email: 'ellaejohnston@icloud.com',     date: 'June 9, 2027',       months: 13, month: 'June' },
  { name: 'Angie',      email: 'ldawilli@gmail.com',           date: 'August 14, 2027',    months: 15, month: 'August' },
  { name: 'Olivia',     email: 'oliviafernelius@gmail.com',    date: 'May 30, 2027',       months: 12, month: 'May' },
  { name: 'Alivia',     email: 'aliviabriel06@gmail.com',      date: 'August 27, 2027',    months: 15, month: 'August' },
  { name: 'Kole',       email: 'bookerwedding2027@gmail.com',  date: 'September 25, 2027', months: 16, month: 'September' },
  { name: 'Amanda',     email: 'amandagomez763@yahoo.com',     date: 'October 2, 2027',    months: 17, month: 'October' },
  { name: 'Ella',       email: 'ellabellis@gmail.com',         date: 'September 9, 2027',  months: 16, month: 'September' },
  { name: 'Baylee',     email: 'bayleebelnap@gmail.com',       date: 'May 18, 2027',       months: 12, month: 'May' },
  { name: 'Echo',       email: 'ejpendley1998@gmail.com',      date: 'October 9, 2027',    months: 17, month: 'October' },
  { name: 'Shante',     email: 'shante076@gmail.com',          date: 'September 9, 2027',  months: 16, month: 'September' },
  { name: 'Makiha',     email: 'makihaandgordon@gmail.com',    date: 'September 9, 2027',  months: 16, month: 'September' },
  { name: 'Matthew',    email: 'Mhknowlton@hotmail.com',       date: 'November 11, 2027',  months: 18, month: 'November' },
  { name: 'Erin',       email: 'sayerserin@gmail.com',         date: 'October 9, 2027',    months: 17, month: 'October' },
  { name: 'Sarah',      email: 'fly.with.sarah1237@gmail.com', date: 'May 17, 2027',       months: 12, month: 'May' },
  { name: 'Madi',       email: 'mparaboschi@gmail.com',        date: 'August 9, 2027',     months: 15, month: 'August' },
  { name: 'Cristen',    email: 'cristensmith1992@gmail.com',   date: 'September 9, 2027',  months: 16, month: 'September' },
  { name: 'Alexis',     email: 'alexsis.allred@gmail.com',     date: 'July 9, 2027',       months: 14, month: 'July' },
  { name: 'Kiana',      email: 'rockerzombie871@gmail.com',    date: 'September 9, 2027',  months: 16, month: 'September' },
  { name: 'Christian',  email: 'cazahniser@icloud.com',        date: 'October 9, 2027',    months: 17, month: 'October' },
  { name: 'Kaylamarie', email: 'taylorleavitt2016@gmail.com',  date: 'September 19, 2027', months: 16, month: 'September' },
  // NOTE: alexiabess00@gmail.clm — SKIPPED, typo'd domain
];

const COHORT_FAR = [
  { name: 'Hailey',  email: 'leeleedavis1010@gmail.com', date: 'October 9, 2029',  month: 'October' },
  { name: 'Trinity', email: 'tolmantr23@gmail.com',      date: 'October 10, 2029', month: 'October' },
  { name: 'Vishnu',  email: 'ammalu19010@gmail.com',     date: 'May 9, 2029',      month: 'May' },
];

const COHORT_NODATE = [
  { name: 'Sarah',    email: 'sarah.findle@gmail.com' },
  { name: 'Shehnoor', email: 'shehnoor.grewal@gmail.com' },
  // { name: 'Heather',  email: 'heathere299@gmail.com' },  // BOUNCED 2026-05-15 — invalid address (550 5.1.1)
  { name: 'Tayllor',  email: 'tayllorautumn@gmail.com' },
  { name: 'McKenna',  email: 'mckenna.leslie7@gmail.com' },
  { name: 'Erycka',   email: 'eryckajohnson@yahoo.com' },
  { name: 'Luis',     email: 'luissalais11@gmail.com' },
  { name: 'Caitlin',  email: 'supbug@hotmail.com' },
  { name: 'Lupita',   email: 'lupitaortiz986@gmail.com' },
  { name: 'Sarah',    email: 'Sarahouzts24@outlook.com' },
];

// ─────────────────────────────────────────────────────────────────────
// HTML template builder
// ─────────────────────────────────────────────────────────────────────
function buildHtml({ firstName, stagePara, offerTagline, signoffLine, replyAsk }) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#F2EDE0;border-collapse:collapse;"><tr><td align="center" style="padding:32px 16px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;background-color:#FAF8F4;border-collapse:collapse;"><tr><td align="center" style="background-color:#0C1526;padding:28px 24px;"><div style="font-family:'Cormorant Garamond',Georgia,'Times New Roman',serif;font-size:30px;font-weight:300;letter-spacing:4px;color:#FAF8F4;line-height:1;">LAKE&nbsp;<span style="color:#C9A96E;font-weight:400;">SALT</span></div><div style="font-family:Georgia,serif;font-size:11px;letter-spacing:3px;color:#C9A96E;text-transform:uppercase;margin-top:8px;">Drink Catering &middot; Est. Utah</div></td></tr><tr><td align="center" style="padding:0;background-color:#FAF8F4;"><img src="https://www.lakesalt.us/images/expo-booth-2026.jpg" alt="Three signature Lake Salt mocktails at the SLC Bridal Expo 2026 booth" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0;outline:none;text-decoration:none;"></td></tr><tr><td style="padding:32px 40px 0 40px;background-color:#FAF8F4;"><p style="margin:0 0 8px 0;font-family:Georgia,serif;font-size:11px;letter-spacing:2px;color:#C9A96E;text-transform:uppercase;">The Booth You Stopped By</p><h1 style="margin:0 0 24px 0;font-family:'Cormorant Garamond',Georgia,'Times New Roman',serif;font-size:28px;font-weight:400;color:#0C1526;line-height:1.2;">Hi ${firstName} &mdash;</h1></td></tr><tr><td style="padding:0 40px;background-color:#FAF8F4;"><p style="margin:0 0 18px 0;font-family:Georgia,'Times New Roman',serif;font-size:16px;line-height:1.65;color:#1A1A1A;">Kendell here from Lake Salt Drink Catering &mdash; we were the mocktail booth at the SLC Bridal Expo Saturday (the one with the line that wouldn't quit 😅). Thanks for tossing your name in the raffle.</p><p style="margin:0 0 18px 0;font-family:Georgia,'Times New Roman',serif;font-size:16px;line-height:1.65;color:#1A1A1A;">Quick heads up: we drew the winner Sunday night, and unfortunately it wasn't you this time &mdash; but here's the thing: <em>the real prize was never the gift card.</em> 10% off your wedding bar saves you way more than $50, and that's what I want to talk to you about.</p></td></tr><tr><td style="padding:8px 40px 0 40px;background-color:#FAF8F4;"><p style="margin:0 0 16px 0;font-family:Georgia,'Times New Roman',serif;font-size:16px;line-height:1.65;color:#1A1A1A;font-style:italic;">Quick reminder of what we pulled off Saturday &mdash; because this is exactly what your wedding bar will feel like:</p></td></tr><tr><td style="padding:8px 40px 16px 40px;background-color:#FAF8F4;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;border-top:1px solid #C9A96E;border-bottom:1px solid #C9A96E;"><tr><td align="center" style="padding:24px 16px;"><div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:42px;color:#C9A96E;font-weight:300;line-height:1;">700+</div><div style="font-family:Georgia,serif;font-size:12px;letter-spacing:2px;color:#0C1526;text-transform:uppercase;margin-top:8px;">drinks poured at the expo &middot; 4 hours &middot; the line never broke</div></td></tr></table></td></tr><tr><td style="padding:8px 40px 0 40px;background-color:#FAF8F4;"><p style="margin:0 0 18px 0;font-family:Georgia,'Times New Roman',serif;font-size:16px;line-height:1.65;color:#1A1A1A;">Think about what you saw at our booth: people waiting in line, but actually <em>enjoying</em> it &mdash; chatting, watching the pour, taking photos before they even tasted it. That's not a fluke. That's what happens when the bar is the show. At your wedding, that same energy is what keeps guests off their phones, on the dance floor, and texting about it Monday morning. We can handle any volume &mdash; we proved that &mdash; but the volume is just the floor. The vibe is the ceiling.</p><p style="margin:0 0 18px 0;font-family:Georgia,'Times New Roman',serif;font-size:16px;line-height:1.65;color:#1A1A1A;">${stagePara}</p></td></tr><tr><td style="padding:16px 40px 8px 40px;background-color:#FAF8F4;"><p style="margin:0 0 16px 0;font-family:Georgia,serif;font-size:11px;letter-spacing:2px;color:#C9A96E;text-transform:uppercase;font-weight:600;">What couples love about us</p><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;"><tr><td style="padding:8px 0;font-family:Georgia,serif;font-size:15px;line-height:1.55;color:#1A1A1A;"><span style="color:#C9A96E;font-weight:700;">&middot;</span>&nbsp;&nbsp;Signature drinks we co-design with you &mdash; no extra charge, photographed and Instagrammed for weeks</td></tr><tr><td style="padding:8px 0;font-family:Georgia,serif;font-size:15px;line-height:1.55;color:#1A1A1A;"><span style="color:#C9A96E;font-weight:700;">&middot;</span>&nbsp;&nbsp;Mocktails, dirty sodas, cocktails, beer/wine, lemonade &mdash; every single guest finds something they love</td></tr><tr><td style="padding:8px 0;font-family:Georgia,serif;font-size:15px;line-height:1.55;color:#1A1A1A;"><span style="color:#C9A96E;font-weight:700;">&middot;</span>&nbsp;&nbsp;We bring the bar, the glassware, the garnishes, the show &mdash; you bring the guests</td></tr></table></td></tr><tr><td style="padding:32px 40px 0 40px;background-color:#FAF8F4;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;background-color:#0C1526;"><tr><td align="center" style="padding:28px 24px;"><div style="font-family:Georgia,serif;font-size:11px;letter-spacing:3px;color:#C9A96E;text-transform:uppercase;margin-bottom:8px;">Expo-Exclusive Offer</div><div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:34px;color:#FAF8F4;font-weight:300;line-height:1.1;margin-bottom:12px;">10% off your wedding bar</div><div style="font-family:Georgia,serif;font-size:14px;color:#F2E8D5;line-height:1.5;">${offerTagline}</div></td></tr></table></td></tr><tr><td align="center" style="padding:28px 40px 8px 40px;background-color:#FAF8F4;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr><td align="center" bgcolor="#C9A96E" style="border-radius:2px;"><a href="https://lakesalt.us/book" style="display:inline-block;padding:16px 36px;font-family:Georgia,serif;font-size:14px;letter-spacing:3px;color:#0C1526;text-decoration:none;text-transform:uppercase;font-weight:600;">Book a 15-min call</a></td></tr></table><p style="margin:16px 0 0 0;font-family:Georgia,serif;font-size:14px;color:#787878;line-height:1.5;">${replyAsk}</p></td></tr><tr><td style="padding:32px 40px 0 40px;background-color:#FAF8F4;"><div style="height:1px;background-color:#C9A96E;opacity:0.3;line-height:1px;font-size:1px;">&nbsp;</div></td></tr><tr><td style="padding:24px 40px 0 40px;background-color:#FAF8F4;"><p style="margin:0;font-family:Georgia,serif;font-size:13px;line-height:1.5;color:#787878;">Packages start at $500 (bartender + supplies, 3 hrs). Every wedding gets a custom number tailored to your guest count, hours, and drink selection. <a href="https://lakesalt.us/pricing" style="color:#C9A96E;text-decoration:none;border-bottom:1px solid #C9A96E;">See full pricing &rarr;</a></p></td></tr><tr><td style="padding:32px 40px 8px 40px;background-color:#FAF8F4;"><p style="margin:0 0 8px 0;font-family:Georgia,serif;font-size:16px;color:#1A1A1A;line-height:1.5;">${signoffLine}</p><p style="margin:0;font-family:'Cormorant Garamond',Georgia,serif;font-size:22px;color:#0C1526;font-weight:400;font-style:italic;">Kendell &amp; Maddie</p></td></tr><tr><td style="padding:24px 40px 32px 40px;background-color:#FAF8F4;"><p style="margin:0;font-family:Georgia,serif;font-size:13px;color:#787878;line-height:1.55;font-style:italic;">P.S. We're <a href="https://instagram.com/lakesaltbartending" style="color:#C9A96E;text-decoration:none;">@lakesaltbartending</a> on Instagram &mdash; recipes, drink-making videos, and behind-the-scenes from weddings all summer. Come along for the ride.</p></td></tr><tr><td align="center" style="background-color:#0C1526;padding:28px 24px;"><div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:18px;letter-spacing:3px;color:#FAF8F4;font-weight:300;">LAKE&nbsp;<span style="color:#C9A96E;">SALT</span></div><div style="font-family:Georgia,serif;font-size:10px;letter-spacing:2px;color:#C9A96E;text-transform:uppercase;margin-top:8px;">Your Event, Perfectly Poured</div><div style="font-family:Georgia,serif;font-size:11px;color:#F2E8D5;margin-top:14px;line-height:1.6;"><a href="https://lakesalt.us" style="color:#F2E8D5;text-decoration:none;">lakesalt.us</a> &middot; <a href="https://instagram.com/lakesaltbartending" style="color:#F2E8D5;text-decoration:none;">@lakesaltbartending</a> &middot; <a href="mailto:contact@lakesalt.us" style="color:#F2E8D5;text-decoration:none;">contact@lakesalt.us</a></div><div style="font-family:Georgia,serif;font-size:10px;color:#787878;margin-top:16px;">TIPS-certified &middot; Fully insured &middot; Wasatch Front, Utah</div></td></tr></table></td></tr></table>`;
}

const REPLY_ASK_DEFAULT = `Or just hit reply with your guest count, venue, time, and drink vibe &mdash; I'll have a custom quote in your inbox within 24 hours.`;
const REPLY_ASK_NODATE = `Or hit reply with your target date (or season + year), guest count, venue or city, and drinks you love &mdash; I'll have a custom quote in your inbox within 24 hours.`;

// Build per-cohort variants
function hotDraft(r) {
  return {
    to: r.email,
    subject: `Saw you at the booth, ${r.name} — quick note about your ${r.month} wedding`,
    html: buildHtml({
      firstName: r.name,
      stagePara: `Your <strong>${r.date}</strong> wedding is ${r.weeks} weeks out, which means you're in the "lock things down NOW" zone &mdash; and drink catering is one of those things that quietly disappears off the planner list once it's handled.`,
      offerTagline: `Book by <strong style="color:#C9A96E;">June 9</strong> &middot; A typical $150&ndash;$300+ in savings<br>After that, ${r.month} weekends start filling fast.`,
      signoffLine: `Congrats again on the ${r.date} wedding &mdash; talk soon.`,
      replyAsk: REPLY_ASK_DEFAULT,
    }),
  };
}

function warmDraft(r) {
  return {
    to: r.email,
    subject: `Saw you at the booth, ${r.name} — quick note about your ${r.month} wedding`,
    html: buildHtml({
      firstName: r.name,
      stagePara: `Your <strong>${r.date}</strong> wedding is about ${r.months} months out, which is honestly the sweet spot &mdash; far enough out that you have your pick of dates and vendors, close enough that locking things in now means you can stop thinking about them. Drink catering is one of those things that quietly disappears off the planner list once it's handled, and 6-12 months out is when smart couples start checking it off.`,
      offerTagline: `Book by <strong style="color:#C9A96E;">June 9</strong> &middot; A typical $150&ndash;$300+ in savings<br>Spots fill 6-12 months out routinely. Lock it in, sleep easy.`,
      signoffLine: `Congrats again on the ${r.date} wedding &mdash; talk soon.`,
      replyAsk: REPLY_ASK_DEFAULT,
    }),
  };
}

function coolDraft(r) {
  return {
    to: r.email,
    subject: `Saw you at the booth, ${r.name} — quick note about your ${r.month} wedding`,
    html: buildHtml({
      firstName: r.name,
      stagePara: `Your <strong>${r.date}</strong> wedding is about ${r.months} months out &mdash; and honestly, this is the smartest time to lock in vendors. Most couples wait until 6 months out, panic-book whoever's left, and end up paying more for less. Booking early means you get the date, the package, and the pricing you actually want.`,
      offerTagline: `Book by <strong style="color:#C9A96E;">June 9</strong> &middot; A typical $150&ndash;$300+ in savings<br>We're already booking 2027 weekends. Locking in now isn't early — it's smart.`,
      signoffLine: `Congrats again on the ${r.date} wedding &mdash; talk soon.`,
      replyAsk: REPLY_ASK_DEFAULT,
    }),
  };
}

function farDraft(r) {
  return {
    to: r.email,
    subject: `Saw you at the booth, ${r.name} — quick note about your ${r.month} wedding`,
    html: buildHtml({
      firstName: r.name,
      stagePara: `Your <strong>${r.date}</strong> wedding is still a ways out &mdash; which honestly puts you ahead of 95% of couples. Most people scramble in the last 6 months and end up with whoever's left. Locking your bar in this early means you get first pick on dates, drinks, and pricing, and you can stop thinking about it entirely.`,
      offerTagline: `Book by <strong style="color:#C9A96E;">June 9</strong> &middot; A typical $150&ndash;$300+ in savings<br>Yes, 2029 sounds far away — but the couples who book this far out have weddings that look perfect.`,
      signoffLine: `Congrats again on the ${r.date} wedding &mdash; talk soon.`,
      replyAsk: REPLY_ASK_DEFAULT,
    }),
  };
}

// Hailee is the raffle winner — gets a custom email that stacks
// 10% off on top of her gift card. Subject is intentionally low-key
// (we already celebrated the win in a previous email).
function hailee() {
  const r = { name: 'Hailee', email: 'nielsenhailee8@gmail.com', date: 'September 15', weeks: 17, month: 'September' };
  return {
    to: r.email,
    subject: `Hailee — quick note about your September 15 wedding`,
    html: buildHtml({
      firstName: r.name,
      stagePara: `Your <strong>${r.date}</strong> wedding is about ${r.weeks} weeks out, which puts you in the "lock things in NOW" zone &mdash; and as our raffle winner, I want to make sure you actually get to enjoy a Lake Salt bar at it. So I'm stacking a second prize on top of your $50 gift card: <strong style="color:#C9A96E;">10% off your wedding bar</strong>. Both yours, both stackable.`,
      offerTagline: `$50 gift card + 10% off your bar &middot; Stacked together<br>A typical $200&ndash;$350+ in total savings &middot; September dates fill fast.`,
      signoffLine: `Congrats again on the ${r.date} wedding &mdash; talk soon.`,
      replyAsk: `Or just hit reply with your guest count, venue, start time, and the drink vibe you're going for &mdash; I'll have a custom quote (with your discount already baked in) in your inbox within 24 hours.`,
    }),
  };
}

function nodateDraft(r) {
  return {
    to: r.email,
    subject: `Saw you at the booth, ${r.name} — let's get your wedding on the calendar`,
    html: buildHtml({
      firstName: r.name,
      stagePara: `Since you didn't have a date locked in when you entered the raffle, I'll keep this short: when you do pick your date, you'll want drink catering sorted early. It's one of those things that quietly disappears off the planner list once it's handled.`,
      offerTagline: `Book by <strong style="color:#C9A96E;">June 9</strong> &middot; A typical $150&ndash;$300+ in savings<br>Even if you don't have a date yet, we can pencil you in and finalize once you've locked one.`,
      signoffLine: `Congrats again on the upcoming wedding &mdash; talk soon.`,
      replyAsk: REPLY_ASK_NODATE,
    }),
  };
}

// ─────────────────────────────────────────────────────────────────────
// Gmail draft creation
// ─────────────────────────────────────────────────────────────────────
function encodeHeader(str) {
  // RFC 2047 encoded-word for headers containing non-ASCII (e.g., em-dash).
  // Format: =?UTF-8?B?<base64>?=
  // Only encode if the string contains non-ASCII characters.
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(str)) return str;
  return `=?UTF-8?B?${Buffer.from(str, 'utf-8').toString('base64')}?=`;
}

function buildRawMessage({ to, subject, html, from = 'contact@lakesalt.us' }) {
  // RFC 2822 message with HTML body, base64url-encoded for Gmail API
  const message = [
    `From: Lake Salt Drink Catering <${from}>`,
    `To: ${to}`,
    `Subject: ${encodeHeader(subject)}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/html; charset=UTF-8`,
    `Content-Transfer-Encoding: 8bit`,
    ``,
    html,
  ].join('\r\n');
  return Buffer.from(message, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function createDraft(gmail, draft) {
  const raw = buildRawMessage(draft);
  const res = await gmail.users.drafts.create({
    userId: 'me',
    requestBody: { message: { raw } },
  });
  return res.data.id;
}

async function listExistingDrafts(gmail) {
  // Get all existing drafts to check for duplicates
  const subjects = new Set();
  let pageToken;
  do {
    const res = await gmail.users.drafts.list({
      userId: 'me',
      maxResults: 100,
      pageToken,
    });
    for (const d of (res.data.drafts || [])) {
      const msg = await gmail.users.messages.get({
        userId: 'me',
        id: d.message.id,
        format: 'metadata',
        metadataHeaders: ['Subject', 'To'],
      });
      const headers = msg.data.payload.headers;
      const s = headers.find(h => h.name === 'Subject')?.value || '';
      const t = headers.find(h => h.name === 'To')?.value || '';
      subjects.add(`${s}::${t}`);
    }
    pageToken = res.data.nextPageToken;
  } while (pageToken);
  return subjects;
}

// ─────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────
async function deleteBrokenDrafts(gmail) {
  // Delete drafts whose subjects contain mojibake (â€" instead of —).
  console.log(`\nScanning for broken-subject drafts to delete...`);
  let pageToken;
  let deleted = 0;
  do {
    const res = await gmail.users.drafts.list({
      userId: 'me',
      maxResults: 100,
      pageToken,
    });
    for (const d of (res.data.drafts || [])) {
      const msg = await gmail.users.messages.get({
        userId: 'me',
        id: d.message.id,
        format: 'metadata',
        metadataHeaders: ['Subject'],
      });
      const s = msg.data.payload.headers.find(h => h.name === 'Subject')?.value || '';
      if (s.startsWith('Saw you at the booth') && /â€/.test(s)) {
        await gmail.users.drafts.delete({ userId: 'me', id: d.id });
        console.log(`  deleted: ${s}`);
        deleted++;
      }
    }
    pageToken = res.data.nextPageToken;
  } while (pageToken);
  console.log(`Deleted ${deleted} broken drafts.\n`);
}

// Delete ALL cohort drafts (any "Saw you at the booth" or Hailee variants),
// regardless of encoding. Used when we're rebuilding from scratch.
async function deleteAllCohortDrafts(gmail) {
  console.log(`\nScanning for ALL cohort drafts to delete...`);
  let pageToken;
  let deleted = 0;
  do {
    const res = await gmail.users.drafts.list({
      userId: 'me',
      maxResults: 100,
      pageToken,
    });
    for (const d of (res.data.drafts || [])) {
      const msg = await gmail.users.messages.get({
        userId: 'me',
        id: d.message.id,
        format: 'metadata',
        metadataHeaders: ['Subject'],
      });
      const s = msg.data.payload.headers.find(h => h.name === 'Subject')?.value || '';
      if (s.startsWith('Saw you at the booth') ||
          s.startsWith('Hailee — quick note') ||
          s.startsWith('You won')) {
        await gmail.users.drafts.delete({ userId: 'me', id: d.id });
        console.log(`  deleted: ${s}`);
        deleted++;
      }
    }
    pageToken = res.data.nextPageToken;
  } while (pageToken);
  console.log(`Deleted ${deleted} cohort drafts.\n`);
}

// ─────────────────────────────────────────────────────────────────────
// Send a single test email to a target address (preview the template)
// ─────────────────────────────────────────────────────────────────────
async function sendTestEmail(gmail, toAddress) {
  const sample = hotDraft(COHORT_HOT[0]); // build using first HOT recipient's variables
  sample.to = toAddress;
  sample.subject = `[TEST] ${sample.subject}`;
  const raw = buildRawMessage(sample);
  const res = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw },
  });
  console.log(`\n✓ Test sent to ${toAddress}  [msg ${res.data.id}]`);
  console.log(`Subject: ${sample.subject}\n`);
}

// ─────────────────────────────────────────────────────────────────────
// Send all existing cohort drafts, spaced out to avoid velocity flags
// ─────────────────────────────────────────────────────────────────────
async function sendAllPaced(gmail, secondsBetween = 40) {
  // Find all cohort drafts in the Drafts folder
  console.log(`\nScanning Drafts for cohort emails...`);
  const toSend = [];
  let pageToken;
  do {
    const res = await gmail.users.drafts.list({ userId: 'me', maxResults: 100, pageToken });
    for (const d of (res.data.drafts || [])) {
      const msg = await gmail.users.messages.get({
        userId: 'me',
        id: d.message.id,
        format: 'metadata',
        metadataHeaders: ['Subject', 'To'],
      });
      const headers = msg.data.payload.headers;
      const s = headers.find(h => h.name === 'Subject')?.value || '';
      const t = headers.find(h => h.name === 'To')?.value || '';
      if (s.startsWith('Saw you at the booth') || s.startsWith('Hailee — quick note')) {
        toSend.push({ id: d.id, subject: s, to: t });
      }
    }
    pageToken = res.data.nextPageToken;
  } while (pageToken);

  console.log(`Found ${toSend.length} cohort drafts to send.`);
  const totalMin = Math.round((toSend.length * secondsBetween) / 60);
  console.log(`Pacing: ${secondsBetween}s between sends · estimated ${totalMin} min total.\n`);

  let sent = 0;
  const failed = [];
  for (let i = 0; i < toSend.length; i++) {
    const d = toSend[i];
    try {
      const res = await gmail.users.drafts.send({
        userId: 'me',
        requestBody: { id: d.id },
      });
      sent++;
      const ts = new Date().toISOString().slice(11, 19);
      console.log(`[${ts}] ✓ (${sent}/${toSend.length}) ${d.subject}  →  ${d.to}`);
    } catch (err) {
      failed.push({ to: d.to, error: err.message });
      console.error(`        ✗ FAIL ${d.to}: ${err.message}`);
    }
    // Pause between sends unless we're on the last one
    if (i < toSend.length - 1) {
      await new Promise(r => setTimeout(r, secondsBetween * 1000));
    }
  }

  console.log(`\n─────────────────`);
  console.log(`Sent: ${sent}`);
  console.log(`Failed: ${failed.length}`);
  if (failed.length) console.log(failed);
}

(async () => {
  const auth = await authorize();
  const gmail = google.gmail({ version: 'v1', auth });

  // --test=email@addr  → send one preview email to that address and exit
  const testArg = process.argv.find(a => a.startsWith('--test='));
  if (testArg) {
    const target = testArg.split('=')[1];
    await sendTestEmail(gmail, target);
    return;
  }

  // --send-all  → send every cohort draft in the Drafts folder, paced
  if (process.argv.includes('--send-all')) {
    const paceArg = process.argv.find(a => a.startsWith('--pace='));
    const pace = paceArg ? parseInt(paceArg.split('=')[1], 10) : 40;
    await sendAllPaced(gmail, pace);
    return;
  }

  if (process.argv.includes('--cleanup')) {
    await deleteBrokenDrafts(gmail);
  }

  if (process.argv.includes('--rebuild')) {
    // Delete EVERY existing cohort draft (good or bad) before rebuilding
    await deleteAllCohortDrafts(gmail);
  }

  // Build all drafts with their cohort label so we can schedule by cohort.
  const allDrafts = [
    ...COHORT_HOT.map(r => ({ ...hotDraft(r), cohort: 'HOT' })),
    ...COHORT_WARM.map(r => ({ ...warmDraft(r), cohort: 'WARM' })),
    ...COHORT_COOL.map(r => ({ ...coolDraft(r), cohort: 'COOL' })),
    ...COHORT_FAR.map(r => ({ ...farDraft(r), cohort: 'FAR' })),
    ...COHORT_NODATE.map(r => ({ ...nodateDraft(r), cohort: 'NODATE' })),
    { ...hailee(), cohort: 'HAILEE' },
  ];

  console.log(`\nTotal drafts to create: ${allDrafts.length}`);
  console.log(`  HOT: ${COHORT_HOT.length}`);
  console.log(`  WARM: ${COHORT_WARM.length}`);
  console.log(`  COOL: ${COHORT_COOL.length}`);
  console.log(`  FAR (18+mo): ${COHORT_FAR.length}`);
  console.log(`  NO-DATE: ${COHORT_NODATE.length}`);

  console.log(`\nFetching existing drafts to skip duplicates...`);
  let existing;
  try {
    existing = await listExistingDrafts(gmail);
    console.log(`Found ${existing.size} existing drafts.`);
  } catch (err) {
    console.warn(`Couldn't list existing drafts (${err.message}). Proceeding without dedup.`);
    existing = new Set();
  }

  let created = 0;
  let skipped = 0;
  const failures = [];

  for (const draft of allDrafts) {
    const key = `${draft.subject}::${draft.to}`;
    if (existing.has(key)) {
      console.log(`SKIP (exists): ${draft.subject}`);
      skipped++;
      continue;
    }
    try {
      const id = await createDraft(gmail, draft);
      console.log(`✓ ${draft.subject}  →  ${draft.to}  [${id}]`);
      created++;
    } catch (err) {
      console.error(`✗ ${draft.to}: ${err.message}`);
      failures.push({ to: draft.to, error: err.message });
    }
    // Tiny throttle to be polite
    await new Promise(r => setTimeout(r, 100));
  }

  console.log(`\n─────────────────`);
  console.log(`Created: ${created}`);
  console.log(`Skipped (already existed): ${skipped}`);
  console.log(`Failed: ${failures.length}`);
  if (failures.length) console.log(failures);
  console.log(`\nOpen Gmail → contact@lakesalt.us → Drafts to review.`);
})().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
