import axios from "axios";
import fs from "fs/promises";

export const getLatestVersion = async (
    game: GameNames,
    platform: Platforms,
    release: string
) => {
    const resp = await axios.get("https://cytrus.cdn.ankama.com/cytrus.json");
    return resp.data.games[game].platforms[platform][release];
};

export const getManifestBinaryFile = async (
    game: GameNames,
    platform: Platforms,
    release: string,
    version: string
) => {
    const resp = await axios.get(
        `https://cytrus.cdn.ankama.com/${game}/releases/${release}/${platform}/${version}.manifest`,
        {
            responseType: "arraybuffer",
        }
    );
    return resp.data;
};

function processChunks(chunks: { hash: string; start: number; end: number }[]) {
    const sorted = [...chunks].sort((a, b) => a.start - b.start);

    const ranges: [number, number][] = [];
    const hashMap = new Map<[number, number], string>();

    let currentRange: [number, number] = [sorted[0].start, sorted[0].end];
    let currentHash = sorted[0].hash;

    for (let i = 1; i < sorted.length; i++) {
        const chunk = sorted[i];

        if (chunk.start === currentRange[1]) {
            currentRange[1] = chunk.end;
            currentHash += chunk.hash;
        } else {
            ranges.push([...currentRange]);
            hashMap.set([...currentRange], currentHash);

            currentRange = [chunk.start, chunk.end];
            currentHash = chunk.hash;
        }
    }

    ranges.push(currentRange);
    hashMap.set(currentRange, currentHash);

    const rangesUnique = [
        ...new Set(ranges.map((range) => range.join("-"))),
    ].map(
        (range) => range.split("-").map((n) => parseInt(n)) as [number, number]
    );

    const totalSize = rangesUnique.reduce(
        (acc, [start, end]) => acc + end - start,
        0
    );

    const rangeHeader =
        "bytes=" +
        rangesUnique
            .filter(([start, end]) => start !== end)
            .map(([start, end]) => `${start}-${end}`)
            .join(", ");

    return { rangeHeader, hashMap, isSingle: rangesUnique.length, totalSize };
}

export const fetchBundle = async (
    game: string,
    bundleHash: string,
    rangeHeader?: string
) => {
    const response = await axios.get<Buffer>(
        `https://cytrus.cdn.ankama.com/${game}/bundles/${bundleHash.slice(
            0,
            2
        )}/${bundleHash}`,
        {
            headers: rangeHeader ? { Range: rangeHeader } : {},
            responseType: "arraybuffer",
        }
    );

    return response;
};

export type ChunkMap = Map<
    string,
    {
        bundleHash: string;
        chunkRange: { start: number; end: number }[];
    }
>;

export const downloadBundle = async (
    game: string,
    bundleHash: string,
    chunkRange: { hash: string; start: number; end: number }[]
): Promise<void> => {
    const chunkMap: ChunkMap = new Map();
    const processedChunks = processChunks(chunkRange);

    if (processedChunks.isSingle) {
        const response = await fetchBundle(
            game,
            bundleHash,
            processedChunks.rangeHeader
        );

        await fs.writeFile(`./${bundleHash}`, response.data);
    }

    const response = await fetchBundle(
        game,
        bundleHash,
        processedChunks.rangeHeader
    );
    await fs.writeFile(`./${bundleHash}.response`, response.data);

    const contentTypeHeader = response.headers["content-type"];
    const boundary = contentTypeHeader.split("=")[1];

    const buffer = Buffer.alloc(processedChunks.totalSize);

    const bundle = parseMultipartResponse(
        response.data,
        boundary,
        bundleHash,
        processedChunks.hashMap,
        chunkMap,
        buffer
    );

    await fs.writeFile(`./${bundleHash}`, bundle);
};

function parseMultipartResponse(
    buffer: Buffer,
    boundary: string,
    bundleHash: string,
    rangeToHash: Map<[number, number], string>,
    resultMap: ChunkMap,
    bundle: Buffer
) {
    const boundaryMarker = `--${boundary}`;
    const finalBoundary = `${boundaryMarker}--`;
    const parts = buffer.toString().split(boundaryMarker);

    for (const part of parts) {
        if (!part.trim() || part.includes(finalBoundary)) continue;

        const [headers, content] = part.split("\r\n\r\n");
        if (!headers || !content) continue;

        const rangeMatch = headers.match(
            /Content-Range: bytes (\d+)-(\d+)\/\d+/
        );
        if (!rangeMatch) continue;

        const [_, start, end] = rangeMatch;
        const range: [number, number] = [parseInt(start), parseInt(end)];

        const hash = findHashForRange(range, rangeToHash);
        if (hash) {
            resultMap.set(hash, {
                bundleHash,
                chunkRange: [{ start: range[0], end: range[1] }],
            });
        }
    }

    return bundle;
}

function findHashForRange(
    range: [number, number],
    rangeToHash: Map<[number, number], string>
): string | undefined {
    for (const [[start, end], hash] of rangeToHash.entries()) {
        if (start === range[0] && end === range[1]) return hash;
    }
}
export function removeDelimiters(content: Buffer, boundary: string): number {
    const boundaryBuffer = Buffer.from(`--${boundary}`);
    const endBoundaryBuffer = Buffer.from(`--${boundary}--`);

    let writeOffset = 0;
    let readOffset = 0;

    while (readOffset < content.length) {
        if (content.subarray(readOffset).indexOf(boundaryBuffer) === 0) {
            readOffset = content.indexOf("\r\n", readOffset) + 2;
            let nextLine = content.indexOf("\r\n", readOffset);
            while (nextLine !== readOffset) {
                readOffset = nextLine + 2;
                nextLine = content.indexOf("\r\n", readOffset);
            }
            readOffset += 2;
            continue;
        }

        if (content.subarray(readOffset).indexOf(endBoundaryBuffer) === 0) {
            break;
        }

        if (writeOffset !== readOffset) {
            content[writeOffset] = content[readOffset];
        }
        writeOffset++;
        readOffset++;
    }

    if (writeOffset < content.length) {
        content.fill(0, writeOffset);
    }

    return writeOffset;
}

export const gameNames = [
    "dofus",
    "flyn",
    "waven",
    "retro",
    "supernanoblaster",
    "krosmaga",
    "onemoregate",
    "wakfu",
] as const;
export type GameNames = (typeof gameNames)[number];
export const platforms = ["windows", "darwin", "linux"] as const;
export type Platforms = (typeof platforms)[number];
