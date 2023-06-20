#! /usr/bin/env node

import yargs from "yargs/yargs";
import { hideBin } from "yargs/helpers";
import {
    GameNames,
    getBundleChunks,
    getLatestVersion,
    getManifestBinaryFile,
} from "./api";
import { Manifest } from "./flatbuffers/manifest";
import { ByteBuffer } from "flatbuffers";
import os from "os";
import path from "path";
import { promises as fs } from "fs";
import { Chunk } from "./flatbuffers/chunk";
import {
    createFoldersRecursively,
    getStringFromHashArray,
    safeRmDir,
} from "./utils";
import { getTargetFilenamesAndChunkHashes } from "./targets";
import { parseCloudflareResponse } from "./cloudflare";

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
            const { game, select, force, output } =
                argv as any as CommandTypes["download"];

            const patterns = select?.split(",").map((x) => x.trim());

            const chunkOutputFolder = path.join(os.tmpdir(), "cytrus-v6", game);
            const outputFolder = path.resolve(output);

            console.log("Downloading", game, "into", outputFolder);

            await createFoldersRecursively(chunkOutputFolder);
            await createFoldersRecursively(outputFolder);

            const version = await getLatestVersion(game);
            const manifestBin = await getManifestBinaryFile(game, version);
            const bb = new ByteBuffer(manifestBin);

            const manifest = Manifest.getRootAsManifest(bb);

            const { filesToDownload, chunksToDownload } =
                await getTargetFilenamesAndChunkHashes(
                    manifest,
                    outputFolder,
                    patterns
                );

            await downloadFragments(
                manifest,
                filesToDownload,
                chunksToDownload,
                chunkOutputFolder,
                outputFolder
            );
        }
    )
    .command(
        "version",
        "Show latest game version",
        (yargs) => {
            yargs.usage("Usage: $0 version [--game=]").option("game", {
                default: "dofus",
                alias: "g",
                type: "string",
                description: "Game to download (dofus, retro, ...)",
            });
        },
        async (argv) => {
            const version = await getLatestVersion(argv.game as GameNames);
            console.log(version);
        }
    )
    .help().argv;

const downloadFragments = async (
    manifest: Manifest,
    filesToDownload: string[][],
    chunksToDownload: string[],
    chunkOutputFolder: string,
    outputFolder: string
) => {
    for (let i = 0; i < manifest.fragmentsLength(); i++) {
        const fragmentFiles = filesToDownload[i];
        console.log(`Parsing fragment ${i}/${manifest.fragmentsLength()}`);
        const fragment = manifest.fragments(i)!;
        for (let j = 0; j < fragment.bundlesLength(); j++) {
            const bundle = fragment.bundles(j)!;
            const bundleChunks: Chunk[] = [];

            // process bundle so we know which to download
            for (let k = 0; k < bundle.chunksLength(); k++) {
                const chunk = bundle.chunks(k)!;
                const hash = getStringFromHashArray(chunk.hashArray()!);

                if (!chunksToDownload.includes(hash)) continue;

                bundleChunks.push(chunk);
            }

            if (bundleChunks.length === 0) continue;

            const chunkRange = bundleChunks.map((chunk) => ({
                hash: getStringFromHashArray(chunk.hashArray()!),
                range: `${chunk.offset()}-${
                    Number(chunk.offset()) + Number(chunk.size()) - 1
                }`,
            }));
            const bundleHash = getStringFromHashArray(bundle.hashArray()!);

            // download chunks
            const data = await getBundleChunks(
                bundleHash,
                chunkRange.map((c) => c.range).join(", ")
            );

            if (chunkRange.length === 1) {
                await fs.writeFile(
                    path.join(chunkOutputFolder, chunkRange[0].hash),
                    data
                );
                continue;
            }

            // process response
            const parsedChunks = parseCloudflareResponse(data, "");

            // write chunks to disk
            for (const parsedChunk of parsedChunks) {
                const hash = chunkRange.find(
                    (c) =>
                        c.range ===
                        `${parsedChunk.range.start}-${parsedChunk.range.end}`
                )!.hash;
                const chunk = parsedChunk.data;
                await fs.writeFile(path.join(chunkOutputFolder, hash), chunk);
            }
        }

        for (let j = 0; j < fragment.filesLength(); j++) {
            const file = fragment.files(j)!;
            const name = file.name()!;
            const fileHash = getStringFromHashArray(file.hashArray()!);

            if (!fragmentFiles.includes(fileHash)) continue;

            const chunkData = [];

            if (file.chunksLength() === 0) {
                const fileHash = getStringFromHashArray(file.hashArray()!);

                const fileContent = await fs.readFile(
                    path.join(chunkOutputFolder, fileHash)
                );

                chunkData.push(fileContent);
            }

            for (let k = 0; k < file.chunksLength(); k++) {
                const chunk = file.chunks(k)!;
                const hash = getStringFromHashArray(chunk.hashArray()!);

                const fileContent = await fs.readFile(
                    path.join(chunkOutputFolder, hash)
                );

                chunkData.push(fileContent);
            }

            const fileContent = Buffer.concat(chunkData);
            const filePath = path.join(outputFolder, name);

            await createFoldersRecursively(path.dirname(filePath));
            await fs.writeFile(filePath, fileContent);

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
        output: string;
    };
    version: {
        game: string;
    };
}
