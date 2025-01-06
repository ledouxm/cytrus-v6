import { describe, it, expect, beforeAll } from "vitest";
import { Manifest } from "../src/flatbuffers/manifest";
import { getManifest, GetManifestProps } from "../src/api";
import { minimatch } from "minimatch";
import { promises as fs } from "fs";
import { parseMultipartResponse } from "../src/v2";
const cache = {
    manifest: null as Manifest | null,
};

const options = {
    game: "dofus",
    platform: "windows",
    release: "dofus3",
} satisfies GetManifestProps;

describe("Download", () => {
    beforeAll(async () => {
        cache.manifest = await getManifest(options);
    });

    it("should get a manifest", () => {
        expect(cache.manifest).not.toBeNull();
    });

    it("should filter fragments", async () => {
        const response = await fs.readFile("src/response.txt");
        const flatResponse = Buffer.from(
            `asset.bundle","{Core.DofusConstants.runtimePath}/Content/Data/data_assets_achievementobjectivesroot.asset.bundle","{Core.DofusConstants.runtimePath}/Content/Data/data_assets_achievementprogressroot.asset.bundle","{Core.DofusConstants.runtimePath}/Content/Data/data_assets_achievementprogressstepsroot.asset.bundl`
        );
        const parsed = parseMultipartResponse(response, "00000000000858019917");
        // console.log(parsed);
        expect(parsed).not.toBeNull();
        // const filtered = filterFragments(cache.manifest!, ["*.exe"]);
        // expect(filtered).toHaveLength(1);
    });
});

const filterFragments = (manifest: Manifest, patterns: string[]) => {
    const fragments = [];
    for (let i = 0; i < manifest.fragmentsLength(); i++) {
        const fragment = manifest.fragments(i)!;
        const files = [];
        for (let j = 0; j < fragment.filesLength(); j++) {
            const file = fragment.files(j)!;
            const name = file.name()!;

            if (patterns.some((pattern) => minimatch(name, pattern))) {
                files.push(file);
            }
        }
        if (files.length > 0) {
            fragments.push({ fragment, files });
        }
    }
    return fragments;
};

const getFilteredManifest = async (
    manifest: Manifest,
    patterns: string[]
) => {};
