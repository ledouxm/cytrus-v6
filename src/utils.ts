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

export function convertManifestToJson(manifest: any): ManifestJson {
    const fragments: FragmentJson[] = [];

    for (let i = 0; i < manifest.fragmentsLength(); i++) {
        const fragment = manifest.fragments(i);
        fragments.push(convertFragmentToJson(fragment));
    }

    return { fragments };
}

export function convertFragmentToJson(fragment: any): FragmentJson {
    return {
        name: fragment.name(),
        files: convertFiles(fragment),
        bundles: convertBundles(fragment),
    };
}

function convertFiles(fragment: any): FileJson[] {
    const files: FileJson[] = [];

    for (let i = 0; i < fragment.filesLength(); i++) {
        const file = fragment.files(i);
        files.push({
            name: file.name(),
            size: Number(file.size()),
            hash: getStringFromHashArray(file.hashArray()),
            chunks: convertChunks(file),
            executable: file.executable(),
            symlink: file.symlink(),
        });
    }

    return files;
}

function convertBundles(fragment: any): BundleJson[] {
    const bundles: BundleJson[] = [];

    for (let i = 0; i < fragment.bundlesLength(); i++) {
        const bundle = fragment.bundles(i);
        bundles.push({
            hash: getStringFromHashArray(bundle.hashArray()),
            chunks: convertChunks(bundle),
        });
    }

    return bundles;
}

function convertChunks(parent: any): ChunkJson[] {
    const chunks: ChunkJson[] = [];

    for (let i = 0; i < parent.chunksLength(); i++) {
        const chunk = parent.chunks(i);
        chunks.push({
            hash: getStringFromHashArray(chunk.hashArray()),
            size: Number(chunk.size()),
            offset: Number(chunk.offset()),
        });
    }

    return chunks;
}

export const getStringFromHashArray = (e: Int8Array) =>
    Array.from(new Uint8Array(e), (e) => ("0" + e.toString(16)).slice(-2)).join(
        ""
    );

interface ManifestJson {
    fragments: FragmentJson[];
}

export interface FragmentJson {
    name: string;
    files: FileJson[];
    bundles: BundleJson[];
}

interface BundleJson {
    hash: string;
    chunks: ChunkJson[];
}

interface FileJson {
    name: string;
    size: number;
    hash: string;
    chunks: ChunkJson[];
    executable: boolean;
    symlink: string;
}

interface ChunkJson {
    hash: string;
    size: number;
    offset: number;
}
