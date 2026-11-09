import type { HttpClient, NativeCrypto } from "@suwatte/toolchain";

import { INDEX_VERSION_TTL_MS, LTN_URL, OrderBy, OrderByKey, PAGE_SIZE } from "./constants";

declare const Crypto: NativeCrypto;

/** Namespaces the site resolves to their own nozomi files. */
export const NAMESPACES = [
  "female",
  "male",
  "tag",
  "artist",
  "group",
  "series",
  "character",
  "type",
  "language",
] as const;
export type Namespace = (typeof NAMESPACES)[number];

/** A search term; without a namespace it's a free-text word looked up in the title index. */
export interface Term {
  ns?: Namespace;
  value: string;
}

export interface IndexState {
  language: string;
  orderby: OrderBy;
  orderbykey: OrderByKey;
}

export interface IdPage {
  ids: number[];
  total: number;
}

/** Bytes fetched per B-tree node; matches the site's `max_node_size`. */
const MAX_NODE_SIZE = 464;
/** Children per B-tree node plus one; matches the site's `B + 1`. */
const SUBNODE_COUNT = 17;
const MAX_TREE_DEPTH = 32;
const ID_LIST_CACHE_SIZE = 8;

/**
 * Port of the site's `nozomi_address_from_state`. `term` narrows the index to a
 * tag, artist, etc.; omitting it lists every gallery in the language.
 *
 * Files under `/n/` are served gzip-encoded, so byte ranges address the
 * compressed body; ranged reads must use the plain copies (`ranged`).
 */
export function nozomiPath(state: IndexState, term?: Term, ranged = false): string {
  const root = ranged ? "" : "/n";
  let area = "all";
  let tag = "index";
  if (term?.ns === "female" || term?.ns === "male") {
    area = "tag";
    tag = `${term.ns}:${term.value}`;
  } else if (term?.ns) {
    area = term.ns;
    tag = term.value;
  }
  const suffix = `${encodeURIComponent(tag)}-${state.language}.nozomi`;
  const sorted = state.orderby !== "date" || state.orderbykey === "published";

  if (area === "all") {
    return sorted
      ? `${root}/${state.orderby}/${state.orderbykey}-${state.language}.nozomi`
      : `${root}/${suffix}`;
  }
  return sorted
    ? `${root}/${area}/${state.orderby}/${state.orderbykey}/${suffix}`
    : `${root}/${area}/${suffix}`;
}

export function decodeIds(bytes: Uint8Array): number[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ids = new Array<number>(Math.floor(bytes.byteLength / 4));
  for (let i = 0; i < ids.length; i++) ids[i] = view.getInt32(i * 4, false);
  return ids;
}

interface TreeNode {
  keys: Uint8Array[];
  datas: [number, number][];
  subnodes: number[];
}

function readUint64(view: DataView, pos: number): number {
  return view.getUint32(pos, false) * 2 ** 32 + view.getUint32(pos + 4, false);
}

export function decodeNode(bytes: Uint8Array): TreeNode {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 0;
  const keys: Uint8Array[] = [];
  const keyCount = view.getInt32(pos, false);
  pos += 4;
  for (let i = 0; i < keyCount; i++) {
    const size = view.getInt32(pos, false);
    if (!size || size > 32) throw new Error("Malformed Hitomi search index node.");
    pos += 4;
    keys.push(bytes.slice(pos, pos + size));
    pos += size;
  }
  const datas: [number, number][] = [];
  const dataCount = view.getInt32(pos, false);
  pos += 4;
  for (let i = 0; i < dataCount; i++) {
    datas.push([readUint64(view, pos), view.getInt32(pos + 8, false)]);
    pos += 12;
  }
  const subnodes: number[] = [];
  for (let i = 0; i < SUBNODE_COUNT; i++) {
    subnodes.push(readUint64(view, pos));
    pos += 8;
  }
  return { keys, datas, subnodes };
}

function compareBytes(a: Uint8Array, b: Uint8Array): number {
  const top = Math.min(a.length, b.length);
  for (let i = 0; i < top; i++) {
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }
  return 0;
}

/** Reads gallery ids from Hitomi's nozomi files and title search index. */
export class HitomiIndex {
  private idLists = new Map<string, number[]>();
  private galleriesVersion?: { value: string; fetchedAt: number };

  constructor(private client: HttpClient) {}

