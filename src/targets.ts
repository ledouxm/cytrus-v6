import { Manifest } from "./flatbuffers/manifest";
import { minimatch } from "minimatch";
import { getStringFromHashArray, readFileChunk } from "./utils";
import { File } from "./flatbuffers/file";
import crypto from "crypto";
import path from "path";
import { promises as fs } from "fs";

export const getTargetFilenamesAndChunkHashes = async (
    manifest: Manifest,
    outputFolder: string,
    patterns?: string[]
) => {
    const filesToDownload: string[][] = [];
    const chunksToDownload: string[] = [];

    for (let i = 0; i < manifest.fragmentsLength(); i++) {
        filesToDownload.push([]);
        const fragment = manifest.fragments(i)!;
        for (let j = 0; j < fragment.filesLength(); j++) {
            const file = fragment.files(j)!;
            const fileHash = getStringFromHashArray(file.hashArray()!);

            if (Number(file.size()) === 0) continue;

            const name = file.name()!;
            if (patterns) {
                const match = patterns?.some((pattern) =>
                    minimatch(name, pattern)
                );
                if (!match) continue;
            }

            if (await checkIfFileIsUpToDate(file, outputFolder)) continue;

            if (file.chunksLength() === 0) {
                chunksToDownload.push(fileHash);
            } else {
                for (let k = 0; k < file.chunksLength(); k++) {
                    const chunk = file.chunks(k);

                    const hash = getStringFromHashArray(chunk!.hashArray()!);

                    chunksToDownload.push(hash);
                }
            }

            filesToDownload[filesToDownload.length - 1].push(fileHash);
        }
    }

    return { filesToDownload, chunksToDownload };
};

const checkIfFileIsUpToDate = async (file: File, outputFolder: string) => {
    const name = file.name()!;
    const size = Number(file.size());

    const filePath = path.join(outputFolder, name);

    try {
        const fileStats = await fs.stat(filePath);
        if (fileStats.size !== size) return false;

        return areAllChunksUpToDate(file, outputFolder);
    } catch {
        return false;
    }
};

const areAllChunksUpToDate = async (file: File, outputFolder: string) => {
    const f = await fs.open(path.join(outputFolder, file.name()!), "r");

    const result = await checkAfterFileIsOpen(file, f);

    await f.close();
    return result;
};

const checkAfterFileIsOpen = async (file: File, f: fs.FileHandle) => {
    for (let i = 0; i < file.chunksLength(); i++) {
        const chunk = file.chunks(i)!;
        const hash = getStringFromHashArray(chunk.hashArray()!);

        const buffer = Buffer.alloc(Number(chunk.size()));

        await f.read(buffer, 0, Number(chunk.size()), Number(chunk.offset()));
        const existingFileHash = crypto
            .createHash("sha1")
            .update(buffer)
            .digest("hex");

        if (existingFileHash !== hash) return false;
    }

    return true;
};
