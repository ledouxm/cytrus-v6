import { minimatch } from "minimatch";
import { Fragment, Manifest, File } from "./flatbuffers/schema";
import { getStringFromHashArray } from "./utils";
import { getBundleChunks } from "./api";

// Our processing types
interface ChunkInfo {
    hash: string;
    size: number;
    offset: number;
    usedBy: Set<string>;
}

interface Range {
    start: number;
    end: number;
    chunks: ChunkInfo[];
}

interface RangeGroup {
    ranges: Range[];
    totalSize: number;
    affectedFiles: Set<string>;
}

interface DownloadResult {
    buffer: Buffer;
    ranges: Array<{
        start: number;
        end: number;
        content: Buffer;
    }>;
}
function optimizeChunks(files: File[]): {
    uniqueChunks: Map<string, ChunkInfo>;
    sortedChunks: ChunkInfo[];
} {
    const uniqueChunks = new Map<string, ChunkInfo>();

    // First pass: collect all unique chunks and track which files use them
    for (const file of files) {
        for (let i = 0; i < file.chunksLength(); i++) {
            const chunk = file.chunks(i);
            if (!chunk) continue;

            const hashHex = getStringFromHashArray(chunk.hashArray()!);
            if (!uniqueChunks.has(hashHex)) {
                uniqueChunks.set(hashHex, {
                    hash: hashHex,
                    size: Number(chunk.size()),
                    offset: Number(chunk.offset()),
                    usedBy: new Set<string>(),
                });
            }
            uniqueChunks.get(hashHex)!.usedBy.add(file.name()!);
        }
    }

    // Convert to sorted array for efficient range grouping
    const sortedChunks = Array.from(uniqueChunks.values()).sort(
        (a, b) => a.offset - b.offset
    );

    return { uniqueChunks, sortedChunks };
}

function buildRangeGroups(
    chunks: {
        uniqueChunks: Map<string, ChunkInfo>;
        sortedChunks: ChunkInfo[];
    },
    maxRangeSize: number
): RangeGroup[] {
    const groups: RangeGroup[] = [];
    let currentGroup: Range[] = [];
    let currentSize = 0;
    let affectedFiles = new Set<string>();

    for (let i = 0; i < chunks.sortedChunks.length; i++) {
        const chunk = chunks.sortedChunks[i];
        const nextChunk = chunks.sortedChunks[i + 1];

        // Add chunk's affected files to the set
        chunk.usedBy.forEach((file) => affectedFiles.add(file));

        // If this is the first chunk in a potential range
        if (currentGroup.length === 0) {
            currentGroup.push({
                start: chunk.offset,
                end: chunk.offset + chunk.size,
                chunks: [chunk],
            });
            currentSize = chunk.size;
            continue;
        }

        const lastRange = currentGroup[currentGroup.length - 1];
        const gapToNext = nextChunk
            ? nextChunk.offset - lastRange.end
            : Infinity;
        const wouldExceedSize = currentSize + chunk.size > maxRangeSize;
        const gapTooLarge = gapToNext > 1024 * 64; // 64KB gap threshold

        // If adding this chunk would exceed limits, start a new group
        if (wouldExceedSize || gapTooLarge) {
            groups.push({
                ranges: currentGroup,
                totalSize: currentSize,
                affectedFiles: new Set(affectedFiles),
            });
            currentGroup = [
                {
                    start: chunk.offset,
                    end: chunk.offset + chunk.size,
                    chunks: [chunk],
                },
            ];
            currentSize = chunk.size;
            affectedFiles = new Set(chunk.usedBy);
            continue;
        }

        // Extend the last range to include this chunk
        lastRange.end = chunk.offset + chunk.size;
        lastRange.chunks.push(chunk);
        currentSize += chunk.size;
    }

    // Don't forget the last group
    if (currentGroup.length > 0) {
        groups.push({
            ranges: currentGroup,
            totalSize: currentSize,
            affectedFiles,
        });
    }

    return groups;
}
export function parseMultipartResponse(
    response: Buffer,
    boundary: string
): Array<{
    start: number;
    end: number;
    content: Buffer;
}> {
    // First check if this is actually a multipart response
    const boundaryCheck = `--${boundary}`;
    if (!response.includes(boundaryCheck)) {
        // Not a multipart response, return as single range
        return [
            {
                start: 0,
                end: response.length - 1,
                content: response,
            },
        ];
    }

    const parts: Array<{
        start: number;
        end: number;
        content: Buffer;
    }> = [];

    const boundaryBuffer = Buffer.from(`\r\n--${boundary}`);
    let position = 0;

    while (position < response.length) {
        // Find next boundary
        const boundaryIndex = response.indexOf(boundaryBuffer as any, position);
        console.log("boundaryIndex", boundaryIndex);
        if (boundaryIndex === -1) break;

        // Move past boundary
        position = boundaryIndex + boundaryBuffer.length;

        // Check if this is the final boundary
        if (response[position] === 45 && response[position + 1] === 45) break; // '--'

        // Skip header lines until empty line
        let headerEnd = position;
        let contentRange = { start: 0, end: 0 };

        while (true) {
            const lineEnd = response.indexOf("\r\n", headerEnd);
            if (lineEnd === -1) break;

            const line = response.slice(headerEnd, lineEnd).toString();
            if (line === "") {
                headerEnd = lineEnd + 2;
                break;
            }

            // Parse Content-Range header
            const rangeMatch = line.match(/Content-Range: bytes (\d+)-(\d+)/i);
            console.log(rangeMatch);
            if (rangeMatch) {
                contentRange = {
                    start: parseInt(rangeMatch[1]),
                    end: parseInt(rangeMatch[2]),
                };
            }

            headerEnd = lineEnd + 2;
        }

        // Find the end of this part (next boundary or end of response)
        const contentEnd = response.indexOf(boundaryBuffer as any, headerEnd);
        const content =
            contentEnd === -1
                ? response.slice(headerEnd)
                : response.slice(headerEnd, contentEnd);

        parts.push({
            start: contentRange.start,
            end: contentRange.end,
            content,
        });

        if (contentEnd === -1) break;
        position = contentEnd;
    }

    return parts;
}

