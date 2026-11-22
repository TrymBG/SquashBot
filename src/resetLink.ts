// Entry point for `npm run reset-link -- friend@example.com`: prints a one-time link that lets that person choose a
// new password. Send it to them in a chat. Valid for 1 hour and only once; a new link replaces older ones.
// (There's no email sending, so the admin hands out the link. Later, an email could send the same link.)
import { databasePath, siteUrl } from "./config.js";
import { openDatabase } from "./db.js";
import { createPasswordReset, RESET_LINK_MINUTES } from "./services/authService.js";

const email = process.argv[2];
if (!email) {
  console.error("Usage: npm run reset-link -- friend@example.com");
  process.exit(1);
}

openDatabase(databasePath);
const token = createPasswordReset(email);
if (!token) {
  console.error(`No account with the email ${email}`);
  process.exit(1);
}
console.log(`Reset link for ${email} (valid ${RESET_LINK_MINUTES} minutes, works once):`);
console.log(`${siteUrl}/reset?token=${token}`);
if (!siteUrl) {
  console.log("(SITE_URL isn't set, so put the site's address in front.)");
}
