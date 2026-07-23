import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { validatePublishedMainnetMetadata } from "../scripts/lib/mainnet-metadata.js";

describe("metadata pública Mainnet", () => {
  it("es JSON válido con identidad, fee cero y estado creado", async () => {
    const metadata = JSON.parse(await readFile("site/metadata-mainnet.json", "utf8")) as Record<string, unknown>;
    assert.equal(metadata.name, "AVICOIN");
    assert.equal(metadata.symbol, "AVI");
    assert.equal(metadata.mint, "GVRNeaBDvKDJ78Rmd29fPdKyCjraSRABiYf2h8LuJytC");
    assert.equal(metadata.metadata_pda, "4jJmQbSYi3k1iunsbC6qcJM477T8apTw1SoyY36j1Qp2");
    assert.equal(metadata.seller_fee_basis_points, 0);
    assert.match(JSON.stringify(metadata), /Created/);
    assert.doesNotMatch(JSON.stringify(metadata), /Not created/);
  });

  it("no expone secretos, rutas privadas ni RPC", async () => {
    const content = await readFile("site/metadata-mainnet.json", "utf8");
    assert.doesNotMatch(content, /private|seed|keypair|\/Users\/|rpc|api-key|secret/i);
  });

  it("valida HTTP, content types, bytes locales y firma PNG con fetch simulado", async () => {
    const metadata = await readFile("site/metadata-mainnet.json");
    const logo = await readFile("site/logo.png");
    const fetcher = (async (input: string | URL | Request) => {
      const url = String(input);
      return url.endsWith("metadata-mainnet.json")
        ? new Response(metadata, { status: 200, headers: { "content-type": "application/json; charset=utf-8" } })
        : new Response(logo, { status: 200, headers: { "content-type": "image/png" } });
    }) as typeof fetch;
    const result = await validatePublishedMainnetMetadata(undefined, fetcher);
    assert.match(result.metadataSha256, /^[a-f0-9]{64}$/);
    assert.match(result.logoSha256, /^[a-f0-9]{64}$/);
  });
});
