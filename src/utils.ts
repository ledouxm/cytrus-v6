import { promises as fs } from "fs";

export const readFileChunk = async (
    filePath: string,
    size: number,
    offset: number
) => {
    const buffer = Buffer.alloc(size);
    const f = await fs.open(filePath, "r");

    await f.read(buffer, 0, size, offset);
    await f.close();

    return buffer;
};

export async function createFoldersRecursively(folder: string) {
    try {
        await fs.mkdir(folder, { recursive: true });
    } catch {}
}

export const safeRmDir = async (dirPath: string) => {
    try {
        await fs.rm(dirPath, { recursive: true });
    } catch {}
};

export const safeStat = async (path: string) => {
    try {
        const stat = await fs.stat(path);
        return stat;
    } catch (e) {
        return null;
    }
};

export const getStringFromHashArray = (e: Int8Array) =>
    Array.from(new Uint8Array(e), (e) => ("0" + e.toString(16)).slice(-2)).join(
        ""
    );
