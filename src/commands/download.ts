import { AxiosResponse } from "axios";
import { ByteBuffer } from "flatbuffers";
import { createWriteStream } from "fs";
import { minimatch } from "minimatch";
import path from "path";
import {
    fetchBundle,
    GameNames,
    getManifestBinaryFile,
    Platforms,
    removeDelimiters,
} from "../api";
import { Bundle } from "../flatbuffers/bundle";
import { Fragment } from "../flatbuffers/fragment";
import { Manifest } from "../flatbuffers/manifest";
import {
    createFoldersRecursively,
    safeRmDir,
    getStringFromHashArray,
    convertFragmentToJson,
} from "../utils";
import os from "os";
import fs from "fs/promises";
import crypto from "crypto";
import { getLatestVersion } from "./version";

export type DownloadProps = {
    select?: string[];
    game: GameNames;
    platform: Platforms;
    output: string;
    release: string;
    debug?: boolean;
};

export const download = async ({
    select: patterns,
    game,
    platform,
    output,
    release,
    debug,
}: DownloadProps) => {
    const tmpBundleFolder = path.join(os.tmpdir(), "cytrus-v6", game);
    const outputFolder = path.resolve(output);

    console.log("Downloading", game, "into", outputFolder);

    await createFoldersRecursively(tmpBundleFolder);
    await createFoldersRecursively(outputFolder);

    const version = await getLatestVersion({ game, platform, release });
    const manifestBin = await getManifestBinaryFile(
        game,
        platform,
        release,
        version
    );
    const bb = new ByteBuffer(manifestBin);
    const manifest = Manifest.getRootAsManifest(bb);

    for (let i = 0; i < manifest.fragmentsLength(); i++) {
        const fragment = manifest.fragments(i)!;

        await downloadFragment({
            fragment,
            game,
            outputFolder: outputFolder,
            tmpBundleFolder: tmpBundleFolder,
            patterns,
            debug,
        });
    }

    console.log("Cleaning up");
    await safeRmDir(tmpBundleFolder);

    return version;
};

const isMultipart = (response: AxiosResponse<any>) => {
    const contentType = response.headers["content-type"];
    return contentType?.includes("multipart");
};

const getBoundary = (response: AxiosResponse<any>) => {
    const contentType = response.headers["content-type"];
    return contentType?.split("=")[1];
};

const downloadFragment = async ({
    fragment,
    game,
    outputFolder,
    tmpBundleFolder,
    patterns,
    debug,
}: {
    fragment: Fragment;
    game: string;
    outputFolder: string;
    tmpBundleFolder: string;
    patterns?: string[];
    debug?: boolean;
}) => {
    await createFoldersRecursively(tmpBundleFolder);

    const neededChunksMap = await getNeededChunksFromFragment(
        fragment,
        patterns
    );

    if (neededChunksMap.size === 0) {
        console.log("Skipping", fragment.name(), "fragment");
        return;
    }

    const MAX_BUNDLE_CACHE_SIZE = 100 * 1024 * 1024; // 100MB
    const bundleCache = new Map<string, Buffer>();

    // Helper to get bundle data
    async function getBundleData(bundleHash: string) {
        if (bundleCache.has(bundleHash)) {
            return bundleCache.get(bundleHash)!;
        }

        const bundlePath = path.join(tmpBundleFolder, bundleHash);
        const stats = await fs.stat(bundlePath);

        if (stats.size < MAX_BUNDLE_CACHE_SIZE) {
            const data = await fs.readFile(bundlePath);
            bundleCache.set(bundleHash, data);
            return data;
        }

        return await fs.readFile(bundlePath);
    }

    console.log("Downloading", fragment.name(), "fragment");

    for (const [bundle, bundleRanges] of neededChunksMap.entries()) {
        const bundleHash = getStringFromHashArray(bundle.hashArray()!);
        const writeStream = createWriteStream(
            path.join(tmpBundleFolder, bundleHash)
        );

        try {
            for (const range of bundleRanges.range) {
                const start = range.start;
                const end = range.end;

                const response = await fetchBundle(
                    game,
                    bundleHash,
                    `${start}-${end}`
                );

                const buffer = response.data;
                if (isMultipart(response)) {
                    const boundary = getBoundary(response);
                    removeDelimiters(buffer, boundary);
                }

                await new Promise((resolve, reject) => {
                    writeStream.write(buffer, (error) => {
                        if (error) reject(error);
                        else resolve(null);
                    });
                });
            }
        } finally {
            await new Promise((resolve, reject) => {
                writeStream.on("finish", resolve);
                writeStream.on("error", reject);
                writeStream.end();

                if (writeStream.writable) {
                    writeStream.end();
                }
            });
        }
    }

    const findBundle = (chunkHash: string) => {
        for (const bundleRange of neededChunksMap.values()) {
            if (bundleRange.chunks.has(chunkHash)) {
                return {
                    bundleHash: bundleRange.bundleHash,
                    ...bundleRange.chunks.get(chunkHash),
                };
            }
        }
    };

    for (let i = 0; i < fragment.filesLength(); i++) {
        let ctx = {} as any;

        const file = fragment.files(i)!;
        if (Number(file.size()) === 0) continue;

        const name = file.name()!;

        if (patterns) {
            const match = patterns?.some((pattern) => minimatch(name, pattern));
            if (!match) continue;
        }

        console.log("  file", name);

        const fullPath = path.join(outputFolder, name);
        const folder = path.dirname(fullPath);
        await createFoldersRecursively(folder);

        const writeStream = createWriteStream(fullPath);
        try {
            if (file.chunksLength() === 0) {
                const hash = getStringFromHashArray(file.hashArray()!);
                const { bundleHash, end, start } = findBundle(hash)!;
                ctx.bundleHash = bundleHash;
                ctx.end = end;
                ctx.start = start;
                const chunkData = await getBundleData(bundleHash);

                const exactData = chunkData.subarray(start!, end!);
                await new Promise((resolve, reject) => {
                    writeStream.write(exactData, (error) => {
                        if (error) reject(error);
                        else resolve(null);
                    });
                });
            } else {
                for (let j = 0; j < file.chunksLength(); j++) {
                    const chunk = file.chunks(j)!;
                    const hash = getStringFromHashArray(chunk.hashArray()!);

                    const { bundleHash, end, start } = findBundle(hash)!;

                    const chunkData = await getBundleData(bundleHash);
                    const exactData = chunkData.subarray(start!, end!);
                    await new Promise((resolve, reject) => {
                        writeStream.write(exactData, (error) => {
                            if (error) reject(error);
                            else resolve(null);
                        });
                    });
                }
            }
        } finally {
            await new Promise((resolve, reject) => {
                writeStream.on("finish", resolve);
                writeStream.on("error", reject);
                writeStream.end();

                if (writeStream.writable) {
                    writeStream.end();
                }
            });
        }

        if (debug) {
            const fileHash = getStringFromHashArray(file.hashArray()!);

            const fileLoaded = await fs.readFile(fullPath);

            const hasher = crypto.createHash("sha1");
            hasher.update(fileLoaded);
            const downloadedHash = hasher.digest("hex");

            if (downloadedHash !== fileHash) {
                console.log([...neededChunksMap.values()]);
                const fragmentJson = convertFragmentToJson(fragment);
                await fs.writeFile(
                    path.join(
                        outputFolder,
                        `debug_${path.basename(name)}.json`
                    ),
                    JSON.stringify(fragmentJson, null, 2)
                );

                throw new Error(`Hash mismatch for ${name}`);
            }
        }
    }
};

