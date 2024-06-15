import axios from "axios";

export const getLatestVersion = async (
    game: GameNames,
    platform: Platforms,
    beta: boolean = false
) => {
    const resp = await axios.get("https://cytrus.cdn.ankama.com/cytrus.json");
    return resp.data.games[game].platforms[platform][beta ? 'beta' : 'main'];
};

export const getManifestBinaryFile = async (
    game: GameNames,
    platform: Platforms,
    version: string,
    beta: boolean = false
) => {
    const resp = await axios.get(
        `https://cytrus.cdn.ankama.com/${game}/releases/${beta ? 'beta' : 'main'}/${platform}/${version}.manifest`,
        {
            responseType: "arraybuffer",
        }
    );
    return resp.data;
};

export const getBundleChunks = async (
    game: string,
    bundleHash: string,
    range: string
) => {
    const response = await axios.get(
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
