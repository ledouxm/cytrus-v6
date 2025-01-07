import { describe, expect, it } from "vitest";
import { download } from "../src/commands/download";
import { getLatestVersion } from "../src/commands/version";

describe(
    "Download",
    () => {
        it("should get dofus3 version", async () => {
            const version = await getLatestVersion({
                game: "dofus",
                platform: "windows",
                release: "dofus3",
            });

            expect(version).toBeDefined();
        });

        it("should download a random file", async () => {
            await download({
                game: "dofus",
                platform: "windows",
                release: "dofus3",
                output: "./output",
                select: "**/Dofus.exe",
                debug: true,
            });
        });

        it("should download a single part file", async () => {
            await download({
                game: "dofus",
                platform: "windows",
                release: "dofus3",
                output: "./output",
                select: "Dofus_Data/StreamingAssets/Content/Animations/Props/catalog_1.0.hash",
                debug: true,
            });
        });

        it("should download a random file contained in 2 different bundles", async () => {
            await download({
                game: "dofus",
                platform: "windows",
                release: "dofus3",
                output: "./output",
                select: "Dofus_Data/StreamingAssets/aa/StandaloneWindows64/gameassets_assets_all_28d752d2282d8438ddc4ef4b4de81687.bundle",
                debug: true,
            });
        });

        it("should download the whole game", async () => {
            await download({
                game: "dofus",
                platform: "windows",
                release: "dofus3",
                output: "./output",
                debug: true,
            });
        });
    },
    {
        timeout: +Infinity,
    }
);
