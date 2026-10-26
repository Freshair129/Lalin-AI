# Lalin Play Remote TLS feasibility harness

This isolated package checks browser secure-context, camera-permission and same-origin WSS capabilities on one selected private IPv4 interface. It is a feasibility harness only: it has no Lalin pairing, grant, product session, playback, queue, audio, file or account API.

## Runtime

Requires exactly Node.js 24.20.0. Install and verify only from this directory:

```powershell
npm ci --ignore-scripts --no-audit --no-fund
npm test
npm run build
```

The HTTPS/WSS listener is opt-in. Choose exactly one explicit origin mode; the CLI rejects requests that omit both modes or provide both. Do not start the listener until an operator has supplied a certificate and private key outside the repository.

Hostname mode uses an owner-controlled public FQDN and a normal publicly trusted Web-PKI certificate with exactly one matching DNS SAN. `remote.your-domain.tld` below is only a placeholder; replace it with a name the operator controls. For example:

```powershell
npm start -- --bind 192.168.1.20 --origin-host remote.your-domain.tld --port 4174 --cert C:\operator\certs\remote.pem --key C:\operator\certs\remote-key.pem
```

IP mode requires the origin IP to equal the selected bind address and the certificate to contain exactly one matching iPAddress SAN:

```powershell
npm start -- --bind 192.168.1.20 --origin-ip 192.168.1.20 --port 4174 --cert C:\operator\certs\remote-ip.pem --key C:\operator\certs\remote-ip-key.pem
```

The harness verifies SAN cardinality and exact identity, but it cannot prove domain ownership, issuer trust or the certificate chain. Browser trust and real iPhone/Android trials on the target LAN are still required. This package does not create certificates or alter trust stores.

`--bind` must be an RFC1918 IPv4 address assigned to a local interface. Hostname mode accepts only public FQDN syntax, rejects internal/reserved names, and requires system DNS to resolve solely to that bind address. IP mode must exactly match the bind. Certificate and key paths must be absolute, distinct, regular files outside the repository. Startup fails closed when a check fails. The server binds only to the requested address; there is no public, wildcard, loopback or HTTP fallback.

The page serves only three static resources. Its WSS endpoint accepts only exact same-origin upgrades at `/probe`; compression is disabled, the total active probe cap is eight, and each probe has an absolute 15-second deadline. The browser sends one random nonce and checks a matching acknowledgement. Probe payloads are not logged or retained. Camera permission is queried where supported and requested only after an explicit button press; any temporary video tracks are stopped immediately. The page defaults to ENG and offers a nonpersistent ENG/TH toggle.

Tests use injected interfaces, timers and handler fakes. They do not open a network listener. Real browser trust, iPhone, Android and LAN trials remain separate evidence and are not represented by unit tests or a successful build.