const getNeededChunksFromFragment = async (
    fragment: Fragment,
    patterns?: string[]
) => {
    const neededChunksHash = new Set<string>();
    const neededChunksMap: Map<Bundle, string[]> = new Map();

    for (let i = 0; i < fragment.filesLength(); i++) {
        const file = fragment.files(i)!;

        if (Number(file.size())! === 0) continue;

        const name = file.name()!;
        if (patterns) {
            const match = patterns?.some((pattern) => minimatch(name, pattern));
            if (!match) continue;
        }

        if (file.chunksLength() === 0) {
            const hash = getStringFromHashArray(file.hashArray()!);
            neededChunksHash.add(hash);
        }

        for (let j = 0; j < file.chunksLength(); j++) {
            const chunk = file.chunks(j);
            const hash = getStringFromHashArray(chunk!.hashArray()!);

            neededChunksHash.add(hash);
        }
    }

    for (let i = 0; i < fragment.bundlesLength(); i++) {
        const bundle = fragment.bundles(i)!;

        for (let j = 0; j < bundle.chunksLength(); j++) {
            const chunk = bundle.chunks(j)!;
            const hash = getStringFromHashArray(chunk.hashArray()!);

            if (neededChunksHash.has(hash)) {
                if (!neededChunksMap.has(bundle)) {
                    neededChunksMap.set(bundle, []);
                }

                const neededChunks = neededChunksMap.get(bundle)!;
                neededChunks.push(hash);
            }
        }
    }

    const fixedChunks = new Map<Bundle, BundleRanges>();

    for (const [bundle, neededChunks] of neededChunksMap.entries()) {
        const bundleRanges = processBundle(bundle, neededChunks);

        fixedChunks.set(bundle, bundleRanges);
    }

    return fixedChunks;
};

function getNextChunk(bundle: Bundle, index: number, neededChunks: string[]) {
    for (let i = index + 1; i < bundle.chunksLength(); i++) {
        const chunk = bundle.chunks(i)!;
        const hash = getStringFromHashArray(chunk.hashArray()!);

        if (neededChunks.includes(hash)) {
            return chunk;
        }
    }

    return null;
}

function processBundle(bundle: Bundle, neededChunks: string[]): BundleRanges {
    const ranges: { start: number; end: number }[] = [];
    const processedChunks: Map<string, ProcessedChunk> = new Map();

    let currentRange: { start: number; end: number } | null = null;
    let totalGap = 0;

    for (let i = 0; i < bundle.chunksLength(); i++) {
        const chunk = bundle.chunks(i)!;
        const hash = getStringFromHashArray(chunk.hashArray()!);

        if (!neededChunks.includes(hash)) {
            continue;
        }

        const nextChunk = getNextChunk(bundle, i, neededChunks);

        const currentOffset = Number(chunk.offset());
        const currentSize = Number(chunk.size());
        const start = currentOffset;
        const end = currentOffset + currentSize;

        if (!currentRange) {
            currentRange = { start, end };
        } else {
            if (start === currentRange.end) {
                currentRange.end = end;
            } else {
                ranges.push(currentRange);
                totalGap += start - currentRange.end;
                currentRange = { start, end };
            }
        }

        processedChunks.set(hash, {
            start: start - totalGap,
            end: end - totalGap,
        });

        if (!nextChunk || Number(nextChunk.offset()) !== end) {
            if (currentRange) {
                ranges.push(currentRange);
                currentRange = null;
            }
        }
    }

    return {
        bundleHash: getStringFromHashArray(bundle.hashArray()!),
        range: ranges,
        chunks: processedChunks,
    };
}

type ProcessedChunk = {
    start: number;
    end: number;
};

type BundleRanges = {
    bundleHash: string;
    range: { start: number; end: number }[];
    chunks: Map<string, ProcessedChunk>;
};
