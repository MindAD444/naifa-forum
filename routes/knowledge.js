import express from 'express';
import Parser from 'rss-parser';

const router = express.Router();
const parser = new Parser({
  customFields: {
    item: ['description', 'content:encoded']
  }
});
let cache = { items: [], lastUpdate: 0 };
const CACHE_TTL = 10 * 60 * 1000;
const SOURCES = [
  { name: "Hacker News",       url: "https://api.allorigins.win/raw?url=https://hnrss.org/newest" },
  { name: "VnExpress KH",      url: "https://vnexpress.net/rss/khoa-hoc.rss" },
  { name: "Tinhte AI",         url: "https://tinhte.vn/rss/ai.rss" },
  { name: "ScienceDaily",      url: "https://www.sciencedaily.com/rss/all.xml" },
  { name: "TopDev",            url: "https://topdev.vn/blog/feed/" },
  { name: "Genk AI",  url: "https://genk.vn/rss/ai.rss" },
  { name: "Viblo",    url: "https://viblo.asia/rss/posts/newest.rss" },
];

async function fetchAllAndMix() {
  const allItems = [];

  for (const source of SOURCES) {
    try {
      let feed;
      if (source.name === "Spiderum") {
        const response = await fetch(source.url);
        let text = await response.text();
        text = text.replace(/&(?!(?:amp|lt|gt|quot|#39);)/g, '&amp;');
        feed = await parser.parseString(text);
      } else {
        feed = await parser.parseURL(source.url);
      }

      feed.items.slice(0, 20).forEach(item => {
        if (item.title && item.link) {
          allItems.push({
            title: item.title.trim(),
            link: item.link,
            desc: ((item.contentSnippet || item.content || item['content:encoded'] || '')
              .replace(/<[^>]*>/g, '')
              .slice(0, 150)) + '...',
            date: item.pubDate || item.isoDate || new Date().toISOString(),
            source: source.name
          });
        }
      });
    } catch (err) {
      console.log(`Bỏ qua nguồn ${source.name}:`, err.message);
    }
  }

  return allItems
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 250);
}

router.get('/knowledge', async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = 10;
  const now = Date.now();

  if (cache.items.length > 0 && (now - cache.lastUpdate) < CACHE_TTL) {
    const start = (page - 1) * limit;
    const items = cache.items.slice(start, start + limit);
    return res.json({ items, hasMore: cache.items.length > start + limit });
  }

  try {
    const mixed = await fetchAllAndMix();
    cache.items = mixed;
    cache.lastUpdate = now;

    const start = (page - 1) * limit;
    const items = mixed.slice(start, start + limit);
    res.json({ items, hasMore: mixed.length > start + limit });
  } catch (err) {
    console.error("Lỗi tổng hợp:", err);
    if (cache.items.length > 0) {
      const start = (page - 1) * limit;
      const items = cache.items.slice(start, start + limit);
      res.json({ items, hasMore: cache.items.length > start + limit });
    } else {
      res.json({ items: [], hasMore: false });
    }
  }
});

export default router;
