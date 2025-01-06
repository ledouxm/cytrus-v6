#! /usr/bin/env node

import yargs from "yargs/yargs";
import { hideBin } from "yargs/helpers";
import {
    GameNames,
    Platforms,
    getBundleChunks,
    getLatestVersion,
    getManifestBinaryFile,
} from "./api";
import { Manifest } from "./flatbuffers/manifest";
import { ByteBuffer } from "flatbuffers";
import os from "os";
import path from "path";
import { promises as fs } from "fs";
import {
    createFoldersRecursively,
    getStringFromHashArray,
    safeRmDir,
} from "./utils";
import { getTargetFilenamesAndChunkHashes } from "./targets";
import { chunk } from "pastable";
import { parseResponse } from "./cloudflare";
import { ManifestDownloader } from "./v2";

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
                    description: "Release to download (main, beta, dofus3...)",
                })
                .option("force", {
                    default: false,
                    alias: "f",
                    type: "boolean",
                    description:
                        "If enabled, existing files will be overwriten",
                })
                .option("output", {
                    default: "./output",
                    alias: "o",
                    type: "string",
                    description: "Output folder",
                });
        },
        async (argv) => {
            const { game, select, force, output, platform, release } =
                argv as any as CommandTypes["download"];

            const patterns = select?.split(",").map((x) => x.trim()) ?? ["*"];

            const chunkOutputFolder = path.join(os.tmpdir(), "cytrus-v6", game);
            const outputFolder = path.resolve(output);

            console.log("Downloading", game, "into", outputFolder);

            await createFoldersRecursively(chunkOutputFolder);
            await createFoldersRecursively(outputFolder);

            const version = await getLatestVersion(game, platform, release);
            const manifestBin = await getManifestBinaryFile(
                game,
                platform,
                release,
                version
            );
            const bb = new ByteBuffer(manifestBin);

            const manifest = Manifest.getRootAsManifest(bb);
            const downloader = new ManifestDownloader();

            await downloader.downloadSelectedFiles(manifest, {
                patterns,
                chunkSize: 20,
                concurrency: 10,
                outputFolder,
            });

            // const { filesToDownload, chunksToDownload } =
            //     await getTargetFilenamesAndChunkHashes({
            //         manifest,
            //         outputFolder,
            //         patterns,
            //         force,
            //     });

            // await downloadFragments(
            //     game,
            //     manifest,
            //     filesToDownload,
            //     chunksToDownload,
            //     chunkOutputFolder,
            //     outputFolder
            // );

            console.log("done");
        }
    )
    .command(
        "test",
        "test",
        (yargs) => {},
        async () => {
            const result = await getBundleChunks(
                "dofus",
                "2ed6127d872f83f0bede4fd17fa9f229daaa34ca",
                "3142830-3211671, 3211672-3236349, 3236350-3256893, 3256894-3303385, 3303386-3370056, 3370057-3400079, 3400080-3466053, 3466054-3534345, 3534346-3553876, 3553877-3620546"
            );

            const str = result.toString("utf8");
            const parts: Buffer[] = [];

            // Split on boundary and process each part
            const boundaries = str
                .split("\n")
                .filter((line) => line.startsWith("--"));
            const boundary = boundaries[0];

            const sections = str.split(boundary).filter(Boolean);

            for (const section of sections) {
                if (section.includes("Content-Type")) {
                    // Find the actual content after headers
                    const contentStart = section.indexOf("\r\n\r\n") + 4;
                    if (contentStart > 4) {
                        const content = section.substring(contentStart);
                        parts.push(Buffer.from(content.trim()));
                    }
                }
            }

            console.log(parts.map((part) => part.toString("utf8", 0, 20)));
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
                    description: "Release to download (main, beta, dofus3...)",
                });
        },
        async (argv) => {
            const version = await getLatestVersion(
                argv.game as GameNames,
                argv.platform as Platforms,
                argv.release as string
            );
            console.log(version);
        }
    )
    .help().argv;

