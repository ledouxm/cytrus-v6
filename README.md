# cytrus-v6

Download a game from Ankama Games with a single shell command

# Install

`npm install -g cytrus-v6`

# Basic usage

`cytrus-v6 version --game retro`

`cytrus-v6 download --game dofus --output ./output --select "DofusInvoker.swf,**/*.d2i`

# API Reference

```
> cytrus-v6 version --help
Usage: cytrus-v6 version [--game=]

Options:
      --version   Show version number                                                     [boolean]
      --help      Show help                                                               [boolean]
  -g, --game      Game to download (dofus, retro, ...)                  [string] [default: "dofus"]
  -p, --platform  Platform to download (windows, darwin, linux)       [string] [default: "windows"]
```

```
> cytrus-v6 download --help
Usage: cytrus-v6 download [options]

Options:
      --version   Show version number                                                     [boolean]
      --help      Show help                                                               [boolean]
  -s, --select    Comma separated list of files to download                                [string]
  -g, --game      Game to download (dofus, retro, ...)                  [string] [default: "dofus"]
  -p, --platform  Platform to download (windows, darwin, linux)       [string] [default: "windows"]
  -f, --force     If enabled, existing files will be overwriten          [boolean] [default: false]
  -o, --output    Output folder                                      [string] [default: "./output"]
```
