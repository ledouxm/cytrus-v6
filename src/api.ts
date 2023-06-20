import axios from "axios";

export const getLatestVersion = async (game: GameNames) => {
    const resp = await axios.get("https://cytrus.cdn.ankama.com/cytrus.json");
    return resp.data.games[game].platforms.windows.main;
};

export const getManifestBinaryFile = async (
    game: GameNames,
    version: string
) => {
    const resp = await axios.get(
        `https://cytrus.cdn.ankama.com/${game}/releases/main/windows/${version}.manifest`,
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