const downloadFragments = async (
    game: string,
    manifest: Manifest,
    filesToDownload: string[][],
    chunksToDownload: string[],
    chunkOutputFolder: string,
    outputFolder: string
) => {
    const downloadedChunks = new Set<string>();

    const tmpOutputFolder = path.join(os.tmpdir(), "cytrus-v6", game);
    await createFoldersRecursively(tmpOutputFolder);

    for (let i = 0; i < manifest.fragmentsLength(); i++) {
        const fragmentFiles = filesToDownload[i];
        console.log(
            `Processing fragment ${i + 1}/${manifest.fragmentsLength()}`
        );
        const fragment = manifest.fragments(i)!;

        for (let j = 0; j < fragment.bundlesLength(); j++) {
            const bundle = fragment.bundles(j)!;
            const bundleHash = getStringFromHashArray(bundle.hashArray()!);
            const bundleChunks = [];

            for (let k = 0; k < bundle.chunksLength(); k++) {
                const chunk = bundle.chunks(k)!;
                const hash = getStringFromHashArray(chunk.hashArray()!);

                if (!chunksToDownload.includes(hash)) continue;

                bundleChunks.push({
                    hash,
                    start: Number(chunk.offset()),
                    size: Number(chunk.size()),
                    range: `${chunk.offset()}-${
                        Number(chunk.offset()) + Number(chunk.size()) - 1
                    }`,
                });
            }

            if (bundleChunks.length === 0) continue;

            const chunkedGroups = chunk(bundleChunks, 10);
            for (const group of chunkedGroups) {
                const rangeString = group.map((c) => c.range).join(", ");

                const rawData = await getBundleChunks(
                    game,
                    bundleHash,
                    rangeString
                );
                const parsedChunks = parseResponse(rawData);

                for (const parsedChunk of parsedChunks) {
                    const matchingChunk = group.find(
                        (c) =>
                            c.start === parsedChunk.contentRange.start &&
                            c.start + c.size - 1 ===
                                parsedChunk.contentRange.end
                    );

                    if (!matchingChunk) {
                        throw new Error(
                            `Could not find matching chunk for range ${parsedChunk.contentRange.start}-${parsedChunk.contentRange.end}`
                        );
                    }

                    await fs.writeFile(
                        path.join(chunkOutputFolder, matchingChunk.hash),
                        parsedChunk.data as any
                    );

                    downloadedChunks.add(matchingChunk.hash);
                }
            }
        }

        for (let j = 0; j < fragment.filesLength(); j++) {
            const file = fragment.files(j)!;
            const fileHash = getStringFromHashArray(file.hashArray()!);

            if (!fragmentFiles.includes(fileHash)) continue;

            const name = file.name()!;
            const chunkData: Buffer[] = [];

            if (file.chunksLength() === 0) {
                if (!downloadedChunks.has(fileHash)) continue;

                const fileContent = await fs.readFile(
                    path.join(chunkOutputFolder, fileHash)
                );
                chunkData.push(fileContent);
            } else {
                let hasAllChunks = true;
                const fileChunks: string[] = [];

                for (let k = 0; k < file.chunksLength(); k++) {
                    const chunk = file.chunks(k)!;
                    const hash = getStringFromHashArray(chunk.hashArray()!);
                    fileChunks.push(hash);

                    if (!downloadedChunks.has(hash)) {
                        hasAllChunks = false;
                        break;
                    }
                }

                if (!hasAllChunks) continue;

                for (const hash of fileChunks) {
                    const fileContent = await fs.readFile(
                        path.join(chunkOutputFolder, hash)
                    );
                    chunkData.push(fileContent);
                }
            }

            const fileContent = Buffer.concat(chunkData as any);
            const filePath = path.join(outputFolder, name);

            await createFoldersRecursively(path.dirname(filePath));
            await fs.writeFile(filePath, fileContent as any);

            console.log(`Downloaded ${name}`);
        }
    }

    await safeRmDir(chunkOutputFolder);
};
interface CommandTypes {
    download: {
        select?: string;
        force?: boolean;
        game: GameNames;
        platform: Platforms;
        release: string;
        output: string;
    };
    version: {
        game: string;
    };
}
