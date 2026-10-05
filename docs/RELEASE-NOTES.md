NovaTerm for Windows x64, with bounded terminal output transport and widget polling.

- Terminal output uses parser acknowledgements, with at most 256 KiB awaiting parsing per session.
- Widget commands share a two-process limit, five-second deadline and bounded output.
- English plugin API v1, typed SDK source and local Git branch/output explainer examples.
- NSIS setup and MSI installers. `SHA256SUMS.txt` covers both installers.

Installers are unsigned. Linux and macOS installers are not included. Controlled
before/after CPU and memory measurements and interactive Windows acceptance are
still pending; no measured percentage reduction is claimed.

This release is created as a draft. Review installation, terminal interaction,
split panes, plugin permissions and resource measurements before publication.
