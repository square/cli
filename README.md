# Square CLI

The Square CLI (`square`) gives you and your AI agents command-line access to
the public Square API: catalog, orders, payments, customers, inventory, and
more. Every command follows a predictable shape and returns structured output
you can pipe, filter, and hand to a model.

> [!NOTE]
> The Square CLI is in Beta. To give feedback or report a bug,
> [open an issue](https://github.com/square/cli/issues).

**Documentation:** [developer.squareup.com/docs/cli](https://developer.squareup.com/docs/cli)

## Install

Install from npm (requires [Node.js](https://nodejs.org/)):

```bash
npm install -g @square/cli
square --version
```

Or run it without installing:

```bash
npx -y @square/cli --help
```

### Standalone binaries

Prebuilt binaries for macOS, Linux, and Windows are attached to each
[release](https://github.com/square/cli/releases). Download the one for your
platform, verify it against `checksums.txt`, and put it on your `PATH`:

```bash
shasum -a 256 --check --ignore-missing checksums.txt
chmod +x square-darwin-arm64
xattr -d com.apple.quarantine square-darwin-arm64   # only if you downloaded it in a browser
mv square-darwin-arm64 /usr/local/bin/square
```

Linux binaries need glibc (for example, Debian or Ubuntu). Alpine and other
musl-based distributions aren't supported.

If you redistribute a binary, include `THIRD-PARTY-NOTICES.md` from the same
release.

## Authenticate

Sign in with your Square account in the browser (OAuth with PKCE):

```bash
square auth login
square auth status
```

If the CLI can't open a browser, run `square auth login --no-open` to print the
authorization URL instead. Sign-in returns to `http://localhost:5000` on the
machine running the CLI, so on a remote host, forward that port first
(`ssh -L 5000:localhost:5000 HOST`) and open the URL in your local browser.

The CLI doesn't accept access tokens. It ignores the `SQUARE_ACCESS_TOKEN`
environment variable. To call Square from CI or a server with an access token,
use the [Square API](https://developer.squareup.com/docs/build-basics/access-tokens)
directly.

See [Authentication](https://developer.squareup.com/docs/cli#authentication)
for all options.

## Usage

Commands follow the shape `square <domain> <resource> <verb> [args] [options]`:

```bash
square catalog item list --limit 10
square payments payment get PAYMENT_ID
square orders order search --location-ids LOCATION_ID
```

Run `--help` at any level to see what's available:

```bash
square --help
square catalog --help
square catalog item --help
```

For every command, see the
[command reference](https://developer.squareup.com/docs/cli/command-reference).

Output is JSON by default. Use `--format` for `toon`, `yaml`, `md`, or `jsonl`,
and `--filter-output` to keep only the fields you need:

```bash
square catalog item list --filter-output 'objects[].id,objects[].itemData.name'
```

## Use with AI agents

```bash
square --llms --format json        # every command and its description
square catalog item list --schema  # JSON Schema for one command
square skills add                  # sync skill files into your agent
```

The CLI doesn't run as an MCP server. To connect an MCP client to Square, use
the [Square MCP server](https://developer.squareup.com/docs/mcp).

## License

The Square CLI is proprietary software. Your use is subject to the
[Square Developer Terms of Service](https://squareup.com/us/en/legal/general/developers).
This repository doesn't contain the CLI source code. See [LICENSE](LICENSE).
