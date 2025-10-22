# cytrus-v6

### 🚀 Fully compatible with Dofus 3

Download a game from Ankama Games with a single shell command

# Install

`npm install -g cytrus-v6`

# Usage

```bash
cytrus-v6 version --game retro
```

```bash
cytrus-v6 download --game dofus --output ./output --select DofusInvoker.swf --select **/*.d2i
```

```bash
cytrus-v6 download --game dofus --release dofus3 --output ./output --platform=linux --select **/StreamingAssets/Content/Data/**/*.bundle
```

```bash
cytrus-v6 download --game dofus --release dofus3 --version 6.0_3.1.10.11
```

# API Reference

```bash
> cytrus-v6 version --help
Usage: cytrus-v6 version [--game=]

Options:
      --help      Show help                                                               [boolean]
  -g, --game      Game to download (dofus, retro, ...)                  [string] [default: "dofus"]
  -p, --platform  Platform to download (windows, darwin, linux)       [string] [default: "windows"]
  -r, --release   Release to download (main, beta, dofus3)               [string] [default: "main"]
```

```bash
> cytrus-v6 download --help
Usage: cytrus-v6 download [options]

Options:
      --help      Show help                                                               [boolean]
  -s, --select    Select files to download, can use wildcard character                      [array]
  -g, --game      Game to download (dofus, retro, ...)                  [string] [default: "dofus"]
  -p, --platform  Platform to download (windows, darwin, linux)       [string] [default: "windows"]
  -r, --release   Release to download (main, beta, dofus3)               [string] [default: "main"]
  -o, --output    Output folder                                      [string] [default: "./output"]
  -v, --version   Specific version to download                                             [string]
```
