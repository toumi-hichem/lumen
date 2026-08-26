# Local `lumen.test` domain for the dev server

Open the web dev server at `http://lumen.test` (no port) on your local machine
instead of `http://localhost:5183`. This is local-only: nothing is exposed
beyond your machine, and no DNS is involved.

## Why `.test` and not `.com`

`.test` is a reserved TLD (RFC 6761) that browsers never force to HTTPS. A real
domain like `lumen.com` gets auto-upgraded to `https://` by HTTPS-First / HSTS,
which breaks a plain-http dev proxy.

## How it works

Linux/macOS:

```
http://lumen.test  ->  Apache vhost on :80  ->  Vite dev server on :5183
```

Windows:

```
http://lumen.test  ->  Caddy (Caddyfile at repo root) on :80  ->  Vite dev server on :5183
```

- The hosts file resolves `lumen.test` to `127.0.0.1`.
- The local :80 server reverse-proxies the `lumen.test` vhost to the Vite dev
  server, forwarding WebSocket upgrades so HMR works.
- `server.allowedHosts` in `vite.config.ts` lists `lumen.test` so Vite accepts
  the forwarded `Host` header (it blocks unknown hosts as a DNS-rebinding
  guard).

## One-time setup (Linux/macOS)

1. Map the name to loopback:

   ```bash
   echo '127.0.0.1 lumen.test' | sudo tee -a /etc/hosts
   ```

2. Enable the Apache proxy modules (`proxy_wstunnel` is what carries Vite HMR):

   ```bash
   sudo a2enmod proxy proxy_http proxy_wstunnel rewrite
   ```

3. Install the vhost below as `/etc/apache2/sites-available/lumen.conf`, enable
   it, and reload:

   ```bash
   sudo a2ensite lumen.conf
   sudo apache2ctl configtest && sudo systemctl reload apache2
   ```

`server.allowedHosts` is already set in `vite.config.ts`; restart the dev server
(`just dev-stop; just dev-bg`) after changing it.

## One-time setup (Windows)

Apache/nginx have no clean native install on Windows, so this uses
[Caddy](https://caddyserver.com) instead — a single binary that reverse-proxies
WebSockets automatically, no extra module needed.

1. Install Caddy (already done if you're reading this after asking Claude to
   set it up):

   ```powershell
   winget install --id CaddyServer.Caddy -e
   ```

   Restart your terminal afterward so the updated PATH takes effect.

2. Map the name to loopback. This edits a protected system file, so it needs
   an **Admin PowerShell** (right-click Windows Terminal/PowerShell ->
   "Run as administrator"):

   ```powershell
   Add-Content -Path "$env:WINDIR\System32\drivers\etc\hosts" -Value "127.0.0.1 lumen.test"
   ```

3. Start the proxy (from an ordinary, non-admin shell — Windows doesn't
   reserve port 80 for admins the way Unix does):

   ```powershell
   just proxy-bg
   ```

   Stop it later with `just proxy-stop`. The `Caddyfile` at the repo root
   holds the config:

   ```
   lumen.test:80 {
       reverse_proxy 127.0.0.1:5183
   }
   ```

`server.allowedHosts` is already set in `vite.config.ts`; restart the dev server
(`just dev-stop; just dev-bg`) after changing it.

## The Apache vhost (Linux/macOS)

```apache
# Reverse-proxy lumen.test (port 80) to the local Vite dev server on :5183.
# Matched by ServerName, so it coexists with other :80 vhosts without conflict.
# Requires modules: proxy, proxy_http, proxy_wstunnel, rewrite.
<VirtualHost *:80>
    ServerName lumen.test

    # Preserve "Host: lumen.test" so Vite's allowedHosts check accepts it.
    ProxyPreserveHost On
    ProxyRequests Off

    # Vite HMR uses a WebSocket. Route Upgrade requests over ws:// (needs
    # proxy_wstunnel); without this the page loads but hot reload never
    # connects.
    RewriteEngine On
    RewriteCond %{HTTP:Upgrade} =websocket [NC]
    RewriteCond %{HTTP:Connection} upgrade [NC]
    RewriteRule ^/?(.*) "ws://127.0.0.1:5183/$1" [P,L]

    # Everything else is plain HTTP to the dev server.
    ProxyPass / http://127.0.0.1:5183/
    ProxyPassReverse / http://127.0.0.1:5183/

    # Dev builds can be slow to first-compile a chunk; don't cut them off.
    ProxyTimeout 600

    ErrorLog ${APACHE_LOG_DIR}/lumen-error.log
    CustomLog ${APACHE_LOG_DIR}/lumen-access.log combined
</VirtualHost>
```

## Notes

- If the port `5183` changes (`web_port` in the `justfile`), update the two
  proxy targets above and `server.allowedHosts` stays the same.
- If a browser still upgrades to HTTPS, clear any cached upgrade at
  `chrome://net-internals/#hsts`.
