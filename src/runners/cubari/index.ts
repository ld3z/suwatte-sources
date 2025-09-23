import {
  Chapter,
  ChapterData,
  Content,
  ContentSource,
  DirectoryConfig,
  DirectoryRequest,
  ImageRequestHandler,
  NetworkRequest,
  PagedResult,
  PageLink,
  PageLinkResolver,
  PageSection,
  ResolvedPageSection,
  SectionStyle,
  Highlight,
  Property,
} from "@suwatte/daisuke";
import { INFO } from "./constants";
import {
  fetchManifest,
  fetchText,
  pageLinkToString,
  SimpleNetworkClient,
} from "./helpers";
import {
  buildSeriesId,
  extractPagesFromChapter,
  fetchProxyPages,
  manifestToChapters,
  manifestToContent,
  manifestToSearchHighlight,
  parseChapterId,
  parseCubariUrl,
  parseSeriesId,
  resolveShortUrl,
  selectGroupValue,
} from "./parser";

export class Target
  implements ContentSource, ImageRequestHandler, PageLinkResolver
{
  info = INFO;
  private client: SimpleNetworkClient = new NetworkClient();

  // A proxy fetcher method that uses the instance's client
  private fetcher = (url: string) => fetchText(url, this.client);

  // --- PageLinkResolver ---
  async resolvePageSection(
    _link: PageLink,
    _sectionID: string
  ): Promise<ResolvedPageSection> {
    throw new Error("Method not used.");
  }

  private instructionsSection(): PageSection {
    return {
      id: "cubari_instructions",
      title: "How to use Cubari Resolver",
      style: SectionStyle.PADDED_LIST,
      items: [
        {
          id: "info",
          title:
            "Paste a Cubari gist link (or base64) in the Browse/Search bar",
          subtitle:
            "Examples: 1) Full: https://cubari.moe/read/gist/<base64>/  2) Base64 only: <base64>",
          cover: "/assets/cubari_logo.png",
        },
      ],
    };
  }

  async getSectionsForPage(link: PageLink): Promise<PageSection[]> {
    const linkStr = pageLinkToString(link);
    if (!linkStr) {
      return [this.instructionsSection()];
    }

    let parsed = parseCubariUrl(linkStr);
    if (!parsed) {
      parsed = await resolveShortUrl(linkStr, this.fetcher);
    }

    if (!parsed) {
      return [this.instructionsSection()];
    }

    const contentId = buildSeriesId(parsed.type, parsed.id);
    const items: Highlight[] = [
      {
        id: contentId,
        title: "Cubari Series",
        cover: "/assets/cubari_logo.png",
        subtitle: "Tap to open",
      },
    ];
    return [
      {
        id: "cubari_resolved",
        title: "Cubari Link",
        items,
        style: SectionStyle.PADDED_LIST,
      },
    ];
  }

  // --- ContentSource ---
  async getContent(contentId: string): Promise<Content> {
    const { rawJsonUrl } = parseSeriesId(contentId);
    const manifest = await fetchManifest(rawJsonUrl, this.client);
    return manifestToContent(contentId, manifest);
  }

  async getChapters(contentId: string): Promise<Chapter[]> {
    const { id, rawJsonUrl, type } = parseSeriesId(contentId);
    const manifest = await fetchManifest(rawJsonUrl, this.client);
    return manifestToChapters(type, id, manifest);
  }

  async getChapterData(
    _contentId: string,
    chapterId: string
  ): Promise<ChapterData> {
    const { id, type, chapter, group } = parseChapterId(chapterId);
    const { rawJsonUrl } = parseSeriesId(buildSeriesId(type, id));
    const manifest = await fetchManifest(rawJsonUrl, this.client);
    const chap = manifest.chapters?.[chapter];
    if (!chap) throw new Error(`Chapter '${chapter}' not found in manifest`);

    let pages = extractPagesFromChapter(
      chap,
      group === "." ? undefined : group
    );
    if (pages.length === 0) {
      const sel = selectGroupValue(chap, group === "." ? undefined : group);
      if (typeof sel === "string") {
        pages = await fetchProxyPages(sel, this.fetcher);
      }
    }

    if (pages.length === 0) {
      const available =
        chap?.groups && !Array.isArray(chap.groups)
          ? Object.keys(chap.groups).join(", ")
          : "none";
      throw new Error(
        `Group/page list not found. Requested='${group}', Available=${available}`
      );
    }
    return { pages };
  }

  async getDirectory(query: DirectoryRequest): Promise<PagedResult> {
    const q = (query.query ?? "").trim();
    console.log(`Cubari search query: ${q}`);
    if (!q) {
      return {
        results: [
          {
            id: "cubari_instructions",
            title: "Paste a Cubari gist URL or base64 in the search bar",
            cover: "/assets/cubari_logo.png",
            subtitle:
              "Full: https://cubari.moe/read/gist/<base64>/  |  Or: just the <base64>",
          },
        ],
        isLastPage: true,
      };
    }

    let parsed = parseCubariUrl(q);
    console.log(`Parsed result: ${JSON.stringify(parsed)}`);

    if (!parsed) {
      const item: Highlight = {
        id: "cubari_invalid",
        title: "Unsupported Cubari URL",
        cover: "/assets/cubari_logo.png",
        subtitle:
          "Paste either the full Cubari gist link or just the base64 key.",
      };
      return { results: [item], isLastPage: true };
    }

    const contentId = buildSeriesId(parsed.type, parsed.id);
    try {
      const manifest = await fetchManifest(parsed.rawJsonUrl, this.client);
      const item = manifestToSearchHighlight(contentId, manifest);
      return { results: [item], isLastPage: true };
    } catch {
      const item: Highlight = {
        id: contentId,
        title: "Cubari Series",
        cover: "/assets/cubari_logo.png",
        subtitle: "Tap to open",
      };
      return { results: [item], isLastPage: true };
    }
  }

  async getDirectoryConfig(): Promise<DirectoryConfig> {
    return { filters: [] };
  }

  // --- ImageRequestHandler ---
  async willRequestImage(url: string): Promise<NetworkRequest> {
    return { url, headers: { Referer: "https://cubari.moe/" } };
  }
}
