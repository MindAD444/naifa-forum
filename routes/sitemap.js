import { Router } from "express";
import { SitemapStream, streamToPromise } from "sitemap";
import Post from "../models/Post.js";

const router = Router();

router.get("/sitemap.xml", async (req, res) => {
  try {
    const smStream = new SitemapStream({
      hostname: "https://forum.naifa.site"
    });

    // Static pages
    smStream.write({ url: "/", priority: 1.0 });
    smStream.write({ url: "/home.html", priority: 1.0 });
    smStream.write({ url: "/create.html", priority: 0.8 });
    smStream.write({ url: "/login.html", priority: 0.5 });
    smStream.write({ url: "/register.html", priority: 0.5 });

    // Dynamic posts
    const posts = await Post.find({ approved: true });

    posts.forEach((post) => {
      smStream.write({
        url: `/post.html?id=${post._id}`,
        lastmod: post.updatedAt || post.createdAt,
        changefreq: "weekly",
        priority: 0.8
      });
    });

    smStream.end();
    const sitemap = await streamToPromise(smStream);

    res.header("Content-Type", "application/xml");
    res.send(sitemap.toString());

  } catch (err) {
    console.error("SITEMAP ERROR:", err);
    res.status(500).send("Error generating sitemap");
  }
});

export default router;
