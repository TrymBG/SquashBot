# Server setup (Hetzner VPS)

One-time setup of the production server: the bot + website run as one Node process behind Caddy (HTTPS),
started by systemd, with a nightly database backup. About an hour the first time.

Commands marked **laptop** run in WSL on your machine, **root** and **squash** run on the server.
If a step fails, copy the output and ask.

```
internet ──443──> Caddy (HTTPS, certificates) ──> 127.0.0.1:3000 Node: bot + API + website ──> /home/squash/data/squash.db
```

## 1. SSH key (laptop)
You log in to the server with a key instead of a password.
```bash
ls ~/.ssh/id_ed25519.pub || ssh-keygen -t ed25519 -C "trym@squash"   # make one if you don't have one (Enter for defaults)
cat ~/.ssh/id_ed25519.pub                                            # copy this line
```

## 2. Create the server (Hetzner Cloud Console, in the browser)
- Create a project, then **Add Server**.
- Location: **Helsinki** or **Falkenstein** (close to Norway). Image: **Ubuntu 24.04**.
- Type: the smallest/cheapest shared vCPU type is plenty (Arm or x86 both work).
- Networking: keep **IPv4** on (the free sslip.io address and Let's Encrypt need it).
- SSH keys: paste the line from step 1. Name: `squash`.
- Optional: enable **Backups** (Hetzner keeps daily copies of the whole server, off this machine; small extra cost).
- Create, then note the server's **IPv4 address** (below: `SERVER_IP`).

## 3. First login and basic security (root)
```bash
ssh root@SERVER_IP
apt update && apt upgrade -y                       # latest security fixes
adduser --disabled-password --gecos "" squash      # the user the app runs as (not root)
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable   # firewall: only SSH and web
sshd -T | grep -i passwordauthentication           # should say "no" (key login only)
systemctl is-enabled unattended-upgrades           # should say "enabled" (automatic security updates)
```

## 4. Install Node 24, git and Caddy (root)
```bash
curl -fsSL https://deb.nodesource.com/setup_24.x -o nodesource_setup.sh && bash nodesource_setup.sh
apt install -y nodejs git
node --version && which node                       # v24.x and /usr/bin/node (the systemd files expect this path)

apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install -y caddy
```
If the NodeSource or Caddy commands have changed, use the current ones from
https://github.com/nodesource/distributions and https://caddyserver.com/docs/install.

## 5. Get the code and configure it (squash)
```bash
su - squash
git clone https://github.com/TrymBG/SquashBot.git
mkdir -p ~/data/backups
nano ~/SquashBot/.env
```
Put this in `.env` (copy the Discord values from your laptop's `.env`):
```
DISCORD_TOKEN=...
CLIENT_ID=...
GUILD_ID=...
INVITE_CODE=pick-a-code-for-friends
SITE_URL=https://SERVER-IP-WITH-DASHES.sslip.io
NODE_ENV=production
WEB_DIST_PATH=web/dist
DATABASE_PATH=/home/squash/data/squash.db
BACKUP_DIR=/home/squash/data/backups
```
```bash
chmod 600 ~/SquashBot/.env                         # only the squash user can read the secrets
exit                                               # back to root
```

## 6. Move the real database (laptop)
**Stop the bot on your laptop first** (Ctrl+C on `npm run dev`), so no new matches arrive after the copy.
Two bots with the same token also fight each other, so from now on only the server runs it.
```bash
cd ~/squash-bot
npm run build && npm run backup                    # a safe snapshot of squash.db (includes the -wal contents)
ls backups/                                        # note the newest file name
scp backups/squash-<newest>.db root@SERVER_IP:/home/squash/data/squash.db
ssh root@SERVER_IP chown squash:squash /home/squash/data/squash.db
```

## 7. Install the service, the backup timer and the restart permission (root)
```bash
cp /home/squash/SquashBot/deploy/squash.service /home/squash/SquashBot/deploy/squash-backup.service /home/squash/SquashBot/deploy/squash-backup.timer /etc/systemd/system/
echo 'squash ALL=(root) NOPASSWD: /usr/bin/systemctl restart squash' > /etc/sudoers.d/squash   # lets deploy.sh restart the app, nothing else
chmod 440 /etc/sudoers.d/squash && visudo -c        # should say "parsed OK"
systemctl daemon-reload
systemctl enable squash squash-backup.timer
```

## 8. First deploy (squash)
```bash
su - squash
~/SquashBot/deploy/deploy.sh                       # pull, install, test, build, backup, restart, health check
exit
```
It should end with `==> Deployed: ...`. If not: `journalctl -u squash -n 50`.

## 9. HTTPS with Caddy (root)
```bash
cp /home/squash/SquashBot/deploy/Caddyfile /etc/caddy/Caddyfile
nano /etc/caddy/Caddyfile                          # replace squash.example.com with SERVER-IP-WITH-DASHES.sslip.io
systemctl reload caddy
journalctl -u caddy -n 30                          # look for "certificate obtained successfully"
systemctl start squash-backup.timer
```
`65-21-1-2.sslip.io` is a free name that points at `65.21.1.2`, so Caddy can get a real certificate before you
buy a domain. If Let's Encrypt refuses it, use a free DuckDNS name instead.

## 10. Check
- Open `https://SERVER-IP-WITH-DASHES.sslip.io`: leaderboard with your real players.
- Log in or sign up (`/signup?code=<INVITE_CODE>`), register a result.
- In Discord, `/ping` answers (now from the server).
- `systemctl list-timers squash-backup` shows the next backup.

## Later: deploying a new version
Merge the PR on GitHub, then:
```bash
ssh root@SERVER_IP
su - squash -c '~/SquashBot/deploy/deploy.sh'      # quotes: ~ must mean squash's home, not root's
```

## Someone forgot their password
There's no email sending, so you make a one-time link and send it to them (works once, for 1 hour):
```bash
ssh root@SERVER_IP
su - squash -c 'cd ~/SquashBot && npm run -s reset-link -- friend@example.com'
```
They open the link, choose a new password, and are logged out on every other device.

## Later: your own domain
Buy the domain, add an **A record** pointing at `SERVER_IP`, put the domain in `/etc/caddy/Caddyfile` instead of the
sslip.io name, `systemctl reload caddy`, and change `SITE_URL` in `.env` (then `systemctl restart squash`).
Logins are tied to the address, so everyone logs in once more.

## Useful commands
| What | Command |
|---|---|
| App status / logs | `systemctl status squash`, `journalctl -u squash -f` |
| Restart | `systemctl restart squash` |
| Backups | `ls /home/squash/data/backups`, run one now: `systemctl start squash-backup` |
| Restore a backup | `systemctl stop squash`, copy the backup over `/home/squash/data/squash.db` (delete `squash.db-wal`/`-shm`), `chown squash:squash`, `systemctl start squash` |
| Caddy logs | `journalctl -u caddy -n 50` |
