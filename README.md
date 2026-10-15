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
npm install -g @squareup/square-cli-public
square --version
```

Or run it without installing:

```bash
npx -y @squareup/square-cli-public --help
```

### Standalone binaries

Prebuilt binaries for macOS, Linux, and Windows are attached to each
[release](https://github.com/square/cli/releases). Download the one for your
platform, verify it against `checksums.txt`, and put it on your `PATH`:

```bash
shasum -a 256 --check --ignore-missing checksums.txt
chmod +x square-darwin-arm64
mv square-darwin-arm64 /usr/local/bin/square
```

If you redistribute a binary, include `THIRD-PARTY-NOTICES.md` from the same
release.

## Authenticate

Sign in with your Square account in the browser (OAuth with PKCE):

```bash
square auth login
square auth status
```

For CI and other non-interactive environments, use an access token from the
[Developer Console](https://developer.squareup.com/apps):

```bash
SQUARE_ACCESS_TOKEN=YOUR_SQUARE_ACCESS_TOKEN square catalog item list
```

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