async function downloadRanges(
    rangeGroups: RangeGroup[],
    bundleHash: string,
    resource: string = "dofus"
): Promise<DownloadResult[]> {
    const results: DownloadResult[] = [];

    for (const group of rangeGroups) {
        // Convert ranges to the format "bytes=start1-end1,start2-end2"
        const rangeString =
            "bytes=" +
            group.ranges
                .map((range) => `${range.start}-${range.end}`)
                .join(",");

        const responseBuffer = await getBundleChunks(
            resource,
            bundleHash,
            rangeString
        );

        // Try to parse as multipart, falling back to single buffer if needed
        const ranges = parseMultipartResponse(
            responseBuffer,
            "00000000000858019917"
        );

        results.push({
            buffer: responseBuffer,
            ranges,
        });
    }

    return results;
}

function reconstructFiles(
    downloads: DownloadResult[],
    files: File[]
): Map<string, Buffer> {
    // Create chunk lookup map
    const chunksMap = new Map<string, Buffer>();
    for (const download of downloads) {
        for (const range of download.ranges) {
            const chunkHash = range.content.toString("hex");
            chunksMap.set(chunkHash, range.content);
        }
    }

    const result = new Map<string, Buffer>();

    for (const file of files) {
        // For symlinks, store the target path as content
        if (file.symlink()) {
            result.set(file.name()!, Buffer.from(file.symlink()!));
            continue;
        }

        // Regular file reconstruction
        const fileBuffer = Buffer.alloc(Number(file.size()));
        let position = 0;

        for (let i = 0; i < file.chunksLength(); i++) {
            const chunk = file.chunks(i);
            if (!chunk) continue;

            const chunkHash = getStringFromHashArray(chunk.hashArray()!);
            const chunkContent = chunksMap.get(chunkHash);
            if (!chunkContent) {
                throw new Error(`Missing chunk for file ${file.name()}`);
            }

            chunkContent.copy(
                fileBuffer as any,
                position,
                0,
                Number(chunk.size())
            );
            position += Number(chunk.size());
        }

        result.set(file.name()!, fileBuffer);
    }

    return result;
}

function matchFiles(filename: string, patterns: string[]): boolean {
    // Now using minimatch directly
    return patterns.some((pattern) => minimatch(filename, pattern));
}

function extractMatchingFiles(fragment: Fragment, patterns: string[]): File[] {
    // Returns matching files using minimatch
    const matchingFiles: File[] = [];

    for (let i = 0; i < fragment.filesLength(); i++) {
        const file = fragment.files(i);
        if (!file) continue;

        const name = file.name();
        if (!name) continue;

        if (!matchFiles(name, patterns)) continue;

        matchingFiles.push(file);
    }

    return matchingFiles;
}

export async function* processManifest(
    manifest: Manifest,
    patterns: string[],
    bundleHash: string, // Added bundleHash parameter
    options: {
        maxRangeSize: number;
        maxConcurrentDownloads: number;
        resource?: string; // Made resource optional with default "dofus"
    }
): AsyncIterableIterator<{
    path: string;
    content: Buffer;
}> {
    // Lazily process each fragment
    for (let i = 0; i < manifest.fragmentsLength(); i++) {
        const fragment = manifest.fragments(i);
        if (!fragment) continue;

        // Get matching files from this fragment
        const matchingFiles = extractMatchingFiles(fragment, patterns);
        if (matchingFiles.length === 0) continue;

        // Optimize chunks for these files
        const { uniqueChunks, sortedChunks } = optimizeChunks(matchingFiles);

        // Build range groups for efficient downloading
        const rangeGroups = buildRangeGroups(
            { uniqueChunks, sortedChunks },
            options.maxRangeSize
        );

        // Download chunks in parallel with concurrency limit
        const downloads: DownloadResult[] = [];
        for (
            let i = 0;
            i < rangeGroups.length;
            i += options.maxConcurrentDownloads
        ) {
            const batch = rangeGroups.slice(
                i,
                i + options.maxConcurrentDownloads
            );
            const downloadPromises = batch.map((group) =>
                downloadRanges([group], bundleHash, options.resource)
            );
            const results = await Promise.all(downloadPromises);
            downloads.push(...results.flat());
        }

        // Reconstruct matching files from downloaded chunks
        const reconstructedFiles = reconstructFiles(downloads, matchingFiles);

        // Yield each file as it's ready
        for (const [path, content] of reconstructedFiles.entries()) {
            yield { path, content };
        }
    }
}