  /** One listing page, fetched with a byte range so the whole index isn't downloaded. */
  async page(path: string, page: number): Promise<IdPage> {
    const start = (page - 1) * PAGE_SIZE * 4;
    const response = await this.client.get(`${LTN_URL}${path}`, {
      headers: { Range: `bytes=${start}-${start + PAGE_SIZE * 4 - 1}` },
      validateStatus: (status) => status < 500,
    });
    if (response.status === 404 || response.status === 416) {
      return { ids: [], total: 0 };
    }
    if (!response.ok) {
      throw new Error(`Hitomi index request failed (${response.status}).`);
    }
    const ids = decodeIds(await response.bytes());
    const range = response.headers.get("content-range");
    const total = range ? parseInt(range.replace(/^bytes \d+-\d+\//i, ""), 10) / 4 : NaN;
    return {
      ids: response.status === 206 ? ids : ids.slice(start / 4, start / 4 + PAGE_SIZE),
      total: Number.isFinite(total) ? total : response.status === 200 ? ids.length : start / 4 + ids.length,
    };
  }

  /** Every id in a nozomi file; missing files (unknown tags) are empty. */
  async all(path: string): Promise<number[]> {
    const cached = this.idLists.get(path);
    if (cached) {
      this.idLists.delete(path);
      this.idLists.set(path, cached);
      return cached;
    }
    const response = await this.client.get(`${LTN_URL}${path}`, {
      validateStatus: (status) => status < 500,
    });
    if (response.status === 404) return this.remember(path, []);
    if (!response.ok) {
      throw new Error(`Hitomi index request failed (${response.status}).`);
    }
    return this.remember(path, decodeIds(await response.bytes()));
  }

  /** Galleries whose title contains the word, via the site's hashed B-tree index. */
  async searchTitle(word: string): Promise<number[]> {
    const cacheKey = `title:${word}`;
    const cached = this.idLists.get(cacheKey);
    if (cached) return cached;

    const version = await this.galleriesIndexVersion();
    const indexUrl = `${LTN_URL}/galleriesindex/galleries.${version}.index`;
    const dataUrl = `${LTN_URL}/galleriesindex/galleries.${version}.data`;
    const key = Crypto.sha256(word).slice(0, 4);

    let address = 0;
    for (let depth = 0; depth < MAX_TREE_DEPTH; depth++) {
      const node = decodeNode(await this.range(indexUrl, address, address + MAX_NODE_SIZE - 1));
      if (!node.keys.length) break;

      let index = 0;
      let cmp = -1;
      for (; index < node.keys.length; index++) {
        cmp = compareBytes(key, node.keys[index]);
        if (cmp <= 0) break;
      }
      if (cmp === 0) {
        const [offset, length] = node.datas[index];
        if (length <= 0 || length > 100_000_000) break;
        const data = await this.range(dataUrl, offset, offset + length - 1);
        const count = new DataView(data.buffer, data.byteOffset, data.byteLength).getInt32(0, false);
        if (data.byteLength !== count * 4 + 4) break;
        return this.remember(cacheKey, decodeIds(data.subarray(4)));
      }
      const next = node.subnodes[index];
      if (!next) break;
      address = next;
    }
    return this.remember(cacheKey, []);
  }

  private async galleriesIndexVersion(): Promise<string> {
    const cached = this.galleriesVersion;
    if (cached && Date.now() - cached.fetchedAt < INDEX_VERSION_TTL_MS) return cached.value;
    const response = await this.client.get(`${LTN_URL}/galleriesindex/version`, {
      params: { _: Date.now() },
    });
    const value = (await response.text()).trim();
    if (!/^\d+$/.test(value)) throw new Error("Hitomi's search index version is unavailable.");
    this.galleriesVersion = { value, fetchedAt: Date.now() };
    return value;
  }

  private async range(url: string, start: number, end: number): Promise<Uint8Array> {
    const response = await this.client.get(url, {
      headers: { Range: `bytes=${start}-${end}` },
    });
    const bytes = await response.bytes();
    return response.status === 206 ? bytes : bytes.slice(start, end + 1);
  }

  private remember(key: string, ids: number[]): number[] {
    this.idLists.set(key, ids);
    while (this.idLists.size > ID_LIST_CACHE_SIZE) {
      this.idLists.delete(this.idLists.keys().next().value as string);
    }
    return ids;
  }
}
