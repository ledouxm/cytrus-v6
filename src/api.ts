import axios from "axios";
import { Manifest } from "./flatbuffers/manifest";
import { ByteBuffer } from "flatbuffers";

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

export type GetManifestProps = {
    game: GameNames;
    platform: Platforms;
    release: string;
};
export const getManifest = async ({
    game,
    platform,
    release,
}: GetManifestProps) => {
    const version = await getLatestVersion(game, platform, release);
    const manifestBin = await getManifestBinaryFile(
        game,
        platform,
        release,
        version
    );

    const bb = new ByteBuffer(manifestBin);
    const manifest = Manifest.getRootAsManifest(bb);

    return manifest;
};

export const getBundleChunks = async (
    game: string,
    bundleHash: string,
    range: string
) => {
    const response = await axios.get<Buffer>(
        `https://cytrus.cdn.ankama.com/${game}/bundles/${bundleHash.slice(
            0,
            2
        )}/${bundleHash}`,
        {
            headers: {
                Range: `bytes=${range}`,
            },
            responseType: "arraybuffer",
        }
    );

    console.log(
        `https://cytrus.cdn.ankama.com/${game}/bundles/${bundleHash.slice(
            0,
            2
        )}/${bundleHash}`
    );
    console.log("range", `bytes=${range}`);

    return response.data;
};

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
