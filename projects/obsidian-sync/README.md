# Obsidian Sync (CouchDB 3.3.3)

Self-hosted CouchDB hub for Obsidian Self-hosted LiveSync, following the same Docker + Tailscale pattern used in the main vault deployment plan.

## Files

- `docker-compose.yml` - CouchDB service (`couchdb:3.3.3`) on external `tailscale` Docker network
- `.env` - local configuration placeholders (no secrets committed)

## Homeserver Deployment (Debian 12 Mini PC)

### 1) Prepare directory

```bash
mkdir -p ~/homelab/obsidian-sync
cd ~/homelab/obsidian-sync
# copy this project's files into this directory
```

### 2) Configure environment

Edit `.env` and set a strong 32-character password:

```env
COUCHDB_USER=obsidian_admin
COUCHDB_PASSWORD=<set-strong-password>
COUCHDB_DOMAIN=obsidian-sync.jay-hirajoshi.ts.net
```

### 3) Ensure Tailscale Docker network exists

```bash
docker network create tailscale || true
```

### 4) Start CouchDB

```bash
docker compose up -d
```

### 5) Validate from a Tailscale-connected device

```bash
curl -u "$COUCHDB_USER:$COUCHDB_PASSWORD" "http://$COUCHDB_DOMAIN:5984/_up"
```

Expected response contains: `{"status":"ok"}`.

## Obsidian LiveSync Setup Pattern

### Mac (primary/source)

1. Install **Self-hosted LiveSync** plugin.
2. Run **Setup Wizard** -> **Discard existing preferences and setup**.
3. CouchDB URI: `http://obsidian-sync.jay-hirajoshi.ts.net:5984`
4. Enter `COUCHDB_USER` / `COUCHDB_PASSWORD`.
5. Database name: `obsidian-vault`.
6. Run **Test connection** and **Check database configuration** (apply suggested fixes).
7. Set sync mode to **LiveSync** and wait for initial upload to complete.
8. Export setup URI with passphrase for Android.

### Android (secondary)

1. Install **Self-hosted LiveSync** plugin.
2. Setup Wizard -> **Open setup URI** -> paste URI from Mac.
3. Enter passphrase.
4. Choose **Start as a new replica**.
5. Set Obsidian app battery mode to **Unrestricted** on Android.

## Operations Notes

- Mini PC only runs CouchDB; Obsidian app is not required on server.
- Keep `./data` in your regular backup scope.
- No public port exposure in Compose; access is through Tailscale.
