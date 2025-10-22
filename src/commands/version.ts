import axios from "axios";
import { GameNames, Platforms } from "../api";

export const getLatestVersion = async ({
    game,
    platform,
    release,
}: GetLatestVersionProps) => {
    const resp = await axios.get("https://cytrus.cdn.ankama.com/cytrus.json");
    return resp.data.games[game].platforms[platform][release] as string;
};

export type GetLatestVersionProps = {
    game: GameNames;
    platform: Platforms;
    release: string;
};
