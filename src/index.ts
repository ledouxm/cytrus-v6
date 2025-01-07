#! /usr/bin/env node

import { hideBin } from "yargs/helpers";
import yargs from "yargs/yargs";
import { download, DownloadProps } from "./commands/download";
import { getLatestVersion, GetLatestVersionProps } from "./commands/version";

yargs(hideBin(process.argv))
    .scriptName("cytrus-v6")
    .usage("Usage: $0 <command> [options]")
    .command(
        "download",
        "Download files from Ankama CDN",
        (yargs) => {
            yargs
                .usage("Usage: $0 download [options]")
                .option("select", {
                    type: "string",
                    alias: "s",
                    description: "Comma separated list of files to download",
                })
                .option("game", {
                    default: "dofus",
                    alias: "g",
                    type: "string",
                    description: "Game to download (dofus, retro, ...)",
                })
                .option("platform", {
                    default: "windows",
                    type: "string",
                    alias: "p",
                    description:
                        "Platform to download (windows, darwin, linux)",
                })
                .option("release", {
                    default: "main",
                    type: "string",
                    alias: "r",
                    description: "Release to download (main, beta, dofus3)",
                })
                .option("output", {
                    default: "./output",
                    alias: "o",
                    type: "string",
                    description: "Output folder",
                })
                .option("debug", {
                    hidden: true,
                    type: "boolean",
                    description: "Will throw on hash mismatch",
                });
        },
        async (argv) => {
            const props = argv as any as CommandTypes["download"];
            const time = Date.now();

            const version = await download(props);

            console.log(
                "Downloaded",
                `${props.game}-${props.release}-${version}`,
                "in",
                Math.round((Date.now() - time) / 1000) + "s"
            );
        }
    )
    .command(
        "version",
        "Show latest game version",
        (yargs) => {
            yargs
                .usage("Usage: $0 version [--game=]")
                .option("game", {
                    default: "dofus",
                    alias: "g",
                    type: "string",
                    description: "Game to download (dofus, retro, ...)",
                })
                .option("platform", {
                    default: "windows",
                    type: "string",
                    alias: "p",
                    description:
                        "Platform to download (windows, darwin, linux)",
                })
                .option("release", {
                    default: "main",
                    type: "string",
                    alias: "r",
                    description: "Release to download (main, beta, dofus3)",
                });
        },
        async (argv) => {
            const props = argv as any as CommandTypes["version"];

            const version = await getLatestVersion(props);
            console.log(version);
        }
    )
    .help().argv;

interface CommandTypes {
    download: DownloadProps;
    version: GetLatestVersionProps;
}
