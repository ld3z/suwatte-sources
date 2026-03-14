const BLOCKED_REFERRERS = [
  "google.",
  "bing.com",
  "yahoo.com",
  "duckduckgo.com",
  "baidu.com",
  "yandex.",
  "search.brave.com",
];

export const onRequest: PagesFunction = async (context) => {
  const referer = context.request.headers.get("referer") || "";

  if (
    referer &&
    BLOCKED_REFERRERS.some((domain) => referer.includes(domain))
  ) {
    return new Response("Access denied.", { status: 403 });
  }

  return context.next();
};
